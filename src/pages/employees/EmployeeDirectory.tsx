import React, { useState } from 'react';
import { Employee } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { useToast } from '../../context/ToastContext';
import { 
  Users, Plus, Search, Filter, LayoutGrid, List, 
  Download, Edit3, Trash2, Mail, Phone, MoreHorizontal, 
  Building2, Eye, CheckCircle2, UserCheck, Sparkles
} from 'lucide-react';
import { EmployeeModal } from './EmployeeModal';
import { EmployeeProfileDrawer } from './EmployeeProfileDrawer';

export const EmployeeDirectory: React.FC = () => {
  const { currentCompany, currentUser } = useAuth();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null);

  const employees = storageService.getEmployees(currentCompany?.id);
  const departments = storageService.getDepartments(currentCompany?.id);
  const designations = storageService.getDesignations(currentCompany?.id);

  // Filter employees
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = 
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept = selectedDepartment === 'ALL' || emp.departmentId === selectedDepartment;
    const matchesStatus = selectedStatus === 'ALL' || emp.status === selectedStatus;

    return matchesSearch && matchesDept && matchesStatus;
  });

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    const emp = employees.find(e => e.id === id);
    storageService.deleteEmployee(id);
    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'DELETE_EMPLOYEE',
      category: 'EMPLOYEE',
      details: `Removed employee record: ${emp ? `${emp.firstName} ${emp.lastName}` : id}`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });
    toast.success('Employee Profile Deleted', `${emp ? `${emp.firstName} ${emp.lastName}` : 'Record'} has been removed from workspace.`);
  };

  const handleExportCSV = () => {
    const headers = ['Employee Code', 'First Name', 'Last Name', 'Email', 'Phone', 'Department', 'Designation', 'Joining Date', 'Employment Type', 'Status', 'Basic Salary'];
    const rows = filteredEmployees.map(e => {
      const dept = departments.find(d => d.id === e.departmentId)?.name || '';
      const desig = designations.find(d => d.id === e.designationId)?.title || '';
      return [
        e.employeeCode,
        e.firstName,
        e.lastName,
        e.email,
        e.phone,
        dept,
        desig,
        e.dateOfJoining,
        e.employmentType,
        e.status,
        e.salary?.basic || 50000
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${currentCompany?.slug || 'company'}_employees_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Export Successful', `Exported ${filteredEmployees.length} employee records to CSV.`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'ON_PROBATION': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'ON_LEAVE': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default: return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    }
  };

  return (
    <div className="neo-page neo-employees">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Users className="w-6 h-6 text-brand-400" />
            <span>Employee Directory</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage full employee lifecycle, compensation, roles, and profiles for <strong className="text-slate-200">{employees.length} team members</strong>.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 transition-all flex items-center space-x-1.5 shadow-sm"
            title="Export filtered records to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => {
              setEditingEmployee(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 via-indigo-600 to-purple-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 glass-card p-3.5 rounded-2xl border border-white/10 text-xs shadow-md">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or employee code..."
            className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="flex-1 bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_PROBATION">On Probation</option>
            <option value="ON_LEAVE">On Leave</option>
            <option value="RESIGNED">Resigned</option>
          </select>

          <div className="flex items-center bg-slate-900 rounded-xl border border-slate-800 p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-400 hover:text-white'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-400 hover:text-white'}`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content: Grid or Table */}
      {filteredEmployees.length === 0 ? (
        <div className="p-12 text-center rounded-3xl glass-card border border-white/10">
          <Users className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white">No employees found</h3>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or add a new employee.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredEmployees.map((emp) => {
            const dept = departments.find(d => d.id === emp.departmentId);
            const desig = designations.find(d => d.id === emp.designationId);

            return (
              <div
                key={emp.id}
                className="p-4 rounded-3xl glass-card hover:border-brand-500/40 transition-all hover:-translate-y-1 flex flex-col justify-between group shadow-lg"
              >
                <div>
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60 font-semibold">
                      {emp.employeeCode}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${getStatusBadge(emp.status)}`}>
                      {emp.status}
                    </span>
                  </div>

                  {/* Profile info */}
                  <div className="mt-3 flex items-center space-x-3">
                    <img
                      src={emp.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                      alt={emp.firstName}
                      className="w-12 h-12 rounded-2xl object-cover border border-slate-700 shadow-md"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-white truncate group-hover:text-brand-300 transition-colors">
                        {emp.firstName} {emp.lastName}
                      </h3>
                      <div className="text-[11px] font-medium text-slate-300 truncate">
                        {desig?.title || 'Team Member'}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {dept?.name || 'Department'}
                      </div>
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-400">
                    <div className="flex items-center space-x-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                    <div className="flex items-center space-x-2 truncate">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{emp.phone}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <button
                    onClick={() => setDrawerEmployee(emp)}
                    className="text-brand-400 hover:text-brand-300 font-semibold flex items-center space-x-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Profile</span>
                  </button>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleEdit(emp)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Edit Profile"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove employee ${emp.firstName} ${emp.lastName}?`)) {
                          handleDelete(emp.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                      title="Delete Employee"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="rounded-3xl glass-card border border-white/10 overflow-hidden text-xs shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4">Designation</th>
                  <th className="py-3.5 px-4">Joining Date</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredEmployees.map((emp) => {
                  const dept = departments.find(d => d.id === emp.departmentId);
                  const desig = designations.find(d => d.id === emp.designationId);

                  return (
                    <tr key={emp.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <img
                            src={emp.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                            alt={emp.firstName}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-700"
                          />
                          <div>
                            <div className="font-bold text-white">{emp.firstName} {emp.lastName}</div>
                            <div className="text-[11px] text-slate-400">{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300 font-semibold">{emp.employeeCode}</td>
                      <td className="py-3.5 px-4 text-slate-300">{dept?.name || '—'}</td>
                      <td className="py-3.5 px-4 text-slate-300">{desig?.title || '—'}</td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono">{emp.dateOfJoining}</td>
                      <td className="py-3.5 px-4 text-slate-300">{emp.employmentType}</td>
                      <td className="py-3.5 px-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${getStatusBadge(emp.status)}`}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setDrawerEmployee(emp)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="View 360 Profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(emp)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Remove employee ${emp.firstName} ${emp.lastName}?`)) {
                                handleDelete(emp.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        employeeToEdit={editingEmployee}
        onSaved={() => {
          toast.success('Employee Profile Saved', 'Workforce roster has been synchronized.');
        }}
      />

      {/* 360-Degree Profile Drawer */}
      <EmployeeProfileDrawer
        employee={drawerEmployee}
        onClose={() => setDrawerEmployee(null)}
        onEdit={(emp) => handleEdit(emp)}
        onDelete={(id) => handleDelete(id)}
      />
    </div>
  );
};
