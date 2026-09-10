import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Employee } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

type EnrollmentStatus = {
  enrolled: boolean;
  enrolledAt?: string;
  enrolledBy?: string;
  enrolledByRole?: string;
};

export const FaceEnrollmentPanel: React.FC<{ employee: Employee }> = ({ employee }) => {
  const { currentUser } = useAuth();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const allowed = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(currentUser?.role || '');

  const refresh = useCallback(async () => {
    if (!allowed) return;
    try { setStatus((await api.getFaceEnrollment(employee.id)).data); }
    catch (error) { toast.error('Enrollment status unavailable', error instanceof Error ? error.message : 'Please try again.'); }
  }, [allowed, employee.id, toast]);

  const preview = useMemo(() => photo ? URL.createObjectURL(photo) : null, [photo]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  if (!allowed) return null;

  const enroll = async () => {
    if (!photo || !consented) return;
    setBusy(true);
    try {
      await api.enrollFace(employee.id, photo);
      setPhoto(null);
      setConsented(false);
      if (inputRef.current) inputRef.current.value = '';
      await refresh();
      toast.success('Face enrollment secured', `${employee.firstName}'s approved face is now required for mobile clock-in and clock-out.`);
    } catch (error) {
      toast.error('Face enrollment failed', error instanceof Error ? error.message : 'Use a clearer front-facing photo.');
    } finally { setBusy(false); }
  };

  const revoke = async () => {
    if (!window.confirm(`Disable face attendance for ${employee.firstName} ${employee.lastName}?`)) return;
    setBusy(true);
    try {
      await api.revokeFaceEnrollment(employee.id);
      await refresh();
      toast.success('Face enrollment revoked', 'Mobile attendance is locked until HR or an administrator enrolls a new approved face.');
    } catch (error) {
      toast.error('Could not revoke enrollment', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/15"><ShieldCheck className="w-4 h-4 text-emerald-300" /></div>
          <div>
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Employee Face Enrollment</div>
            <p className="text-[11px] text-slate-400 mt-1">Restricted to HR and administrators. The raw enrollment photo is processed securely and not retained by OrbitHR.</p>
          </div>
        </div>
        <button onClick={() => void refresh()} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" title="Refresh status"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      {status?.enrolled ? (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-300" />
            <div><div className="font-semibold text-emerald-200">Face enrolled</div><div className="text-[10px] text-slate-400">{status.enrolledBy ? `Approved by ${status.enrolledBy}` : 'Approved by HR/Admin'}{status.enrolledAt ? ` · ${new Date(status.enrolledAt).toLocaleString('en-IN')}` : ''}</div></div>
          </div>
          <button disabled={busy} onClick={() => void revoke()} className="p-2 rounded-lg text-rose-300 hover:bg-rose-500/10 disabled:opacity-50" title="Revoke enrollment"><Trash2 className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-amber-200 flex items-center gap-2"><Camera className="w-4 h-4" /><span className="font-semibold">Not enrolled — mobile attendance is locked</span></div>
      )}

      <div className="grid grid-cols-[88px_1fr] gap-3 items-center">
        <button type="button" onClick={() => inputRef.current?.click()} className="h-[88px] rounded-xl border border-dashed border-slate-600 hover:border-emerald-400 bg-slate-900/70 overflow-hidden flex items-center justify-center">
          {preview ? <img src={preview} alt="Enrollment preview" className="w-full h-full object-cover" /> : <Upload className="w-5 h-5 text-slate-400" />}
        </button>
        <div className="space-y-2">
          <input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png" capture="user" onChange={event => setPhoto(event.target.files?.[0] || null)} />
          <button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">{status?.enrolled ? 'Choose replacement photo' : 'Choose enrollment photo'}</button>
          <p className="text-[10px] text-slate-500">One person only, front-facing, neutral expression, good light; JPEG/PNG under 5 MB.</p>
        </div>
      </div>

      <label className="flex items-start gap-2 text-[10px] text-slate-300 cursor-pointer">
        <input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} className="mt-0.5 accent-emerald-500" />
        <span>I confirm the employee has been informed and has consented to biometric face processing for attendance.</span>
      </label>
      <button disabled={!photo || !consented || busy} onClick={() => void enroll()} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        {status?.enrolled ? 'Replace approved face' : 'Enroll approved face'}
      </button>
    </div>
  );
};
