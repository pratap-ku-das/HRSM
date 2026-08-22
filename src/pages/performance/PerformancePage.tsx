import React, { useState } from 'react';
import { PerformanceGoal, PerformanceReview } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  Target, Award, Star, Plus, CheckCircle2, 
  TrendingUp, Clock, AlertTriangle, User, ArrowUpRight
} from 'lucide-react';

export const PerformancePage: React.FC = () => {
  const { currentCompany, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'goals' | 'reviews'>('goals');
  const [isGoalModalOpen, setIsGoalModalOpen] = useState<boolean>(false);

  const [goalTitle, setGoalTitle] = useState<string>('');
  const [goalCategory, setGoalCategory] = useState<PerformanceGoal['category']>('OKR');
  const [goalTargetDate, setGoalTargetDate] = useState<string>('2026-09-30');
  const [goalDesc, setGoalDesc] = useState<string>('');
  const [goalEmpId, setGoalEmpId] = useState<string>('');

  const employees = storageService.getEmployees(currentCompany?.id);
  const goals = storageService.getGoals(currentCompany?.id);

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const newGoal: PerformanceGoal = {
      id: `goal-${Date.now()}`,
      companyId: currentCompany?.id || '',
      employeeId: goalEmpId || employees[0]?.id || 'emp-1',
      title: goalTitle,
      description: goalDesc,
      category: goalCategory,
      targetDate: goalTargetDate,
      progress: 0,
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
    };

    storageService.saveGoal(newGoal);
    setIsGoalModalOpen(false);
    setGoalTitle('');
    setGoalDesc('');
  };

  const handleUpdateProgress = (goal: PerformanceGoal, newProgress: number) => {
    const updated: PerformanceGoal = {
      ...goal,
      progress: newProgress,
      status: newProgress >= 100 ? 'COMPLETED' : goal.status,
    };
    storageService.saveGoal(updated);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'AT_RISK': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default: return 'bg-brand-500/20 text-brand-300 border-brand-500/30';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Target className="w-6 h-6 text-brand-400" />
            <span>Performance & OKR Objectives</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Track key results, quarterly OKRs, and employee continuous appraisal cycles.
          </p>
        </div>

        <button
          onClick={() => {
            if (employees.length > 0) setGoalEmpId(employees[0].id);
            setIsGoalModalOpen(true);
          }}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Set Performance Goal</span>
        </button>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
        {goals.map((goal) => {
          const emp = employees.find(e => e.id === goal.employeeId);

          return (
            <div
              key={goal.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 flex flex-col justify-between shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                    {goal.category}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getStatusBadge(goal.status)}`}>
                    {goal.status}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-white mt-2">{goal.title}</h3>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">{goal.description}</p>

                {/* Progress Bar & Slider */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-[11px] font-semibold">
                    <span className="text-slate-400">Milestone Progress</span>
                    <span className="text-brand-300 font-mono">{goal.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-brand-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={goal.progress}
                    onChange={(e) => handleUpdateProgress(goal, Number(e.target.value))}
                    className="w-full accent-brand-500 h-1 bg-transparent cursor-pointer"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-slate-400">
                <div className="flex items-center space-x-2">
                  <img
                    src={emp?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'}
                    alt="Assignee"
                    className="w-6 h-6 rounded-lg object-cover border border-slate-700"
                  />
                  <span className="text-white font-medium text-[11px] truncate">{emp ? `${emp.firstName} ${emp.lastName}` : 'Assignee'}</span>
                </div>
                <span className="text-[10px] font-mono">Target: {goal.targetDate}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Goal Modal */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsGoalModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Create Performance Goal / OKR</h3>
            <p className="text-xs text-slate-400 mt-0.5">Assign goal to employee with measurable milestone targets.</p>

            <form onSubmit={handleCreateGoal} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Goal Title *</label>
                <input
                  type="text"
                  required
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="e.g. Scale API throughput to 50k req/s"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Assign to Employee</label>
                  <select
                    value={goalEmpId}
                    onChange={(e) => setGoalEmpId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={goalCategory}
                    onChange={(e) => setGoalCategory(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="OKR">Company OKR</option>
                    <option value="PROJECT">Project Delivery</option>
                    <option value="SKILL">Skill & Mastery</option>
                    <option value="LEADERSHIP">Leadership & Mentorship</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Completion Date</label>
                <input
                  type="date"
                  value={goalTargetDate}
                  onChange={(e) => setGoalTargetDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description & Success Criteria</label>
                <textarea
                  rows={3}
                  value={goalDesc}
                  onChange={(e) => setGoalDesc(e.target.value)}
                  placeholder="Measurable objectives and key indicators..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGoalModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Create Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
