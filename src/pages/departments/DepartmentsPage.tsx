import React, { useState } from 'react';
import { Department, Designation } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  GitBranch, Plus, Building2, Users, DollarSign, MapPin, 
  Edit3, Trash2, Shield, Award, Sparkles, X, Check
} from 'lucide-react';

export const DepartmentsPage: React.FC = () => {
  const { currentCompany, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'departments' | 'designations'>('departments');

  const [isDeptModalOpen, setIsDeptModalOpen] = useState<boolean>(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  const [isDesigModalOpen, setIsDesigModalOpen] = useState<boolean>(false);
  const [editingDesig, setEditingDesig] = useState<Designation | null>(null);

  const departments = storageService.getDepartments(currentCompany?.id);
  const designations = storageService.getDesignations(currentCompany?.id);
  const employees = storageService.getEmployees(currentCompany?.id);

  // Department Form State
  const [deptName, setDeptName] = useState<string>('');
  const [deptCode, setDeptCode] = useState<string>('');
  const [deptHeadId, setDeptHeadId] = useState<string>('');
  const [deptBudget, setDeptBudget] = useState<number>(150000);
  const [deptLocation, setDeptLocation] = useState<string>('HQ');
  const [deptDescription, setDeptDescription] = useState<string>('');

  // Designation Form State
  const [desigTitle, setDesigTitle] = useState<string>('');
  const [desigDeptId, setDesigDeptId] = useState<string>('');
  const [desigGrade, setDesigGrade] = useState<string>('L3');
  const [desigMinSal, setDesigMinSal] = useState<number>(80000);
  const [desigMaxSal, setDesigMaxSal] = useState<number>(120000);
  const [desigDesc, setDesigDesc] = useState<string>('');

  const openAddDept = () => {
    setEditingDept(null);
    setDeptName('');
    setDeptCode('');
    setDeptHeadId('');
    setDeptBudget(150000);
    setDeptLocation('Floor 2 - East Wing');
    setDeptDescription('');
    setIsDeptModalOpen(true);
  };

  const openEditDept = (dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptCode(dept.code);
    setDeptHeadId(dept.headEmployeeId || '');
    setDeptBudget(dept.budget);
    setDeptLocation(dept.location);
    setDeptDescription(dept.description);
    setIsDeptModalOpen(true);
  };

  const handleSaveDept = (e: React.FormEvent) => {
    e.preventDefault();
    const newDept: Department = {
      id: editingDept ? editingDept.id : `dept-${Date.now()}`,
      companyId: currentCompany?.id || '',
      name: deptName,
      code: deptCode.toUpperCase(),
      headEmployeeId: deptHeadId || undefined,
      budget: Number(deptBudget),
      location: deptLocation,
      description: deptDescription,
      employeeCount: editingDept ? editingDept.employeeCount : 0,
    };
    storageService.saveDepartment(newDept);
    setIsDeptModalOpen(false);
  };

  const handleDeleteDept = (id: string) => {
    if (confirm('Are you sure you want to delete this department?')) {
      storageService.deleteDepartment(id);
    }
  };

  const openAddDesig = () => {
    setEditingDesig(null);
    setDesigTitle('');
    if (departments.length > 0) setDesigDeptId(departments[0].id);
    setDesigGrade('L3');
    setDesigMinSal(80000);
    setDesigMaxSal(120000);
    setDesigDesc('');
    setIsDesigModalOpen(true);
  };

  const openEditDesig = (desig: Designation) => {
    setEditingDesig(desig);
    setDesigTitle(desig.title);
    setDesigDeptId(desig.departmentId);
    setDesigGrade(desig.gradeLevel);
    setDesigMinSal(desig.minSalary);
    setDesigMaxSal(desig.maxSalary);
    setDesigDesc(desig.description);
    setIsDesigModalOpen(true);
  };

  const handleSaveDesig = (e: React.FormEvent) => {
    e.preventDefault();
    const newDesig: Designation = {
      id: editingDesig ? editingDesig.id : `desig-${Date.now()}`,
      companyId: currentCompany?.id || '',
      title: desigTitle,
      departmentId: desigDeptId || departments[0]?.id || '',
      gradeLevel: desigGrade,
      minSalary: Number(desigMinSal),
      maxSalary: Number(desigMaxSal),
      description: desigDesc,
    };
    storageService.saveDesignation(newDesig);
    setIsDesigModalOpen(false);
  };

  const handleDeleteDesig = (id: string) => {
    if (confirm('Delete this job designation?')) {
      storageService.deleteDesignation(id);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <GitBranch className="w-6 h-6 text-brand-400" />
            <span>Departments & Designations</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Structure your organization hierarchy, team divisions, and job grade levels.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {activeTab === 'departments' ? (
            <button
              onClick={openAddDept}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create Department</span>
            </button>
          ) : (
            <button
              onClick={openAddDesig}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Designation</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-3 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('departments')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
            activeTab === 'departments'
              ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Departments ({departments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('designations')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
            activeTab === 'designations'
              ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Designations & Grades ({designations.length})</span>
        </button>
      </div>

      {/* TAB 1: DEPARTMENTS */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => {
            const headEmp = employees.find(e => e.id === dept.headEmployeeId);
            const count = employees.filter(e => e.departmentId === dept.id).length;

            return (
              <div
                key={dept.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                      {dept.code}
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEditDept(dept)}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDept(dept.id)}
                        className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white mt-3">{dept.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{dept.description}</p>

                  <div className="mt-4 pt-3 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center space-x-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>Headcount:</span>
                      </span>
                      <span className="font-mono font-bold text-white">{count} Employees</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center space-x-1.5">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Annual Budget:</span>
                      </span>
                      <span className="font-mono font-bold text-emerald-400">${dept.budget.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center space-x-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Location:</span>
                      </span>
                      <span className="text-slate-300">{dept.location}</span>
                    </div>
                  </div>
                </div>

                {/* Head of Dept */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center space-x-2.5">
                  <img
                    src={headEmp?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'}
                    alt="Head"
                    className="w-7 h-7 rounded-lg object-cover border border-slate-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-slate-400">Department Lead</div>
                    <div className="text-xs font-bold text-white truncate">
                      {headEmp ? `${headEmp.firstName} ${headEmp.lastName}` : 'Unassigned'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: DESIGNATIONS */}
      {activeTab === 'designations' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden text-xs shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Job Title</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Grade Level</th>
                  <th className="py-3 px-4">Salary Range</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {designations.map((desig) => {
                  const dept = departments.find(d => d.id === desig.departmentId);

                  return (
                    <tr key={desig.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-white">{desig.title}</td>
                      <td className="py-3 px-4 text-slate-300">{dept?.name || '—'}</td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 font-mono font-bold">
                          {desig.gradeLevel}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-400 font-semibold">
                        ${desig.minSalary.toLocaleString()} - ${desig.maxSalary.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{desig.description}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => openEditDesig(desig)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDesig(desig.id)}
                            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Add / Edit Department Modal */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsDeptModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">
              {editingDept ? 'Edit Department' : 'Create Department'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Define division name, code, budget, and department head.</p>

            <form onSubmit={handleSaveDept} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Artificial Intelligence Research"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Code / Prefix *</label>
                  <input
                    type="text"
                    required
                    value={deptCode}
                    onChange={(e) => setDeptCode(e.target.value)}
                    placeholder="AI"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white uppercase font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Annual Budget ($)</label>
                  <input
                    type="number"
                    value={deptBudget}
                    onChange={(e) => setDeptBudget(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Department Lead / Head</label>
                <select
                  value={deptHeadId}
                  onChange={(e) => setDeptHeadId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="">Unassigned</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Location / Office Wing</label>
                <input
                  type="text"
                  value={deptLocation}
                  onChange={(e) => setDeptLocation(e.target.value)}
                  placeholder="Floor 4 - Tech Studio"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  value={deptDescription}
                  onChange={(e) => setDeptDescription(e.target.value)}
                  placeholder="Briefly describe objectives..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Save Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Designation Modal */}
      {isDesigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsDesigModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">
              {editingDesig ? 'Edit Designation' : 'Add New Designation'}
            </h3>

            <form onSubmit={handleSaveDesig} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Job Title *</label>
                <input
                  type="text"
                  required
                  value={desigTitle}
                  onChange={(e) => setDesigTitle(e.target.value)}
                  placeholder="e.g. Lead Cloud Architect"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Department *</label>
                  <select
                    value={desigDeptId}
                    onChange={(e) => setDesigDeptId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Grade Level</label>
                  <select
                    value={desigGrade}
                    onChange={(e) => setDesigGrade(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500 font-mono"
                  >
                    <option value="L1">L1 - Junior</option>
                    <option value="L2">L2 - Mid</option>
                    <option value="L3">L3 - Senior</option>
                    <option value="L4">L4 - Staff / Lead</option>
                    <option value="Executive">Executive / Director</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Min Salary ($)</label>
                  <input
                    type="number"
                    value={desigMinSal}
                    onChange={(e) => setDesigMinSal(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Max Salary ($)</label>
                  <input
                    type="number"
                    value={desigMaxSal}
                    onChange={(e) => setDesigMaxSal(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Role Description</label>
                <textarea
                  rows={2}
                  value={desigDesc}
                  onChange={(e) => setDesigDesc(e.target.value)}
                  placeholder="Responsibilities & domain scope..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDesigModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Save Designation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
