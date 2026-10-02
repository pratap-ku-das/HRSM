import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Briefcase, Plus, RefreshCw, UserCheck, UserPlus } from 'lucide-react';
import { api } from '../../services/api';
import type { Department, Designation, JobApplicant, JobPosting, JobStage } from '../../types';
import { useToast } from '../../context/ToastContext';
import { ConvertCandidateModal } from '../../components/ConvertCandidateModal';

const stages: JobStage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
export const RecruitmentPage: React.FC = () => {
  const toast = useToast();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applicants, setApplicants] = useState<JobApplicant[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'pipeline' | 'jobs'>('pipeline');
  const [job, setJob] = useState({ title: '', departmentId: '', location: 'Remote', experienceLevel: 'Any', minSalary: 0, maxSalary: 0, description: '', requirements: '' });
  const [candidate, setCandidate] = useState({ jobPostingId: '', fullName: '', email: '', source: 'CAREERS_PAGE', experienceYears: 0 });
  const [convertingApplicant, setConvertingApplicant] = useState<JobApplicant | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [workspace, units, titles] = await Promise.all([
        api.getRecruitmentWorkspace(),
        api.getDepartmentsV1(),
        api.getDesignationsV1(),
      ]);
      setJobs(workspace.jobs);
      setApplicants(workspace.applicants);
      setDepartments(units);
      setDesignations(titles);
      setJob(old => ({ ...old, departmentId: old.departmentId || units[0]?.id || '' }));
      setCandidate(old => ({ ...old, jobPostingId: old.jobPostingId || workspace.jobs[0]?.id || '' }));
    } catch (error) {
      toast.error('Recruitment data could not be loaded', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  const jobNames = useMemo(() => new Map(jobs.map(item => [item.id, item.title])), [jobs]);

  const createJob = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createJobV1({
        title: job.title,
        departmentId: job.departmentId,
        location: job.location,
        employmentType: 'FULL_TIME',
        experienceLevel: job.experienceLevel,
        minSalary: Number(job.minSalary),
        maxSalary: Number(job.maxSalary),
        currency: 'INR',
        status: 'OPEN',
        description: job.description,
        requirements: job.requirements.split(',').map(x => x.trim()).filter(Boolean),
      });
      toast.success('Job opening created');
      setJob(old => ({ ...old, title: '', description: '', requirements: '' }));
      await load();
    } catch (error) {
      toast.error('Job could not be created', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const createCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createApplicantV1({ ...candidate, experienceYears: Number(candidate.experienceYears) });
      toast.success('Candidate added');
      setCandidate(old => ({ ...old, fullName: '', email: '' }));
      await load();
    } catch (error) {
      toast.error('Candidate could not be added', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const advance = async (applicant: JobApplicant) => {
    const index = stages.indexOf(applicant.stage);
    const next = stages[Math.min(index + 1, stages.length - 2)];
    if (next === applicant.stage) return;
    try {
      await api.advanceApplicantV1(applicant.id, next);
      await load();
    } catch (error) {
      toast.error('Stage update failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <div className="neo-page neo-recruitment space-y-5">
      <header className="flex flex-wrap justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold flex gap-2">
            <Briefcase className="text-brand-400" /> Recruitment & ATS
          </h1>
          <p className="text-xs text-slate-400">
            Tenant-secured job requisitions, candidate sources, stage history, and 1-click HR conversion.
          </p>
        </div>
        <button onClick={() => void load()} className="p-2 border border-slate-700 rounded-xl">
          <RefreshCw className={`w-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="flex gap-2">
        {(['pipeline', 'jobs'] as const).map(value => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === value ? 'bg-brand-500 text-slate-950' : 'bg-slate-900 border border-slate-800 text-slate-300'}`}
          >
            {value === 'pipeline' ? 'Candidate pipeline' : 'Job openings'}
          </button>
        ))}
      </div>

      {tab === 'pipeline' && (
        <>
          <form onSubmit={createCandidate} className="grid md:grid-cols-6 gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <select required value={candidate.jobPostingId} onChange={e => setCandidate({ ...candidate, jobPostingId: e.target.value })} className="input">
              <option value="">Job</option>
              {jobs.filter(x => x.status === 'OPEN').map(x => (
                <option key={x.id} value={x.id}>{x.title}</option>
              ))}
            </select>
            <input required value={candidate.fullName} onChange={e => setCandidate({ ...candidate, fullName: e.target.value })} placeholder="Candidate name" className="input" />
            <input required type="email" value={candidate.email} onChange={e => setCandidate({ ...candidate, email: e.target.value })} placeholder="Email" className="input" />
            <input value={candidate.source} onChange={e => setCandidate({ ...candidate, source: e.target.value })} placeholder="Source" className="input" />
            <input type="number" min="0" value={candidate.experienceYears} onChange={e => setCandidate({ ...candidate, experienceYears: Number(e.target.value) })} placeholder="Experience" className="input" />
            <button disabled={busy} className="bg-brand-500 rounded-xl flex justify-center items-center gap-2 font-bold text-slate-950">
              <UserPlus className="w-4" /> Add
            </button>
          </form>

          <div className="grid xl:grid-cols-6 gap-3">
            {stages.map(stage => (
              <section key={stage} className="bg-slate-900 border border-slate-800 rounded-2xl p-3 min-h-72 flex flex-col">
                <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
                  <h2 className="text-xs font-bold text-slate-200">{stage.replace('_', ' ')}</h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    {applicants.filter(x => x.stage === stage).length}
                  </span>
                </div>
                <div className="space-y-2 flex-1">
                  {applicants.filter(x => x.stage === stage).map(item => {
                    const isAlreadyHired = item.stage === 'HIRED';
                    return (
                      <article key={item.id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-xs space-y-2">
                        <div>
                          <strong className="block text-slate-200">{item.fullName}</strong>
                          <small className="block text-slate-500">{jobNames.get(item.jobPostingId)} · {item.source || 'Direct'}</small>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-900">
                          {!['HIRED', 'REJECTED'].includes(stage) && (
                            <button
                              onClick={() => void advance(item)}
                              className="text-brand-300 hover:text-brand-200 flex items-center gap-1 text-[11px] font-semibold py-0.5 px-1.5 rounded bg-brand-500/10"
                            >
                              Next <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                          {/* Convert to Employee Action Button */}
                          <button
                            type="button"
                            onClick={() => setConvertingApplicant(item)}
                            className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg transition ${
                              isAlreadyHired
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            <UserCheck className="w-3 h-3" />
                            {isAlreadyHired ? 'Converted / Details' : 'Convert to Employee'}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* Modal */}
          {convertingApplicant && (
            <ConvertCandidateModal
              candidate={convertingApplicant}
              job={jobs.find(j => j.id === convertingApplicant.jobPostingId)}
              departments={departments}
              designations={designations}
              onConverted={() => {
                setConvertingApplicant(null);
                void load();
              }}
              onClose={() => setConvertingApplicant(null)}
            />
          )}
        </>
      )}

      {tab === 'jobs' && (
        <div className="grid lg:grid-cols-[360px_1fr] gap-5">
          <form onSubmit={createJob} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h2 className="font-bold flex gap-2"><Plus className="w-4" /> Create opening</h2>
            <input required value={job.title} onChange={e => setJob({ ...job, title: e.target.value })} placeholder="Title" className="input w-full" />
            <select required value={job.departmentId} onChange={e => setJob({ ...job, departmentId: e.target.value })} className="input w-full">
              {departments.map(x => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
            <input required value={job.location} onChange={e => setJob({ ...job, location: e.target.value })} placeholder="Location" className="input w-full" />
            <input required value={job.experienceLevel} onChange={e => setJob({ ...job, experienceLevel: e.target.value })} placeholder="Experience" className="input w-full" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" value={job.minSalary} onChange={e => setJob({ ...job, minSalary: Number(e.target.value) })} className="input" />
              <input type="number" min="0" value={job.maxSalary} onChange={e => setJob({ ...job, maxSalary: Number(e.target.value) })} className="input" />
            </div>
            <textarea required value={job.description} onChange={e => setJob({ ...job, description: e.target.value })} placeholder="Description" className="input w-full" />
            <input value={job.requirements} onChange={e => setJob({ ...job, requirements: e.target.value })} placeholder="Requirements, comma separated" className="input w-full" />
            <button disabled={busy} className="w-full bg-brand-500 rounded-xl p-2 font-bold text-slate-950">Create</button>
          </form>
          <div className="grid md:grid-cols-2 gap-3">
            {jobs.map(item => (
              <article key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <h3 className="font-bold">{item.title}</h3>
                <p className="text-xs text-slate-400">{item.location} · {item.experienceLevel}</p>
                <p className="text-xs mt-3">{item.description}</p>
                <small className="text-brand-300">{item.applicantCount} applicants · {item.status}</small>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

