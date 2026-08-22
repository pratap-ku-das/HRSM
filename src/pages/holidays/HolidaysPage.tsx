import React, { useState } from 'react';
import { Holiday, Announcement } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  Megaphone, Calendar, Plus, Sparkles, Bell, 
  Flag, AlertCircle, CheckCircle2, X
} from 'lucide-react';

export const HolidaysPage: React.FC = () => {
  const { currentCompany, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'announcements' | 'holidays'>('announcements');

  const [isAncModalOpen, setIsAncModalOpen] = useState<boolean>(false);
  const [ancTitle, setAncTitle] = useState<string>('');
  const [ancContent, setAncContent] = useState<string>('');
  const [ancPriority, setAncPriority] = useState<Announcement['priority']>('NORMAL');

  const [isHolModalOpen, setIsHolModalOpen] = useState<boolean>(false);
  const [holName, setHolName] = useState<string>('');
  const [holDate, setHolDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [holType, setHolType] = useState<Holiday['type']>('NATIONAL');

  const announcements = storageService.getAnnouncements(currentCompany?.id);
  const holidays = storageService.getHolidays(currentCompany?.id);

  const handleCreateAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    const newAnc: Announcement = {
      id: `anc-${Date.now()}`,
      companyId: currentCompany?.id || '',
      title: ancTitle,
      content: ancContent,
      priority: ancPriority,
      authorName: currentUser?.fullName || 'Company Admin',
      authorRole: currentUser?.role || 'Admin',
      createdAt: new Date().toISOString(),
    };

    storageService.saveAnnouncement(newAnc);
    setIsAncModalOpen(false);
    setAncTitle('');
    setAncContent('');
  };

  const handleCreateHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    const newHol: Holiday = {
      id: `hol-${Date.now()}`,
      companyId: currentCompany?.id || '',
      name: holName,
      date: holDate,
      type: holType,
    };

    storageService.saveHoliday(newHol);
    setIsHolModalOpen(false);
    setHolName('');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Megaphone className="w-6 h-6 text-brand-400" />
            <span>Announcements & Company Holidays</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Broadcast company-wide townhall notices and maintain the official paid holiday calendar.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {activeTab === 'announcements' ? (
            <button
              onClick={() => setIsAncModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Post Announcement</span>
            </button>
          ) : (
            <button
              onClick={() => setIsHolModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Holiday</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-3 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('announcements')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
            activeTab === 'announcements'
              ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          <span>Broadcast Feed ({announcements.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('holidays')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
            activeTab === 'holidays'
              ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Holiday Calendar ({holidays.length})</span>
        </button>
      </div>

      {/* TAB 1: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="space-y-4 max-w-4xl">
          {announcements.map((anc) => (
            <div
              key={anc.id}
              className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-sm text-xs"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                    anc.priority === 'HIGH' || anc.priority === 'URGENT'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  }`}>
                    {anc.priority}
                  </span>
                  <h3 className="text-base font-bold text-white">{anc.title}</h3>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(anc.createdAt).toLocaleDateString()}
                </span>
              </div>

              <p className="text-slate-300 leading-relaxed whitespace-pre-line">{anc.content}</p>

              <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center space-x-1.5">
                <span>Broadcast by:</span>
                <strong className="text-slate-200">{anc.authorName}</strong>
                <span>({anc.authorRole})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: HOLIDAYS */}
      {activeTab === 'holidays' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {holidays.map((hol) => (
            <div
              key={hol.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold font-mono">
                  {hol.date.split('-')[2]}
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {hol.type}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white">{hol.name}</h3>
                <div className="text-slate-400 font-mono text-[11px] mt-1">{hol.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Announcement Modal */}
      {isAncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsAncModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Broadcast Announcement</h3>
            <p className="text-xs text-slate-400 mt-0.5">Post an official company notification.</p>

            <form onSubmit={handleCreateAnnouncement} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Title / Headline *</label>
                <input
                  type="text"
                  required
                  value={ancTitle}
                  onChange={(e) => setAncTitle(e.target.value)}
                  placeholder="e.g. 🚀 Q3 Townhall Meeting Scheduled"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Priority</label>
                <select
                  value={ancPriority}
                  onChange={(e) => setAncPriority(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="NORMAL">Normal Notice</option>
                  <option value="HIGH">High Priority</option>
                  <option value="URGENT">Urgent Alert</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Broadcast Content *</label>
                <textarea
                  required
                  rows={4}
                  value={ancContent}
                  onChange={(e) => setAncContent(e.target.value)}
                  placeholder="Share news, schedule updates, or policy changes with the team..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAncModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Post Notice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Holiday Modal */}
      {isHolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsHolModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Add Public / Company Holiday</h3>

            <form onSubmit={handleCreateHoliday} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Holiday Name *</label>
                <input
                  type="text"
                  required
                  value={holName}
                  onChange={(e) => setHolName(e.target.value)}
                  placeholder="e.g. Labor Day"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={holDate}
                    onChange={(e) => setHolDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Type</label>
                  <select
                    value={holType}
                    onChange={(e) => setHolType(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="NATIONAL">National Holiday</option>
                    <option value="COMPANY">Company Floating</option>
                    <option value="REGIONAL">Regional Holiday</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsHolModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
