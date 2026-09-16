import React, { useCallback, useEffect, useState } from 'react';
import { Bell, ChevronDown, Globe, LogOut, Menu, Search, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import type { OrbitNotification } from '../../types';

interface NavbarProps { onOpenRoleSwitcher: () => void; onNavigateToPublic: () => void; activeView: string; setActiveView: (view: string) => void; onOpenCommandPalette?: () => void; onToggleMobileSidebar?: () => void; }

export const Navbar: React.FC<NavbarProps> = ({ onNavigateToPublic, setActiveView, onOpenCommandPalette, onToggleMobileSidebar }) => {
  const { currentUser, logout } = useAuth();
  const toast = useToast();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<OrbitNotification[]>([]);
  const loadNotifications = useCallback(async () => {
    try { setNotifications(await api.getNotifications(true)); }
    catch { setNotifications([]); }
  }, []);
  useEffect(() => { void loadNotifications(); }, [loadNotifications]);

  const signOut = () => { logout(); onNavigateToPublic(); setShowUserMenu(false); toast.info('Logged out from workspace.'); };
  return <header className="app-navbar h-16 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-2xl sticky top-0 z-30 px-3 sm:px-5 md:px-6 flex items-center justify-between">
    <button onClick={onToggleMobileSidebar} className="md:hidden p-2 rounded-xl bg-slate-800 border border-slate-700" aria-label="Toggle navigation"><Menu className="w-5 h-5 text-brand-400" /></button>
    <button onClick={onOpenCommandPalette} className="flex-1 max-w-md mx-3 flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 text-xs"><span className="flex gap-2"><Search className="w-4" />Search people, reports and commands</span><kbd className="hidden md:block">Ctrl+K</kbd></button>
    <div className="flex items-center gap-2">
      <div className="relative">
        <button onClick={() => { setShowNotifications(value => !value); void loadNotifications(); }} className="relative p-2 rounded-xl bg-slate-800 border border-slate-700" aria-label="Notifications"><Bell className="w-4" />{notifications.length > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[9px] grid place-items-center">{notifications.length}</span>}</button>
        {showNotifications && <><button className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} aria-label="Close notifications" /><div className="absolute right-0 mt-2 z-50 w-80 max-h-96 overflow-auto rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-3"><div className="flex justify-between mb-2"><strong className="text-xs">Unread notifications</strong><button className="text-[10px] text-brand-400" onClick={async () => { await api.readAllNotifications(); await loadNotifications(); }}>Mark all read</button></div>{notifications.map(item => <button key={item.id} onClick={async () => { await api.readNotification(item.id); await loadNotifications(); }} className="w-full text-left p-3 border-t border-slate-800"><strong className="block text-xs">{item.title}</strong><span className="text-[11px] text-slate-400">{item.body}</span></button>)}{notifications.length === 0 && <p className="p-4 text-xs text-slate-400">No unread notifications.</p>}</div></>}
      </div>
      <div className="relative"><button onClick={() => setShowUserMenu(value => !value)} className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-800 border border-slate-700"><img src={currentUser?.avatarUrl || '/logo.svg'} alt="" className="w-7 h-7 rounded-lg object-cover" /><ChevronDown className="w-3" /></button>{showUserMenu && <><button className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} aria-label="Close menu" /><div className="absolute right-0 mt-2 z-50 w-56 rounded-2xl bg-slate-900 border border-slate-700 p-2 shadow-2xl"><div className="px-3 py-2 border-b border-slate-800"><strong className="block text-xs">{currentUser?.fullName}</strong><span className="text-[10px] text-slate-400">{currentUser?.email}</span></div><button onClick={() => { setActiveView('settings'); setShowUserMenu(false); }} className="w-full flex gap-2 p-3 text-xs"><UserIcon className="w-4" />Workspace settings</button><button onClick={() => { onNavigateToPublic(); setShowUserMenu(false); }} className="w-full flex gap-2 p-3 text-xs"><Globe className="w-4" />Public site</button><button onClick={signOut} className="w-full flex gap-2 p-3 text-xs text-rose-400"><LogOut className="w-4" />Sign out</button></div></>}</div>
    </div>
  </header>;
};
