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
    <div className="face-enrollment-panel space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 text-slate-900 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="rounded-xl bg-emerald-100 p-2.5"><ShieldCheck className="h-5 w-5 text-emerald-700" /></div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Employee Face Enrollment</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">Capture the employee live. The frame is processed securely for recognition and the raw image is not retained by OrbitHR.</p>
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Refresh status"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {status?.enrolled ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            <div><div className="text-sm font-semibold text-emerald-900">Face enrolled</div><div className="mt-0.5 text-xs text-slate-600">{status.enrolledBy ? `Approved by ${status.enrolledBy}` : 'Approved by HR/Admin'}{status.enrolledAt ? ` · ${new Date(status.enrolledAt).toLocaleString('en-IN')}` : ''}</div></div>
          </div>
          <button type="button" disabled={busy} onClick={() => void revoke()} className="rounded-lg p-2 text-rose-600 hover:bg-rose-100 disabled:text-slate-400" title="Revoke enrollment"><Trash2 className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><Camera className="h-4 w-4" /><span className="text-sm font-semibold">Not enrolled — mobile attendance is locked</span></div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-emerald-700" />
            <div><div className="text-sm font-bold text-slate-900">Live camera enrollment</div><div className="text-xs text-slate-600">Exactly one employee must be visible.</div></div>
          </div>
          {cameraOpen && <button type="button" onClick={stopCamera} className="text-xs font-semibold text-slate-600 hover:text-slate-900">Cancel camera</button>}
        </div>
        {cameraOpen ? (
          <div className="p-3 space-y-3">
            <div className="relative mx-auto max-w-md aspect-[4/3] overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover scale-x-[-1]" />
              <div className="pointer-events-none absolute inset-[12%] rounded-[42%] border-2 border-dashed border-emerald-300/80" />
            </div>
            <div className={`text-center text-sm font-medium ${nativeFaceDetection && faceCount !== 1 ? 'text-amber-700' : 'text-emerald-700'}`}>{detectionMessage}</div>
            <button type="button" disabled={!canCapture} onClick={() => void captureFace()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"><Camera className="h-4 w-4" /> Capture live face</button>
          </div>
        ) : preview ? (
          <div className="p-3 grid grid-cols-[104px_1fr] gap-3 items-center">
            <img src={preview} alt="Live face capture preview" className="h-[104px] w-[104px] rounded-xl object-cover" />
            <div className="space-y-2">
              <div className="text-sm font-semibold text-emerald-800">Live face captured</div>
              <p className="text-xs leading-5 text-slate-600">Review the frame, confirm consent, then enroll it for attendance recognition.</p>
              <button type="button" disabled={busy} onClick={() => void openCamera()} className="text-xs font-semibold text-sky-700 hover:text-sky-900">Retake with camera</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-6 text-center">
            <VideoOff className="mx-auto h-8 w-8 text-slate-400" />
            <p className="text-sm leading-6 text-slate-600">The employee must be physically present for a live camera capture. Photo upload is disabled.</p>
            <button type="button" disabled={busy} onClick={() => void openCamera()} className="mx-auto flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 font-bold text-sky-800 hover:bg-sky-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"><Camera className="h-4 w-4" /> Open front camera</button>
          </div>
        )}
      </div>

      {cameraError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{cameraError}</div>}

      <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-700">
        <input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} className="mt-0.5 accent-emerald-500" />
        <span>I confirm the employee has been informed and has consented to biometric face processing for attendance.</span>
      </label>
      <button type="button" disabled={!photo || !consented || busy} onClick={() => void enroll()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        {status?.enrolled ? 'Replace approved face' : 'Enroll approved face'}
      </button>
    </div>
  );
};
