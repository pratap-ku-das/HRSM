import React from 'react';
import { Employee } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  X, Mail, Phone, Calendar, Briefcase, CreditCard, 
  Building2, Laptop, Heart, CheckCircle2, Shield, 
  MapPin, Edit3, Trash2
} from 'lucide-react';

interface EmployeeProfileDrawerProps {
  employee: Employee | null;
  onClose: () => void;
  onEdit: (emp: Employee) => void;
  onDelete: (id: string) => void;
}

export const EmployeeProfileDrawer: React.FC<EmployeeProfileDrawerProps> = ({
  employee,
  onClose,
  onEdit,
  onDelete,
}) => {
  const { currentCompany } = useAuth();

  if (!employee) return null;

  const department = storageService.getDepartments(currentCompany?.id).find(d => d.id === employee.departmentId);
  const designation = storageService.getDesignations(currentCompany?.id).find(d => d.id === employee.designationId);
  const assignedAssets = storageService.getAssets(currentCompany?.id).filter(a => a.assignedToEmployeeId === employee.id);
  const leaveRequests = storageService.getLeaveRequests(currentCompany?.id).filter(r => r.employeeId === employee.id);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'ON_PROBATION': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'ON_LEAVE': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default: return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col justify-between animate-slide-up">
          {/* Drawer Header */}
          <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 font-semibold">
                {employee.employeeCode}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getStatusBadge(employee.status)}`}>
                {employee.status}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  onEdit(employee);
                  onClose();
                }}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title="Edit Employee"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to remove ${employee.firstName} ${employee.lastName}?`)) {
                    onDelete(employee.id);
                    onClose();
                  }
                }}
                className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                title="Delete Employee"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
            {/* Top Profile Card */}
            <div className="flex items-center space-x-4 p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <img
                src={employee.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                alt={employee.firstName}
                className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shadow-md"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white truncate">
                  {employee.firstName} {employee.lastName}
                </h3>
                <div className="text-xs font-semibold text-brand-400 mt-0.5">
                  {designation?.title || 'Team Member'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center space-x-1.5">
                  <span>{department?.name || 'Department'}</span>
                  <span>•</span>
                  <span>{employee.employmentType}</span>
                </div>
              </div>
            </div>

            {/* Contact & Location Info */}
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 space-y-2.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Contact & Workplace
              </div>
              <div className="flex items-center space-x-3 text-slate-300">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="font-mono">{employee.email}</span>
              </div>
              <div className="flex items-center space-x-3 text-slate-300">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{employee.phone}</span>
              </div>
              <div className="flex items-center space-x-3 text-slate-300">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{employee.workLocation}</span>
              </div>
              <div className="flex items-center space-x-3 text-slate-300">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>Joined on {new Date(employee.dateOfJoining).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>

            {/* Compensation & Salary Breakdown */}
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Compensation Breakdown (Monthly)
                </div>
                <CreditCard className="w-4 h-4 text-brand-400" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Basic Pay</div>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">${employee.salary.basic}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">HRA Allowance</div>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">${employee.salary.hra}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Special Allowances</div>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">${employee.salary.allowances}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">PF & Tax Deductions</div>
                  <div className="text-sm font-bold text-rose-400 font-mono mt-0.5">-${employee.salary.providentFund + employee.salary.taxDeduction}</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                <span className="font-semibold text-emerald-300">Net Monthly Disbursed</span>
                <span className="text-base font-bold text-emerald-400 font-mono">
                  ${(employee.salary.basic + employee.salary.hra + employee.salary.allowances) - (employee.salary.providentFund + employee.salary.taxDeduction)}
                </span>
              </div>
            </div>

            {/* Banking & Statutory Info */}
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Banking & Tax Identity
              </div>
              <div className="flex justify-between py-1 border-b border-slate-700/50">
                <span className="text-slate-400">Bank Name:</span>
                <span className="text-white font-medium">{employee.bankDetails.bankName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-700/50">
                <span className="text-slate-400">Account #:</span>
                <span className="text-white font-mono">{employee.bankDetails.accountNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-700/50">
                <span className="text-slate-400">Routing / IFSC:</span>
                <span className="text-white font-mono">{employee.bankDetails.routingOrIfsc}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Tax Identifier:</span>
                <span className="text-white font-mono">{employee.bankDetails.taxIdentifier}</span>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5 mb-1">
                <Heart className="w-3.5 h-3.5 text-rose-400" />
                <span>Emergency Contact</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-700/50">
                <span className="text-slate-400">Name:</span>
                <span className="text-white font-medium">{employee.emergencyContact.name} ({employee.emergencyContact.relationship})</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Phone:</span>
                <span className="text-white font-mono">{employee.emergencyContact.phone}</span>
              </div>
            </div>

            {/* Assigned Hardware Assets */}
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5 mb-1">
                <Laptop className="w-3.5 h-3.5 text-brand-400" />
                <span>Assigned Hardware & Equipment</span>
              </div>
              {assignedAssets.length === 0 ? (
                <p className="text-slate-400 text-[11px]">No hardware currently checked out to this employee.</p>
              ) : (
                <div className="space-y-2">
                  {assignedAssets.map((asset) => (
                    <div key={asset.id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white">{asset.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">SN: {asset.serialNumber}</div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                        {asset.condition}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Skills & Competencies */}
            {employee.skills && employee.skills.length > 0 && (
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Skills & Endorsements
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {employee.skills.map((skill, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-lg bg-slate-900 text-slate-200 border border-slate-700 text-[11px] font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
