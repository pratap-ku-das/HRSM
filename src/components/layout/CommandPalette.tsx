import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { api } from '../../services/api';

interface Props { isOpen: boolean; onClose: () => void; setActiveView: (view: string) => void; onOpenRoleSwitcher: () => void; }
const navigation = [
  ['dashboard', 'Dashboard'], ['employees', 'Employees'], ['departments', 'Departments'], ['attendance', 'Attendance'],
  ['leaves', 'Leave administration'], ['payroll', 'Payroll'], ['recruitment', 'Recruitment'], ['performance', 'Performance'],
  ['assets', 'Assets'], ['documents', 'Documents'], ['expenses', 'Expenses'], ['approvals', 'Approval inbox'],
  ['governance', 'Reports & governance'], ['security-center', 'Security center'], ['settings', 'Workspace settings'],
] as const;

export const CommandPalette: React.FC<Props> = ({ isOpen, onClose, setActiveView }) => {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Array<{ type: string; id: string; title: string; subtitle: string; route: string }>>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isOpen) { setQuery(''); setRemote([]); window.setTimeout(() => input.current?.focus(), 30); } }, [isOpen]);
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) { setRemote([]); return; }
    const timer = window.setTimeout(() => { void api.universalSearch(query.trim()).then(setRemote).catch(() => setRemote([])); }, 250);
    return () => window.clearTimeout(timer);
  }, [isOpen, query]);
  const items = useMemo(() => {
    const q = query.toLowerCase().trim();
    const local = navigation.filter(([, title]) => !q || title.toLowerCase().includes(q)).map(([route, title]) => ({ id: route, title, subtitle: 'Open module', route }));
    return [...remote.map(item => ({ ...item, id: `${item.type}-${item.id}` })), ...local];
  }, [query, remote]);
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex justify-center pt-24 px-4 bg-slate-950/80 backdrop-blur"><button className="fixed inset-0" onClick={onClose} aria-label="Close search" /><div className="relative w-full max-w-2xl max-h-[70vh] overflow-auto rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl"><div className="sticky top-0 flex gap-3 p-4 bg-slate-900 border-b border-slate-800"><Search className="w-5 text-brand-400" /><input ref={input} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onClose(); }} placeholder="Search authorized people, reports and modules…" className="flex-1 bg-transparent outline-none text-sm" /></div><div className="p-2">{items.map(item => <button key={item.id} onClick={() => { setActiveView(item.route); onClose(); }} className="w-full text-left flex justify-between items-center p-3 rounded-xl hover:bg-slate-800"><span><strong className="block text-xs">{item.title}</strong><small className="text-slate-400">{item.subtitle}</small></span><ArrowRight className="w-4 text-brand-400" /></button>)}{items.length === 0 && <p className="p-8 text-center text-xs text-slate-400">No authorized results.</p>}</div></div></div>;
};
