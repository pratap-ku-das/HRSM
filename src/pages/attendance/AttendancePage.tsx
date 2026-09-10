import React, { useCallback, useEffect, useState } from 'react';
import { AttendanceRecord, AttendanceStatus, AttendanceSource } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { api } from '../../services/api';
import { 
  CalendarCheck, Calendar, Users, Filter, Download, Plus, 
  Clock, AlertCircle, Smartphone, RefreshCw,
  MapPin, Shield, Edit3, X, Check, FileText, ChevronLeft, ChevronRight
} from 'lucide-react';

export const AttendancePage: React.FC = () => {
  const { currentCompany, currentUser } = useAuth();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(todayStr.slice(0, 7));
  const [activeTab, setActiveTab] = useState<'matrix' | 'adjustments' | 'mobile_blueprint'>('matrix');

  // Selected cell for adjustment modal
  const [selectedRecord, setSelectedRecord] = useState<{
    employeeId: string;
    employeeName: string;
    date: string;
    currentRecord?: AttendanceRecord;
  } | null>(null);

  const [adjustmentStatus, setAdjustmentStatus] = useState<AttendanceStatus>('PRESENT');
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');
  const [adjustmentClockIn, setAdjustmentClockIn] = useState<string>('09:00');
  const [adjustmentClockOut, setAdjustmentClockOut] = useState<string>('18:00');
  const [adjustmentFormError, setAdjustmentFormError] = useState<string>('');
  const [adjustmentSaving, setAdjustmentSaving] = useState<boolean>(false);

  // Bulk mark modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkEmployeeId, setBulkEmployeeId] = useState<string>('');
  const [bulkStartDate, setBulkStartDate] = useState<string>(todayStr);
  const [bulkEndDate, setBulkEndDate] = useState<string>(todayStr);
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus>('PRESENT');
  const [bulkClockIn, setBulkClockIn] = useState<string>('09:00');
  const [bulkClockOut, setBulkClockOut] = useState<string>('18:00');
  const [bulkReason, setBulkReason] = useState<string>('Administrative bulk regularization');
  const [bulkFormError, setBulkFormError] = useState<string>('');
  const [bulkSaving, setBulkSaving] = useState<boolean>(false);
  const [liveAttendance, setLiveAttendance] = useState<AttendanceRecord[] | null>(null);
  const [syncError, setSyncError] = useState('');
  const [punchDate, setPunchDate] = useState<string>(todayStr);

  const refreshAttendance = useCallback(async () => {
    if (!currentCompany?.id) return;
    try {
      const records = await api.getAttendanceV1();
      storageService.cacheAttendanceRecords(currentCompany.id, records);
      setLiveAttendance(records);
      setSyncError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Attendance synchronization failed.';
      setSyncError(message);
      console.warn('Live attendance refresh failed:', error);
    }
  }, [currentCompany?.id]);

  useEffect(() => {
    if (!currentCompany?.id) return;
    void refreshAttendance();
    const timer = window.setInterval(refreshAttendance, 30_000);
    const onFocus = () => void refreshAttendance();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentCompany?.id, refreshAttendance]);

  const employees = storageService.getEmployees(currentCompany?.id);
  const departments = storageService.getDepartments(currentCompany?.id);
  const attendanceRecords = liveAttendance !== null
    ? liveAttendance
    : storageService.getAttendanceRecords(currentCompany?.id);

  type DisplayStatus = AttendanceStatus | 'NOT_JOINED' | 'FUTURE' | 'NO_RECORD';

  const getDisplayStatus = (employeeDateOfJoining: string, date: string, dayOfWeek: number, record?: AttendanceRecord): DisplayStatus => {
    if (date < employeeDateOfJoining) return 'NOT_JOINED';
    if (date > todayStr) return 'FUTURE';
    if (record) return record.status;
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'WEEKEND';
    return 'NO_RECORD';
  };

  // Generate days in selected month (e.g. 2026-08)
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();

  const monthDays: { dayNum: number; dateStr: string; dayOfWeek: number; dayLabel: string }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dateStr = `${yearStr}-${monthStr.padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    monthDays.push({
      dayNum: d,
      dateStr,
      dayOfWeek: dateObj.getDay(),
      dayLabel: dateObj.toLocaleDateString('en-IN', { weekday: 'narrow' }),
    });
  }

  const getStatusBadgeStyle = (status: DisplayStatus) => {
    switch (status) {
      case 'PRESENT':
        return 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/40';
      case 'LATE':
        return 'bg-amber-500/25 text-amber-300 border-amber-500/40 hover:bg-amber-500/40';
      case 'HALF_DAY':
        return 'bg-orange-500/25 text-orange-300 border-orange-500/40 hover:bg-orange-500/40';
      case 'LEAVE':
        return 'bg-blue-500/25 text-blue-300 border-blue-500/40 hover:bg-blue-500/40';
      case 'HOLIDAY':
        return 'bg-purple-500/25 text-purple-300 border-purple-500/40 hover:bg-purple-500/40';
      case 'WEEKEND':
        return 'bg-slate-800/40 text-slate-500 border-slate-800 hover:bg-slate-800/60';
      case 'NOT_JOINED':
        return 'bg-slate-950/60 text-slate-600 border-slate-800 cursor-not-allowed';
      case 'FUTURE':
        return 'bg-slate-900/40 text-slate-600 border-slate-800 cursor-not-allowed';
      case 'NO_RECORD':
        return 'bg-slate-800/20 text-slate-500 border-slate-700/50 hover:bg-slate-800/40';
      case 'ABSENT':
      default:
        return 'bg-rose-500/25 text-rose-300 border-rose-500/40 hover:bg-rose-500/40';
    }
  };

  const getStatusAbbr = (status: DisplayStatus) => {
    switch (status) {
      case 'PRESENT': return 'P';
      case 'LATE': return 'L';
      case 'HALF_DAY': return 'HD';
      case 'LEAVE': return 'LV';
      case 'HOLIDAY': return 'H';
      case 'WEEKEND': return '—';
      case 'NOT_JOINED': return 'N/A';
      case 'FUTURE': return '—';
      case 'NO_RECORD': return '·';
      case 'ABSENT': return 'A';
      default: return '—';
    }
  };

  const usesClockTimes = (status: AttendanceStatus) => ['PRESENT', 'LATE', 'HALF_DAY'].includes(status);
  const toIndiaTimeInput = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)) : '';
  const toIndiaTimeWithSeconds = (value?: string) => value ? new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date(value)) : '--';
  const isFiniteCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const toAttendanceInstant = (date: string, time: string) => time ? new Date(`${date}T${time}:00+05:30`).toISOString() : undefined;
  const workedDuration = (record: AttendanceRecord) => {
    if (!record.clockInTime) return '--';
    const start = new Date(record.clockInTime).getTime();
    const end = record.clockOutTime ? new Date(record.clockOutTime).getTime() : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '--';
    const minutes = Math.floor((end - start) / 60_000);
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m${record.clockOutTime ? '' : ' live'}`;
  };
  const selectedPunches = attendanceRecords
    .filter(record => record.date === punchDate && (record.clockInTime || record.clockOutTime))
    .sort((a, b) => String(b.clockInTime || '').localeCompare(String(a.clockInTime || '')));
  const employeeName = (employeeId: string) => {
    const employee = employees.find(item => item.id === employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown employee';
  };
  const employeeCode = (employeeId: string) => employees.find(item => item.id === employeeId)?.employeeCode || employeeId;

  const handleCellClick = (employeeId: string, employeeName: string, date: string) => {
    const record = attendanceRecords.find(a => a.employeeId === employeeId && a.date === date);
    setSelectedRecord({
      employeeId,
      employeeName,
      date,
      currentRecord: record,
    });
    setAdjustmentStatus(record ? record.status : 'PRESENT');
    setAdjustmentReason(record?.correctionNote || '');
    setAdjustmentClockIn(toIndiaTimeInput(record?.clockInTime) || '09:00');
    setAdjustmentClockOut(toIndiaTimeInput(record?.clockOutTime) || '18:00');
    setAdjustmentFormError('');
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    if (usesClockTimes(adjustmentStatus) && (!adjustmentClockIn || !adjustmentClockOut || adjustmentClockOut <= adjustmentClockIn)) {
      setAdjustmentFormError('Clock-out time must be after clock-in time.');
      return;
    }

    const clockInTime = usesClockTimes(adjustmentStatus) ? toAttendanceInstant(selectedRecord.date, adjustmentClockIn) : undefined;
    const clockOutTime = usesClockTimes(adjustmentStatus) ? toAttendanceInstant(selectedRecord.date, adjustmentClockOut) : undefined;

    const newRecord: AttendanceRecord = {
      id: selectedRecord.currentRecord ? selectedRecord.currentRecord.id : `att-${selectedRecord.employeeId}-${selectedRecord.date}`,
      companyId: currentCompany?.id || '',
      employeeId: selectedRecord.employeeId,
      date: selectedRecord.date,
      status: adjustmentStatus,
      clockInTime,
      clockOutTime,
      source: 'WEB_ADMIN',
      correctionNote: adjustmentReason || 'Administrative adjustment',
      correctedBy: currentUser?.fullName || 'Admin',
      createdAt: selectedRecord.currentRecord ? selectedRecord.currentRecord.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setAdjustmentSaving(true);
    const persisted = await storageService.saveAttendanceRecord(newRecord);
    setAdjustmentSaving(false);
    if (!persisted) {
      setAdjustmentFormError('The adjustment could not be saved to the live database. Please try again.');
      await refreshAttendance();
      return;
    }
    setAdjustmentFormError('');
    setSyncError('');
    setLiveAttendance(previous => {
      const records = previous || storageService.getAttendanceRecords(currentCompany?.id);
      const remaining = records.filter(record => !(record.employeeId === newRecord.employeeId && record.date === newRecord.date));
      return [...remaining, newRecord];
    });

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'UPDATE_ATTENDANCE',
      category: 'ATTENDANCE',
      details: `Adjusted attendance for ${selectedRecord.employeeName} on ${selectedRecord.date} to ${adjustmentStatus}${usesClockTimes(adjustmentStatus) ? ` (${adjustmentClockIn} - ${adjustmentClockOut})` : ''}. Reason: ${adjustmentReason || 'Admin adjustment'}`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    setSelectedRecord(null);
  };

  const handleBulkMark = async (e: React.FormEvent) => {
    e.preventDefault();
    const employee = employees.find(item => item.id === bulkEmployeeId);
    if (!employee || bulkStartDate > bulkEndDate) {
      setBulkFormError('Select an employee and a valid date range.');
      return;
    }
    if (usesClockTimes(bulkStatus) && (!bulkClockIn || !bulkClockOut || bulkClockOut <= bulkClockIn)) {
      setBulkFormError('Clock-out time must be after clock-in time.');
      return;
    }
    const dates: string[] = [];
    const end = new Date(`${bulkEndDate}T00:00:00Z`);
    for (let cursor = new Date(`${bulkStartDate}T00:00:00Z`); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      if (date >= employee.dateOfJoining && date <= todayStr) dates.push(date);
    }
    if (dates.length === 0) {
      setBulkFormError('The selected range has no valid attendance dates after the employee joining date.');
      return;
    }

    const newRecords: AttendanceRecord[] = dates.map(date => ({
      id: attendanceRecords.find(record => record.employeeId === employee.id && record.date === date)?.id || `att-${employee.id}-${date}`,
      companyId: currentCompany?.id || '',
      employeeId: employee.id,
      date,
      status: bulkStatus,
      clockInTime: usesClockTimes(bulkStatus) ? toAttendanceInstant(date, bulkClockIn) : undefined,
      clockOutTime: usesClockTimes(bulkStatus) ? toAttendanceInstant(date, bulkClockOut) : undefined,
      source: 'WEB_ADMIN',
      correctionNote: bulkReason,
      correctedBy: currentUser?.fullName || 'Admin',
      createdAt: attendanceRecords.find(record => record.employeeId === employee.id && record.date === date)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    setBulkSaving(true);
    const persisted = await storageService.bulkMarkAttendance(newRecords);
    setBulkSaving(false);
    if (!persisted) {
      setBulkFormError('The bulk adjustment could not be saved to the live database. Please try again.');
      await refreshAttendance();
      return;
    }
    setBulkFormError('');
    setSyncError('');
    setLiveAttendance(previous => {
      const records = previous || storageService.getAttendanceRecords(currentCompany?.id);
      const datesUpdated = new Set(newRecords.map(record => record.date));
      return [...records.filter(record => record.employeeId !== employee.id || !datesUpdated.has(record.date)), ...newRecords];
    });

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'BULK_ATTENDANCE',
      category: 'ATTENDANCE',
      details: `Bulk adjusted ${employee.firstName} ${employee.lastName} from ${bulkStartDate} to ${bulkEndDate} as ${bulkStatus} (${newRecords.length} records).`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    setIsBulkModalOpen(false);
  };

  const handleExportCSV = () => {
    const headers = ['Employee Code', 'Employee Name', 'Department', ...monthDays.map(d => `${d.dateStr} (${d.dayLabel})`)];
    const rows = employees.map(emp => {
      const dept = departments.find(d => d.id === emp.departmentId)?.name || '';
      const dayStatuses = monthDays.map(d => {
        const rec = attendanceRecords.find(a => a.employeeId === emp.id && a.date === d.dateStr);
        return getDisplayStatus(emp.dateOfJoining, d.dateStr, d.dayOfWeek, rec);
      });
      return [emp.employeeCode, `"${emp.firstName} ${emp.lastName}"`, `"${dept}"`, ...dayStatuses].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${currentCompany?.slug || 'company'}_attendance_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="neo-page neo-attendance">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <CalendarCheck className="w-6 h-6 text-brand-400" />
            <span>Attendance & Shift Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Administrative attendance matrix, manual regularization audits, and future-ready mobile biometric architecture.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
          />

          <button
            onClick={() => void refreshAttendance()}
            className="px-3 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center space-x-1.5"
            title="Refresh live attendance"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center space-x-1.5"
            title="Export Monthly Matrix to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            onClick={() => {
              setBulkEmployeeId(current => current || employees[0]?.id || '');
              setBulkFormError('');
              setIsBulkModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Bulk Adjust Employee</span>
          </button>
        </div>
      </div>

      {syncError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
        Live attendance could not refresh: {syncError}
      </div>}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-3 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
            activeTab === 'matrix'
              ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Monthly Attendance Matrix ({selectedMonth})</span>
        </button>

        <button
          onClick={() => setActiveTab('adjustments')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
            activeTab === 'adjustments'
              ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Edit3 className="w-4 h-4" />
          <span>Administrative Adjustments & Audit</span>
        </button>

        <button
          onClick={() => setActiveTab('mobile_blueprint')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
            activeTab === 'mobile_blueprint'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'bg-slate-900 text-purple-300 hover:text-white border border-purple-500/30'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Mobile Face & Location Verification</span>
        </button>
      </div>

      {/* TAB 1: MONTHLY MATRIX */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          {/* Exact mobile punch evidence */}
          <section className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/60">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Live Punch Details
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-400">Exact server time in IST, captured GPS evidence, request IP, device and face-verification status.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Auto-refresh 30s
                </span>
                <input
                  type="date"
                  value={punchDate}
                  max={todayStr}
                  onChange={(event) => setPunchDate(event.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white font-mono focus:outline-none focus:border-emerald-500"
                  aria-label="Punch details date"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/40 text-[10px] text-slate-400 uppercase tracking-wide border-b border-slate-800">
                    <th className="py-2.5 px-4">Employee</th>
                    <th className="py-2.5 px-3">Clock in (IST)</th>
                    <th className="py-2.5 px-3">Clock out (IST)</th>
                    <th className="py-2.5 px-3">Worked</th>
                    <th className="py-2.5 px-3">Verification</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-3">IP address</th>
                    <th className="py-2.5 px-3">Device / source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {selectedPunches.map(record => {
                    const hasLocation = isFiniteCoordinate(record.locationLat) && isFiniteCoordinate(record.locationLng);
                    const mapUrl = hasLocation ? `https://www.google.com/maps?q=${record.locationLat},${record.locationLng}` : '';
                    return (
                      <tr key={record.id} className="hover:bg-slate-800/35 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{employeeName(record.employeeId)}</div>
                          <div className="font-mono text-[10px] text-slate-500">{employeeCode(record.employeeId)}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-emerald-300 whitespace-nowrap">{toIndiaTimeWithSeconds(record.clockInTime)}</td>
                        <td className="py-3 px-3 font-mono text-slate-200 whitespace-nowrap">
                          {record.clockOutTime ? toIndiaTimeWithSeconds(record.clockOutTime) : <span className="text-amber-300">Still clocked in</span>}
                        </td>
                        <td className="py-3 px-3 font-mono text-white whitespace-nowrap">{workedDuration(record)}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold ${record.faceAuthVerified ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                            <Shield className="w-3 h-3" /> {record.faceAuthVerified ? 'Face verified' : 'Not face verified'}
                          </span>
                        </td>
                        <td className="py-3 px-3 min-w-[210px]">
                          {hasLocation ? (
                            <a href={mapUrl} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1.5 text-cyan-300 hover:text-cyan-200">
                              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>
                                <span className="font-mono block">{record.locationLat!.toFixed(6)}, {record.locationLng!.toFixed(6)}</span>
                                <span className="text-[10px] text-slate-500 group-hover:text-slate-400">{record.locationAccuracyMeters ? `Accuracy ±${Math.round(record.locationAccuracyMeters)}m · ` : ''}Open map</span>
                              </span>
                            </a>
                          ) : <span className="text-slate-500">Not captured</span>}
                        </td>
                        <td className="py-3 px-3 font-mono text-[10px] text-slate-300 min-w-[150px]">
                          <div>IN: {record.clockInIpAddress || 'Not recorded'}</div>
                          <div className="mt-1 text-slate-500">OUT: {record.clockOutIpAddress || 'Not recorded'}</div>
                        </td>
                        <td className="py-3 px-3 min-w-[150px]">
                          <div className="font-semibold text-purple-300 text-[10px]">{record.source.replaceAll('_', ' ')}</div>
                          <div className="font-mono text-[9px] text-slate-500 truncate max-w-[170px]" title={record.deviceId || ''}>{record.deviceId || 'No device ID'}</div>
                        </td>
                      </tr>
                    );
                  })}
                  {selectedPunches.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-slate-500">
                        No employee punches were recorded on {punchDate}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Status Legend */}
          <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2">Legend:</span>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded bg-emerald-500/30 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 flex items-center justify-center">P</span>
              <span className="text-slate-300">Present</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded bg-amber-500/30 border border-amber-500/40 text-[10px] font-bold text-amber-300 flex items-center justify-center">L</span>
              <span className="text-slate-300">Late</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded bg-orange-500/30 border border-orange-500/40 text-[10px] font-bold text-orange-300 flex items-center justify-center">HD</span>
              <span className="text-slate-300">Half Day</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded bg-blue-500/30 border border-blue-500/40 text-[10px] font-bold text-blue-300 flex items-center justify-center">LV</span>
              <span className="text-slate-300">Leave</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded bg-rose-500/30 border border-rose-500/40 text-[10px] font-bold text-rose-300 flex items-center justify-center">A</span>
              <span className="text-slate-300">Absent</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-500 flex items-center justify-center">—</span>
              <span className="text-slate-400">Weekend</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded bg-slate-800/30 border border-slate-700 text-[10px] text-slate-400 flex items-center justify-center">·</span>
              <span className="text-slate-400">No record</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-6 h-4 rounded bg-slate-950/50 border border-slate-800 text-[8px] text-slate-500 flex items-center justify-center">N/A</span>
              <span className="text-slate-400">Not employed</span>
            </div>
            <span className="ml-auto text-[11px] text-brand-400">💡 Click any cell to view or adjust record</span>
          </div>

          {/* Matrix Table */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                    <th className="py-3 px-4 sticky left-0 z-20 bg-slate-950 min-w-[180px] border-r border-slate-800">
                      Employee
                    </th>
                    {monthDays.map((d) => (
                      <th
                        key={d.dayNum}
                        className={`py-2 px-1 text-center font-mono min-w-[34px] ${
                          d.dayOfWeek === 0 || d.dayOfWeek === 6 ? 'bg-slate-950/40 text-slate-600' : 'text-slate-300'
                        }`}
                      >
                        <div>{d.dayNum}</div>
                        <div className="text-[9px] text-slate-500 font-normal">{d.dayLabel}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employees.map((emp) => {
                    const dept = departments.find(d => d.id === emp.departmentId);

                    return (
                      <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                        {/* Fixed Employee Column */}
                        <td className="py-2.5 px-4 sticky left-0 z-10 bg-slate-900 border-r border-slate-800 flex items-center space-x-2.5">
                          <img
                            src={emp.avatarUrl}
                            alt={emp.firstName}
                            className="w-7 h-7 rounded-lg object-cover border border-slate-700 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate text-[11px]">
                              {emp.firstName} {emp.lastName}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {emp.employeeCode} • {dept?.code || '—'}
                            </div>
                          </div>
                        </td>

                        {/* Month Days Cells */}
                        {monthDays.map((d) => {
                          const record = attendanceRecords.find(a => a.employeeId === emp.id && a.date === d.dateStr);
                          const isWeekend = d.dayOfWeek === 0 || d.dayOfWeek === 6;
                          const status = getDisplayStatus(emp.dateOfJoining, d.dateStr, d.dayOfWeek, record);
                          const isLocked = status === 'NOT_JOINED' || status === 'FUTURE';
                          const timeSummary = record && (record.clockInTime || record.clockOutTime)
                            ? `${record.clockInTime ? toIndiaTimeInput(record.clockInTime) : '--:--'} - ${record.clockOutTime ? toIndiaTimeInput(record.clockOutTime) : '--:--'}`
                            : '';

                          return (
                            <td
                              key={d.dayNum}
                              onClick={() => !isLocked && handleCellClick(emp.id, `${emp.firstName} ${emp.lastName}`, d.dateStr)}
                              className={`py-1.5 px-0.5 text-center transition-all ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'} ${
                                isWeekend ? 'bg-slate-950/30' : ''
                              }`}
                            >
                              <div
                                className={`w-7 h-7 mx-auto rounded-lg border flex items-center justify-center font-mono font-bold text-[10px] transition-transform hover:scale-110 ${getStatusBadgeStyle(status)}`}
                                title={status === 'NOT_JOINED' ? `${emp.firstName} had not joined yet` : status === 'FUTURE' ? 'Future date' : `${emp.firstName} on ${d.dateStr}: ${status.replace('_', ' ')}${timeSummary ? ` (${timeSummary})` : ''}`}
                              >
                                {getStatusAbbr(status)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ADJUSTMENTS & AUDIT */}
      {activeTab === 'adjustments' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs">
            <h3 className="font-bold text-white">Administrative Attendance Audit Logs</h3>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Every status adjustment, manual regularisation, and bulk mark is permanently recorded with user identity and timestamp.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden text-xs shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-semibold">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Admin User</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {storageService.getAuditLogs(currentCompany?.id)
                    .filter(l => l.category === 'ATTENDANCE')
                    .map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-white">{log.userName}</td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 font-mono font-bold">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{log.details}</td>
                        <td className="py-3 px-4 font-mono text-[10px] text-slate-400">WEB_ADMIN</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MOBILE FACE AND LOCATION VERIFICATION */}
      {activeTab === 'mobile_blueprint' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 border border-purple-500/30 space-y-3">
            <div className="flex items-center space-x-2 text-purple-300 font-bold text-sm">
              <Smartphone className="w-5 h-5" />
              <span>Mobile Face & Location Attendance</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every Android clock-in and clock-out requires a live camera capture that matches the employee's HR/Admin-approved face, plus a fresh precise location. The backend issues a one-time proof, uses server time, and rejects missing, wrong, expired, or reused face verification.
            </p>
          </div>

          {/* Architecture Diagram & Flow */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-bold text-brand-300 flex items-center space-x-1.5">
                <span>1. Mobile Client Capture</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Employee captures one clear, front-facing face. On-device detection requires one centered face and a live blink before securely capturing the verification image.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-bold text-purple-300 flex items-center space-x-1.5">
                <span>2. Multi-Tenant API Verify</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                The server compares that capture only with the logged-in employee's HR/Admin enrollment. A wrong face cannot receive the action- and device-bound proof token.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-bold text-emerald-300 flex items-center space-x-1.5">
                <span>3. Real-Time HR Sync</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                After a successful face match and GPS check, the API consumes the one-time proof, records authoritative server time, and synchronizes the audit evidence to this dashboard.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/20 text-xs flex items-start gap-3">
            <Shield className="w-5 h-5 text-emerald-300 shrink-0" />
            <div><strong className="text-emerald-200">Server-enforced identity matching is active.</strong><p className="text-slate-400 mt-1">Manage each employee's approved face from Employee Directory → View Profile. The former client-trusted simulator endpoint has been permanently retired.</p></div>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setSelectedRecord(null)} />
          <div className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Adjust Attendance Record</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Employee: <strong className="text-white">{selectedRecord.employeeName}</strong> • Date: <strong className="text-brand-300 font-mono">{selectedRecord.date}</strong>
            </p>

            {selectedRecord.currentRecord && (
              <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Captured punch evidence</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  <div><span className="block text-slate-500">Clock in (IST)</span><strong className="font-mono text-emerald-300">{toIndiaTimeWithSeconds(selectedRecord.currentRecord.clockInTime)}</strong></div>
                  <div><span className="block text-slate-500">Clock out (IST)</span><strong className="font-mono text-white">{toIndiaTimeWithSeconds(selectedRecord.currentRecord.clockOutTime)}</strong></div>
                  <div><span className="block text-slate-500">Worked duration</span><strong className="font-mono text-white">{workedDuration(selectedRecord.currentRecord)}</strong></div>
                  <div><span className="block text-slate-500">Face verification</span><strong className={selectedRecord.currentRecord.faceAuthVerified ? 'text-emerald-300' : 'text-slate-400'}>{selectedRecord.currentRecord.faceAuthVerified ? 'Verified' : 'Not verified'}</strong></div>
                  <div className="col-span-2">
                    <span className="block text-slate-500">Location</span>
                    {isFiniteCoordinate(selectedRecord.currentRecord.locationLat) && isFiniteCoordinate(selectedRecord.currentRecord.locationLng)
                      ? <a className="font-mono text-cyan-300 hover:text-cyan-200" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${selectedRecord.currentRecord.locationLat},${selectedRecord.currentRecord.locationLng}`}>{selectedRecord.currentRecord.locationLat.toFixed(6)}, {selectedRecord.currentRecord.locationLng.toFixed(6)}{selectedRecord.currentRecord.locationAccuracyMeters ? ` (±${Math.round(selectedRecord.currentRecord.locationAccuracyMeters)}m)` : ''} · Open map</a>
                      : <strong className="text-slate-500">Not captured</strong>}
                  </div>
                  <div><span className="block text-slate-500">Clock-in IP</span><strong className="font-mono text-white break-all">{selectedRecord.currentRecord.clockInIpAddress || 'Not recorded'}</strong></div>
                  <div><span className="block text-slate-500">Clock-out IP</span><strong className="font-mono text-white break-all">{selectedRecord.currentRecord.clockOutIpAddress || 'Not recorded'}</strong></div>
                  <div className="col-span-2"><span className="block text-slate-500">Device / source</span><strong className="font-mono text-purple-300 break-all">{selectedRecord.currentRecord.deviceId || 'No device ID'} · {selectedRecord.currentRecord.source}</strong></div>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveAdjustment} className="mt-4 space-y-4">
              {adjustmentFormError && (
                <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-300">
                  {adjustmentFormError}
                </div>
              )}
              <div>
                <label className="block text-slate-300 font-medium mb-1">Status</label>
                <select
                  value={adjustmentStatus}
                  onChange={(e) => setAdjustmentStatus(e.target.value as AttendanceStatus)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="PRESENT">Present (Full Day)</option>
                  <option value="LATE">Late Arrival</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="LEAVE">Approved Leave</option>
                  <option value="HOLIDAY">Holiday</option>
                  <option value="ABSENT">Absent (Unexcused)</option>
                </select>
              </div>

              {usesClockTimes(adjustmentStatus) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Clock-in Time *</label>
                    <input
                      type="time"
                      required
                      value={adjustmentClockIn}
                      onChange={(e) => setAdjustmentClockIn(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Clock-out Time *</label>
                    <input
                      type="time"
                      required
                      value={adjustmentClockOut}
                      onChange={(e) => setAdjustmentClockOut(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">Correction / Regularization Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="e.g. Supervisor verified biometric sensor glitch on entrance gate..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                Action will be tagged as <span className="text-brand-300 font-mono font-bold">WEB_ADMIN</span> with audit trail.
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustmentSaving}
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 disabled:cursor-wait text-white rounded-xl font-bold"
                >
                  {adjustmentSaving ? 'Saving...' : 'Save & Log Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk employee date-range adjustment modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsBulkModalOpen(false)} />
          <div className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Bulk Adjust Employee Attendance</h3>
            <p className="text-xs text-slate-400 mt-0.5">Apply clock times and status to one employee across a date range.</p>

            <form onSubmit={handleBulkMark} className="mt-4 space-y-4">
              {bulkFormError && (
                <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-300">
                  {bulkFormError}
                </div>
              )}
              <div>
                <label className="block text-slate-300 font-medium mb-1">Employee *</label>
                <select
                  required
                  value={bulkEmployeeId}
                  onChange={(e) => setBulkEmployeeId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="" disabled>Select an employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName} ({employee.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">From Date *</label>
                  <input
                    type="date"
                    required
                    max={todayStr}
                    value={bulkStartDate}
                    onChange={(e) => setBulkStartDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">To Date *</label>
                  <input
                    type="date"
                    required
                    min={bulkStartDate}
                    max={todayStr}
                    value={bulkEndDate}
                    onChange={(e) => setBulkEndDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Status to Apply</label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as AttendanceStatus)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="PRESENT">Present (Full Day)</option>
                  <option value="LATE">Late Arrival</option>
                  <option value="HOLIDAY">Official Public Holiday</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="LEAVE">Approved Leave</option>
                  <option value="ABSENT">Absent</option>
                </select>
              </div>

              {usesClockTimes(bulkStatus) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Clock-in Time *</label>
                    <input
                      type="time"
                      required
                      value={bulkClockIn}
                      onChange={(e) => setBulkClockIn(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Clock-out Time *</label>
                    <input
                      type="time"
                      required
                      value={bulkClockOut}
                      onChange={(e) => setBulkClockOut(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">Adjustment Reason *</label>
                <textarea
                  required
                  rows={2}
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="Reason for applying this attendance range..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                Existing records in this range will be updated. Future dates and dates before joining are excluded.
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkSaving}
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 disabled:cursor-wait text-white rounded-xl font-bold"
                >
                  {bulkSaving ? 'Applying...' : 'Apply Date Range'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
