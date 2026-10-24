import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  FileCheck2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Lock,
  Bot,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

type Tab = 'reports' | 'documents' | 'security' | 'ai';

export const GovernanceCenterPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('reports');
  const [catalog, setCatalog] = useState<Array<{ key: string; name: string }>>([]);
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [sessions, setSessions] = useState<
    Array<{ id: string; deviceName?: string; createdAt: string; lastUsedAt?: string; expiresAt: string }>
  >([]);
  const [logins, setLogins] = useState<
    Array<{ id: string; email: string; success: boolean; reason?: string; ipAddress: string; createdAt: string }>
  >([]);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; sources: Array<{ type: string; id: string }> } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [c, s, l, d] = await Promise.all([
        api.getReportCatalog(),
        api.getSecuritySessions(),
        api.getLoginHistory(),
        api.getEmployeeDocumentsV1(),
      ]);
      setCatalog(c);
      setSessions(s);
      setLogins(l);
      setDocuments(d);
      if (!selected && c[0]) setSelected(c[0].key);
    } catch (e) {
      toast.error('Governance data could not be loaded', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [selected, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.getReport(selected);
      setRows(res.rows || []);
      toast.success(`Loaded ${res.rows?.length || 0} report record(s).`);
    } catch (e) {
      toast.error('Failed to run report', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<[Tab, string, React.ComponentType<{ className?: string }>]> = [
    ['reports', 'Reports', BarChart3],
    ['documents', 'Compliance documents', FileCheck2],
    ['security', 'Security center', Lock],
    ['ai', 'Orbit AI', Bot],
  ];

  return (
    <div className="neo-page neo-governance space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5 text-slate-900">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-2xs">
              <ShieldCheck className="w-6 h-6" />
            </span>
            Governance Center
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Permission-filtered reports, compliance records, session audits, login history, and governed AI telemetry.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-xs transition disabled:opacity-50"
          title="Refresh governance data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/90 border border-slate-200/80 rounded-2xl w-fit shadow-2xs">
        {tabs.map(([id, label, Icon]) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab: Reports */}
      {tab === 'reports' && (
        <section className="space-y-4">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-3 shadow-xs">
            <div className="flex items-center gap-3 flex-1 min-w-[280px] max-w-xl">
              <div className="relative flex-1">
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-2xs transition"
                >
                  {catalog.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => void run()}
                disabled={busy}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50 shrink-0"
              >
                <BarChart3 className="w-4 h-4" />
                <span>Run</span>
              </button>
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Export:</span>
              {(['CSV', 'XLSX', 'PDF'] as const).map((f) => (
                <button
                  key={f}
                  onClick={async () => {
                    await api.requestReportExport(selected, f);
                    toast.success(`${f} export queued successfully`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 rounded-xl transition shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>{f}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Results Area */}
          {rows.length === 0 ? (
            <div className="p-16 text-center bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-col items-center justify-center">
              <div className="h-14 w-14 rounded-2xl bg-indigo-50 border border-indigo-100/80 flex items-center justify-center text-indigo-600 mb-3 shadow-2xs">
                <BarChart3 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">No report generated yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed text-center">
                Select a certified statutory or operational report register from the dropdown and click <strong>Run</strong> to inspect records.
              </p>
            </div>
          ) : (
            <div className="overflow-auto border border-slate-200/90 rounded-2xl bg-white shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    {Object.keys(rows[0] || {}).map((header) => (
                      <th key={header} className="p-3.5 whitespace-nowrap uppercase tracking-wider text-[11px]">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 transition">
                      {Object.values(r).map((v, j) => (
                        <td key={j} className="p-3.5 whitespace-nowrap">
                          {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tab: Documents */}
      {tab === 'documents' && (
        <section className="space-y-4">
          {documents.length === 0 ? (
            <div className="p-16 text-center bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-col items-center justify-center">
              <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400 mb-3 shadow-2xs">
                <FileCheck2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">No accessible documents</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">
                No employee statutory or compliance documents match your current access boundaries.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((d, i) => (
                <article
                  key={String(d.id || i)}
                  className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-5 shadow-xs transition hover:shadow-sm space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                      <FileCheck2 className="w-4 h-4" />
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 truncate flex-1">{String(d.title)}</h3>
                  </div>
                  <p className="text-xs text-slate-600 font-medium">
                    {String(d.documentType)} · <span className="text-emerald-700 font-semibold">{String(d.verificationStatus)}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                    Expiry: {d.expiryDate ? new Date(String(d.expiryDate)).toLocaleDateString() : 'Not set'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab: Security */}
      {tab === 'security' && (
        <section className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-bold text-sm text-slate-900">Active Sessions</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {sessions.length}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <div key={s.id} className="flex justify-between items-center py-3 text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">{s.deviceName || 'Unknown device'}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Created: {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await api.revokeSecuritySession(s.id);
                      await load();
                      toast.success('Session revoked');
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition shadow-2xs"
                  >
                    Revoke
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <p className="text-xs text-slate-400 py-6 text-center">No active background sessions found.</p>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-bold text-sm text-slate-900">Login History</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Last {logins.length}
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {logins.slice(0, 50).map((x) => (
                <div key={x.id} className="flex justify-between items-center py-2.5 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          x.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {x.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                      <span className="font-medium text-slate-800">{x.email}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {x.ipAddress} · {new Date(x.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {logins.length === 0 && (
                <p className="text-xs text-slate-400 py-6 text-center">No recent login events recorded.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Tab: Orbit AI */}
      {tab === 'ai' && (
        <section className="max-w-3xl bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-bold text-base text-slate-900">Governed Read-Only Assistant</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Answers strictly from records your account is authorized to view. Every query is logged.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && prompt.trim()) {
                  setBusy(true);
                  try {
                    const result = await api.askOrbitAi(prompt);
                    setAnswer(result);
                  } finally {
                    setBusy(false);
                  }
                }
              }}
              placeholder="Ask about headcount, pending approvals, or statutory compliance..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-2xs transition"
            />
            <button
              onClick={async () => {
                if (!prompt.trim()) return;
                setBusy(true);
                try {
                  const result = await api.askOrbitAi(prompt);
                  setAnswer(result);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || !prompt.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span>Ask</span>
            </button>
          </div>

          {answer && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2 animate-in fade-in">
              <p className="text-xs text-slate-800 leading-relaxed font-medium">{answer.answer}</p>
              <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-200/60">
                Sources: {answer.sources.map((s) => `${s.type}:${s.id}`).join(', ') || 'policy help only'}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
