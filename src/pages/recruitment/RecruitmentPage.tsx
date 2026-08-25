import React, { useState } from 'react';
import { JobPosting, JobApplicant, JobStage } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  Briefcase, Plus, Users, Star, ArrowRight, CheckCircle2, 
  Clock, MapPin, DollarSign, X, Check, Eye
} from 'lucide-react';

export const RecruitmentPage: React.FC = () => {
  const { currentCompany, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'pipeline' | 'jobs'>('pipeline');
  const [selectedJobId, setSelectedJobId] = useState<string>('ALL');

  const [isJobModalOpen, setIsJobModalOpen] = useState<boolean>(false);
  const [selectedApplicant, setSelectedApplicant] = useState<JobApplicant | null>(null);

  // Job Modal State
  const [jobTitle, setJobTitle] = useState<string>('');
  const [jobDeptId, setJobDeptId] = useState<string>('');
  const [jobLocation, setJobLocation] = useState<string>('San Francisco / Remote');
  const [jobExp, setJobExp] = useState<string>('3+ Years');
  const [minSal, setMinSal] = useState<number>(100000);
  const [maxSal, setMaxSal] = useState<number>(140000);
  const [jobDesc, setJobDesc] = useState<string>('');

  const departments = storageService.getDepartments(currentCompany?.id);
  const jobPostings = storageService.getJobPostings(currentCompany?.id);
  const applicants = storageService.getJobApplicants(currentCompany?.id);

  const stages: { id: JobStage; label: string; color: string }[] = [
    { id: 'APPLIED', label: 'Applied', color: 'border-slate-700 bg-slate-900' },
    { id: 'SCREENING', label: 'Screening', color: 'border-blue-500/40 bg-blue-950/20' },
    { id: 'INTERVIEW', label: 'Interview Panel', color: 'border-amber-500/40 bg-amber-950/20' },
    { id: 'OFFER', label: 'Offer Stage', color: 'border-purple-500/40 bg-purple-950/20' },
    { id: 'HIRED', label: 'Hired', color: 'border-emerald-500/40 bg-emerald-950/20' },
  ];

  const filteredApplicants = selectedJobId === 'ALL'
    ? applicants
    : applicants.filter(a => a.jobPostingId === selectedJobId);

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault();
    const newJob: JobPosting = {
      id: `job-${Date.now()}`,
      companyId: currentCompany?.id || '',
      title: jobTitle,
      departmentId: jobDeptId || departments[0]?.id || '',
      location: jobLocation,
      employmentType: 'FULL_TIME',
      experienceLevel: jobExp,
      minSalary: Number(minSal),
      maxSalary: Number(maxSal),
      currency: 'USD',
      status: 'OPEN',
      description: jobDesc,
      requirements: ['TypeScript', 'System Architecture', 'Communication'],
      applicantCount: 0,
      postedAt: new Date().toISOString(),
    };

    storageService.saveJobPosting(newJob);

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'CREATE_JOB_POSTING',
      category: 'EMPLOYEE',
      details: `Created new job requisition: ${newJob.title}`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    setIsJobModalOpen(false);
  };

  const handleAdvanceStage = (app: JobApplicant, nextStage: JobStage) => {
    const updated: JobApplicant = {
      ...app,
      stage: nextStage,
    };
    storageService.saveJobApplicant(updated);

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'ADVANCE_CANDIDATE',
      category: 'EMPLOYEE',
      details: `Advanced candidate ${app.fullName} to ${nextStage}`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    if (selectedApplicant?.id === app.id) {
      setSelectedApplicant(updated);
    }
  };

  return (
    <div className="neo-page neo-recruitment">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Briefcase className="w-6 h-6 text-brand-400" />
            <span>Recruitment & ATS Pipeline</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage open job requisitions, candidate pipelines, interview scorecards, and hiring workflows.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              if (departments.length > 0) setJobDeptId(departments[0].id);
              setIsJobModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Job Opening</span>
          </button>
        </div>
      </div>

      {/* Tabs & Job Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 text-xs">
        <div className="flex space-x-2 font-semibold">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === 'pipeline'
                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Kanban Candidate Pipeline ({applicants.length})
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === 'jobs'
                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Open Job Requisitions ({jobPostings.length})
          </button>
        </div>

        {activeTab === 'pipeline' && (
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 text-xs">Filter by Role:</span>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="ALL">All Active Requisitions</option>
              {jobPostings.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: KANBAN PIPELINE */}
      {activeTab === 'pipeline' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageApplicants = filteredApplicants.filter(a => a.stage === stage.id);

            return (
              <div
                key={stage.id}
                className={`p-3.5 rounded-2xl border ${stage.color} flex flex-col min-h-[450px] shadow-sm`}
              >
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-200">{stage.label}</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {stageApplicants.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                  {stageApplicants.map((app) => {
                    const job = jobPostings.find(j => j.id === app.jobPostingId);

                    return (
                      <div
                        key={app.id}
                        onClick={() => setSelectedApplicant(app)}
                        className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:-translate-y-0.5 space-y-2 group shadow-sm text-xs"
                      >
                        <div className="flex items-start justify-between">
                          <div className="font-bold text-white group-hover:text-brand-300 transition-colors">
                            {app.fullName}
                          </div>
                          <div className="flex items-center text-amber-400 text-[10px]">
                            <Star className="w-3 h-3 fill-amber-400 mr-0.5" />
                            <span>{app.rating}.0</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-400 truncate">
                          {job?.title || 'Open Role'}
                        </div>

                        <p className="text-[10px] text-slate-400 line-clamp-2 italic">
                          "{app.notes}"
                        </p>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                          <span>{app.experienceYears}y exp</span>
                          <span className="text-brand-400 font-semibold flex items-center space-x-0.5">
                            <span>Scorecard</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: JOB OPENINGS LIST */}
      {activeTab === 'jobs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {jobPostings.map((job) => {
            const dept = departments.find(d => d.id === job.departmentId);

            return (
              <div
                key={job.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">{job.title}</h3>
                    <div className="text-slate-400 text-xs mt-0.5">
                      {dept?.name} • {job.location}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {job.status}
                  </span>
                </div>

                <p className="text-slate-300 leading-relaxed">{job.description}</p>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-slate-400">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-emerald-400 font-bold">
                      ${job.minSalary.toLocaleString()} - ${job.maxSalary.toLocaleString()}
                    </span>
                    <span>•</span>
                    <span>{job.experienceLevel}</span>
                  </div>
                  <span className="font-semibold text-brand-300">
                    {job.applicantCount || 3} Applicants
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Candidate Scorecard Drawer */}
      {selectedApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setSelectedApplicant(null)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">{selectedApplicant.fullName}</h3>
                <p className="text-slate-400 text-xs">{selectedApplicant.email} • {selectedApplicant.phone}</p>
              </div>
              <button onClick={() => setSelectedApplicant(null)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase">Interview Notes & Evaluation</div>
              <p className="text-slate-300 italic">{selectedApplicant.notes}</p>
              <div className="text-amber-400 font-bold flex items-center pt-1">
                <Star className="w-4 h-4 fill-amber-400 mr-1" />
                <span>Overall Assessment: {selectedApplicant.rating} / 5</span>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Move Candidate to Next Stage</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleAdvanceStage(selectedApplicant, 'INTERVIEW')}
                  className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 font-semibold text-center"
                >
                  Interview Panel
                </button>
                <button
                  onClick={() => handleAdvanceStage(selectedApplicant, 'OFFER')}
                  className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 font-semibold text-center"
                >
                  Draft Offer
                </button>
                <button
                  onClick={() => handleAdvanceStage(selectedApplicant, 'HIRED')}
                  className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 font-semibold text-center"
                >
                  Hire & Onboard
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedApplicant(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Job Opening Modal */}
      {isJobModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsJobModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Create New Job Opening</h3>
            <p className="text-xs text-slate-400 mt-0.5">Post a new job requisition to attract and track talent.</p>

            <form onSubmit={handleCreateJob} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Job Title *</label>
                <input
                  type="text"
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Department</label>
                  <select
                    value={jobDeptId}
                    onChange={(e) => setJobDeptId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Experience Level</label>
                  <input
                    type="text"
                    value={jobExp}
                    onChange={(e) => setJobExp(e.target.value)}
                    placeholder="3-5 Years"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Min Annual Salary ($)</label>
                  <input
                    type="number"
                    value={minSal}
                    onChange={(e) => setMinSal(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Max Annual Salary ($)</label>
                  <input
                    type="number"
                    value={maxSal}
                    onChange={(e) => setMaxSal(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Job Description</label>
                <textarea
                  rows={3}
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  placeholder="Key responsibilities and goals..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsJobModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Create Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
