import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, RefreshCw, ScanFace, ShieldCheck, Trash2, VideoOff } from 'lucide-react';
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

type BrowserFaceDetector = { detect: (source: CanvasImageSource) => Promise<unknown[]> };
type BrowserFaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => BrowserFaceDetector;

declare global {
  interface Window { FaceDetector?: BrowserFaceDetectorConstructor }
}

export const FaceEnrollmentPanel: React.FC<{ employee: Employee }> = ({ employee }) => {
  const { currentUser } = useAuth();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [faceCount, setFaceCount] = useState<number | null>(null);
  const allowed = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(currentUser?.role || '');

  const refresh = useCallback(async () => {
    if (!allowed) return;
    try { setStatus((await api.getFaceEnrollment(employee.id)).data); }
    catch (error) { toast.error('Enrollment status unavailable', error instanceof Error ? error.message : 'Please try again.'); }
  }, [allowed, employee.id, toast]);

  const preview = useMemo(() => photo ? URL.createObjectURL(photo) : null, [photo]);

  const stopCamera = useCallback(() => {
    if (detectionTimerRef.current !== null) {
      window.clearTimeout(detectionTimerRef.current);
      detectionTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraReady(false);
    setFaceCount(null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);
  useEffect(() => () => {
    if (detectionTimerRef.current !== null) window.clearTimeout(detectionTimerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);
  useEffect(() => {
    setPhoto(null);
    setCameraError('');
    stopCamera();
  }, [employee.id, stopCamera]);

  if (!allowed) return null;

  const openCamera = async () => {
    stopCamera();
    setPhoto(null);
    setCameraError('');
    setCameraOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(false);
      setCameraError('This browser does not support camera access. Use a current Chrome, Edge, or Safari browser over HTTPS.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error('Camera preview could not be initialized.');
      video.srcObject = stream;
      await video.play();
      setCameraReady(true);
      if (window.FaceDetector) {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
        const scan = async () => {
          const activeVideo = videoRef.current;
          if (!streamRef.current || !activeVideo || activeVideo.readyState < 2) return;
          try {
            const faces = await detector.detect(activeVideo);
            setFaceCount(faces.length);
          } catch {
            setFaceCount(null);
          }
          if (streamRef.current) detectionTimerRef.current = window.setTimeout(() => { void scan(); }, 350);
        };
        void scan();
      }
    } catch (error) {
      stopCamera();
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setCameraError(denied
        ? 'Camera permission was denied. Allow camera access in the browser address bar and try again.'
        : error instanceof Error ? error.message : 'Unable to open the camera.');
    }
  };

  const captureFace = async () => {
    const video = videoRef.current;
    if (!video || !cameraReady || (window.FaceDetector && faceCount !== 1)) return;
    if (!video.videoWidth || !video.videoHeight) {
      setCameraError('The camera is still starting. Please try again in a moment.');
      return;
    }
    const scale = Math.min(1, 1280 / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('The camera frame could not be captured.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      setCameraError('The camera frame could not be captured.');
      return;
    }
    setPhoto(new File([blob], `${employee.employeeCode}-live-face.jpg`, { type: 'image/jpeg' }));
    setCameraError('');
    stopCamera();
  };

  const enroll = async () => {
    if (!photo || !consented) return;
    setBusy(true);
    try {
      await api.enrollFace(employee.id, photo);
      setPhoto(null);
      setConsented(false);
      stopCamera();
      await refresh();
      toast.success('Face enrollment secured', `${employee.firstName}'s live-captured face is now required for mobile clock-in and clock-out.`);
    } catch (error) {
      toast.error('Face enrollment failed', error instanceof Error ? error.message : 'Use better lighting and keep exactly one face visible.');
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

  const nativeFaceDetection = Boolean(window.FaceDetector);
  const canCapture = cameraReady && (!nativeFaceDetection || faceCount === 1);
  const detectionMessage = !nativeFaceDetection
    ? 'Camera ready — the secure server will validate one clear face.'
    : faceCount === 1
      ? 'One face detected — ready to capture.'
      : faceCount === 0
        ? 'No face detected. Center the employee in the frame.'
        : faceCount !== null && faceCount > 1
          ? 'Multiple faces detected. Only the employee may be visible.'
          : 'Detecting face…';

  return (
    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/15"><ShieldCheck className="w-4 h-4 text-emerald-300" /></div>
          <div>
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Employee Face Enrollment</div>
            <p className="text-[11px] text-slate-400 mt-1">Capture the employee live. The frame is processed securely for recognition and the raw image is not retained by OrbitHR.</p>
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" title="Refresh status"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      {status?.enrolled ? (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-300" />
            <div><div className="font-semibold text-emerald-200">Face enrolled</div><div className="text-[10px] text-slate-400">{status.enrolledBy ? `Approved by ${status.enrolledBy}` : 'Approved by HR/Admin'}{status.enrolledAt ? ` · ${new Date(status.enrolledAt).toLocaleString('en-IN')}` : ''}</div></div>
          </div>
          <button type="button" disabled={busy} onClick={() => void revoke()} className="p-2 rounded-lg text-rose-300 hover:bg-rose-500/10 disabled:opacity-50" title="Revoke enrollment"><Trash2 className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-amber-200 flex items-center gap-2"><Camera className="w-4 h-4" /><span className="font-semibold">Not enrolled — mobile attendance is locked</span></div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-950/40 overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-3 border-b border-slate-700/70">
          <div className="flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-emerald-300" />
            <div><div className="text-xs font-bold text-slate-100">Live camera enrollment</div><div className="text-[10px] text-slate-400">Exactly one employee must be visible.</div></div>
          </div>
          {cameraOpen && <button type="button" onClick={stopCamera} className="text-[10px] font-semibold text-slate-300 hover:text-white">Cancel camera</button>}
        </div>
        {cameraOpen ? (
          <div className="p-3 space-y-3">
            <div className="relative mx-auto max-w-md aspect-[4/3] overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover scale-x-[-1]" />
              <div className="pointer-events-none absolute inset-[12%] rounded-[42%] border-2 border-dashed border-emerald-300/80" />
            </div>
            <div className={`text-center text-[11px] ${nativeFaceDetection && faceCount !== 1 ? 'text-amber-300' : 'text-emerald-300'}`}>{detectionMessage}</div>
            <button type="button" disabled={!canCapture} onClick={() => void captureFace()} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2"><Camera className="w-4 h-4" /> Capture live face</button>
          </div>
        ) : preview ? (
          <div className="p-3 grid grid-cols-[104px_1fr] gap-3 items-center">
            <img src={preview} alt="Live face capture preview" className="h-[104px] w-[104px] rounded-xl object-cover" />
            <div className="space-y-2">
              <div className="text-xs font-semibold text-emerald-300">Live face captured</div>
              <p className="text-[10px] text-slate-400">Review the frame, confirm consent, then enroll it for attendance recognition.</p>
              <button type="button" disabled={busy} onClick={() => void openCamera()} className="text-[11px] font-semibold text-sky-300 hover:text-sky-200">Retake with camera</button>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center space-y-3">
            <VideoOff className="w-7 h-7 text-slate-500 mx-auto" />
            <p className="text-[11px] text-slate-400">The employee must be physically present for a live camera capture. Photo upload is disabled.</p>
            <button type="button" disabled={busy} onClick={() => void openCamera()} className="mx-auto px-4 py-2.5 rounded-xl bg-sky-500/15 text-sky-200 border border-sky-400/30 hover:bg-sky-500/25 font-bold flex items-center justify-center gap-2"><Camera className="w-4 h-4" /> Open front camera</button>
          </div>
        )}
      </div>

      {cameraError && <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-[11px] text-rose-200">{cameraError}</div>}

      <label className="flex items-start gap-2 text-[10px] text-slate-300 cursor-pointer">
        <input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} className="mt-0.5 accent-emerald-500" />
        <span>I confirm the employee has been informed and has consented to biometric face processing for attendance.</span>
      </label>
      <button type="button" disabled={!photo || !consented || busy} onClick={() => void enroll()} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        {status?.enrolled ? 'Replace approved face' : 'Enroll approved face'}
      </button>
    </div>
  );
};
