import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

type Setup = { secret: string; otpauthUri: string; qrCode: string };

export const SecurityCenterPage: React.FC = () => {
  const toast = useToast();
  const [sessions, setSessions] = useState<Array<{ id: string; deviceName?: string; createdAt: string; lastUsedAt?: string; expiresAt: string }>>([]);
  const [logins, setLogins] = useState<Array<{ id: string; email: string; success: boolean; reason?: string; ipAddress: string; createdAt: string }>>([]);
  const [mfa, setMfa] = useState<{ enabled: boolean; verifiedAt?: string }>({ enabled: false });
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [sessionData, loginData, mfaData] = await Promise.all([
        api.getSecuritySessions(),
        api.getLoginHistory(),
        api.getMfaStatus(),
      ]);
      setSessions(sessionData);
      setLogins(loginData);
      setMfa(mfaData);
    } catch (error) {
      toast.error('Security center could not load', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginSetup = async () => {
    setBusy(true);
    try {
      const value = await api.setupMfa();
      const qrCode = await QRCode.toDataURL(value.otpauthUri, {
        width: 240,
        margin: 2,
        color: { dark: '#24153d', light: '#ffffff' },
      });
      setSetup({ ...value, qrCode });
      setCode('');
    } catch (error) {
      toast.error('MFA setup could not start', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await api.confirmMfa(code);
      setSetup(null);
      setCode('');
      await load();
      toast.success('Authenticator MFA enabled', 'Your next sign-in will require a six-digit authenticator code.');
    } catch (error) {
      toast.error('MFA code was not accepted', error instanceof Error ? error.message : 'Try the current code again.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await api.disableMfa(code);
      api.clearV1Session();
      window.location.reload();
    } catch (error) {
      toast.error('MFA could not be disabled', error instanceof Error ? error.message : 'Try the current code again.');
      setBusy(false);
    }
  };

  return (
    <div className="neo-page neo-security space-y-5">
      <header className="flex justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="flex gap-2 text-2xl font-bold"><ShieldCheck className="text-brand-400" />Security Center</h1>
          <p className="text-xs text-slate-400">Authenticator MFA, active devices, login history and session revocation.</p>
        </div>
        <button type="button" onClick={() => void load()} aria-label="Refresh security center"><RefreshCw className={busy ? 'animate-spin' : ''} /></button>
      </header>

      <section className="mfa-card rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mfa-heading">
          <span className="mfa-heading-icon"><KeyRound className="h-6 w-6" /></span>
          <div>
            <h2 className="font-bold">Authenticator MFA</h2>
            <p className="mt-1 text-xs text-slate-400">
              Protect this account with Google Authenticator, Microsoft Authenticator, Authy or another TOTP app.
            </p>
          </div>
          <span className={`mfa-status ${mfa.enabled ? 'is-enabled' : ''}`}>
            {mfa.enabled ? 'Enabled' : 'Not enabled'}
          </span>
        </div>

        {!mfa.enabled && !setup && (
          <div className="mfa-start">
            <ol>
              <li>Install or open an authenticator app on your phone.</li>
              <li>Scan the QR code generated for your OrbitHR account.</li>
              <li>Enter the current six-digit code to activate MFA.</li>
            </ol>
            <button type="button" onClick={() => void beginSetup()} disabled={busy} className="rounded-xl bg-brand-500 px-5 py-3 text-white">
              {busy ? 'Preparing...' : 'Set up authenticator'}
            </button>
          </div>
        )}

        {setup && (
          <div className="mfa-setup">
            <div className="mfa-qr-panel">
              <span className="mfa-step">Step 1</span>
              <h3>Scan this QR code</h3>
              <img src={setup.qrCode} alt="Authenticator MFA QR code" />
              <p>In your authenticator app, choose Add account and scan a QR code.</p>
            </div>
            <div className="mfa-confirm-panel">
              <span className="mfa-step">Step 2</span>
              <h3>Enter the verification code</h3>
              <p>Enter the current six-digit code shown by your authenticator app.</p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="mfa-code-input"
              />
              <button type="button" onClick={() => void confirm()} disabled={busy || code.length !== 6} className="rounded-xl bg-brand-500 px-5 py-3 text-white">
                Verify and enable MFA
              </button>
              <details className="mfa-manual-key">
                <summary>Cannot scan? Use setup key</summary>
                <div><code>{setup.secret}</code><button type="button" onClick={() => void navigator.clipboard.writeText(setup.secret)} aria-label="Copy setup key"><Copy className="h-4 w-4" /></button></div>
              </details>
              <button type="button" onClick={() => { setSetup(null); setCode(''); }} className="text-xs text-slate-500">Cancel setup</button>
            </div>
          </div>
        )}

        {mfa.enabled && (
          <div className="mfa-enabled-panel">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" />MFA is protecting your account</h3>
              <p className="mt-1 text-xs text-slate-500">Enabled {mfa.verifiedAt ? new Date(mfa.verifiedAt).toLocaleString() : 'successfully'}. A current code is required to disable it.</p>
            </div>
            <div className="mfa-disable-controls">
              <input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Current 6-digit code" />
              <button type="button" onClick={() => void disable()} disabled={busy || code.length !== 6} className="rounded-xl bg-rose-600 px-4 py-2 text-white">Disable MFA and sign out</button>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="flex gap-2 font-bold"><Smartphone />Active sessions</h2>
          {sessions.map((session) => <div key={session.id} className="flex justify-between border-t border-slate-800 py-3 text-xs"><span>{session.deviceName || 'Unknown device'}<small className="block text-slate-500">{new Date(session.createdAt).toLocaleString()}</small></span><button type="button" onClick={async () => { await api.revokeSecuritySession(session.id); await load(); }} className="text-rose-500">Revoke</button></div>)}
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-bold">Login history</h2>
          {logins.map((login) => <div key={login.id} className="border-t border-slate-800 py-3 text-xs"><span className={login.success ? 'text-emerald-600' : 'text-rose-600'}>{login.success ? 'SUCCESS' : 'FAILED'}</span> {'\u00b7'} {login.email}<small className="block text-slate-500">{login.reason || 'Authenticated'} {'\u00b7'} {login.ipAddress} {'\u00b7'} {new Date(login.createdAt).toLocaleString()}</small></div>)}
        </section>
      </div>
    </div>
  );
};
