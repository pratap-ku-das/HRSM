import React, { useState } from 'react';
import { AttendanceRecord, AttendanceStatus, AttendanceSource } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  CalendarCheck, Calendar, Users, Filter, Download, Plus, 
  Clock, CheckCircle2, AlertCircle, Sparkles, Smartphone, 
  MapPin, Shield, Edit3, X, Check, FileText, ChevronLeft, ChevronRight, Terminal
} from 'lucide-react';

export const AttendancePage: React.FC = () => {
  const { currentCompany, currentUser } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-08');
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

  // Bulk mark modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkDate, setBulkDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [bulkDeptId, setBulkDeptId] = useState<string>('ALL');
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus>('PRESENT');

  // Mobile API Payload Simulator state
  const [simEmployeeId, setSimEmployeeId] = useState<string>('');
  const [simConfidence, setSimConfidence] = useState<number>(98.4);
  const [simResponse, setSimResponse] = useState<any | null>(null);

  const employees = storageService.getEmployees(currentCompany?.id);
  const departments = storageService.getDepartments(currentCompany?.id);
  const attendanceRecords = storageService.getAttendanceRecords(currentCompany?.id);

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
      dayLabel: dateObj.toLocaleDateString('en-US', { weekday: 'narrow' }),
    });
  }

  const getStatusBadgeStyle = (status: AttendanceStatus) => {
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
      case 'ABSENT':
      default:
        return 'bg-rose-500/25 text-rose-300 border-rose-500/40 hover:bg-rose-500/40';
    }
  };

  const getStatusAbbr = (status: AttendanceStatus) => {
    switch (status) {
      case 'PRESENT': return 'P';
      case 'LATE': return 'L';
      case 'HALF_DAY': return 'HD';
      case 'LEAVE': return 'LV';
      case 'HOLIDAY': return 'H';
      case 'WEEKEND': return '—';
      case 'ABSENT': return 'A';
      default: return '—';
    }
  };

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
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    const newRecord: AttendanceRecord = {
      id: selectedRecord.currentRecord ? selectedRecord.currentRecord.id : `att-${selectedRecord.employeeId}-${selectedRecord.date}`,
      companyId: currentCompany?.id || '',
      employeeId: selectedRecord.employeeId,
      date: selectedRecord.date,
      status: adjustmentStatus,
      source: 'WEB_ADMIN',
      correctionNote: adjustmentReason || 'Administrative adjustment',
      correctedBy: currentUser?.fullName || 'Admin',
      createdAt: selectedRecord.currentRecord ? selectedRecord.currentRecord.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storageService.saveAttendanceRecord(newRecord);

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'UPDATE_ATTENDANCE',
      category: 'ATTENDANCE',
      details: `Adjusted attendance for ${selectedRecord.employeeName} on ${selectedRecord.date} to ${adjustmentStatus}. Reason: ${adjustmentReason || 'Admin adjustment'}`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    setSelectedRecord(null);
  };

  const handleBulkMark = (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmployees = bulkDeptId === 'ALL'
      ? employees
      : employees.filter(e => e.departmentId === bulkDeptId);

    const newRecords: AttendanceRecord[] = targetEmployees.map(emp => ({
      id: `att-${emp.id}-${bulkDate}`,
      companyId: currentCompany?.id || '',
      employeeId: emp.id,
      date: bulkDate,
      status: bulkStatus,
      source: 'WEB_ADMIN',
      correctionNote: `Bulk marked for department: ${bulkDeptId}`,
      correctedBy: currentUser?.fullName || 'Admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    storageService.bulkMarkAttendance(newRecords);

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'BULK_ATTENDANCE',
      category: 'ATTENDANCE',
      details: `Bulk marked ${targetEmployees.length} employees on ${bulkDate} as ${bulkStatus}.`,
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
        return rec ? rec.status : (d.dayOfWeek === 0 || d.dayOfWeek === 6 ? 'WEEKEND' : 'PRESENT');
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

  const handleSimulateMobileAuth = () => {
    const empId = simEmployeeId || (employees[0]?.id || 'emp-1');
    const emp = employees.find(e => e.id === empId);

    const payload = {
      status: 'SUCCESS',
      statusCode: 200,
      timestamp: new Date().toISOString(),
      verifiedRecord: {
        companyId: currentCompany?.id,
        employeeId: empId,
        employeeName: `${emp?.firstName} ${emp?.lastName}`,
        date: new Date().toISOString().split('T')[0],
        clockInTime: '09:02:14',
        faceAuthVerified: true,
        confidenceScore: simConfidence,
        deviceId: 'MOBILE-DEVICE-IOS-IPHONE15PRO-9842',
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          geofenceStatus: 'INSIDE_OFFICE_PERIMETER (Radius 50m)',
        },
        source: 'MOBILE_FACE',
      },
      auditNotice: 'This endpoint is pre-architected in Phase 4 schema and awaits Phase 6 client app deployment.',
    };

    setSimResponse(payload);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
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
            onClick={handleExportCSV}
            className="px-3 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center space-x-1.5"
            title="Export Monthly Matrix to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Bulk Mark Attendance</span>
          </button>
        </div>
      </div>

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
          <span>⚡ Phase 6 Mobile Face-Auth Schema Inspector</span>
        </button>
      </div>

      {/* TAB 1: MONTHLY MATRIX */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
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
                          const status: AttendanceStatus = record 
                            ? record.status 
                            : (isWeekend ? 'WEEKEND' : 'PRESENT');

                          return (
                            <td
                              key={d.dayNum}
                              onClick={() => handleCellClick(emp.id, `${emp.firstName} ${emp.lastName}`, d.dateStr)}
                              className={`py-1.5 px-0.5 text-center cursor-pointer transition-all ${
                                isWeekend ? 'bg-slate-950/30' : ''
                              }`}
                            >
                              <div
                                className={`w-7 h-7 mx-auto rounded-lg border flex items-center justify-center font-mono font-bold text-[10px] transition-transform hover:scale-110 ${getStatusBadgeStyle(status)}`}
                                title={`${emp.firstName} on ${d.dateStr}: ${status}`}
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

      {/* TAB 3: PHASE 6 MOBILE FACE-AUTH SCHEMA BLUEPRINT */}
      {activeTab === 'mobile_blueprint' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 border border-purple-500/30 space-y-3">
            <div className="flex items-center space-x-2 text-purple-300 font-bold text-sm">
              <Smartphone className="w-5 h-5" />
              <span>Phase 6 Mobile Face-Authentication Attendance Blueprint</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              As per design requirements, **Clock In / Clock Out user actions are not implemented in the current web application**. 
              However, our full database schema and API routing have been strictly architected so that the future React Native / iOS / Android biometric face-authentication mobile app connects with 100% backward compatibility.
            </p>
          </div>

          {/* Architecture Diagram & Flow */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-bold text-brand-300 flex items-center space-x-1.5">
                <span>1. Mobile Client Capture</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Employee opens mobile app → On-device face detection captures facial embeddings vector + GPS coordinates + hardware device UUID.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-bold text-purple-300 flex items-center space-x-1.5">
                <span>2. Multi-Tenant API Verify</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                API verifies employee facial vector match, validates geofence boundary against company office perimeter, and tags record.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-bold text-emerald-300 flex items-center space-x-1.5">
                <span>3. Real-Time HR Sync</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                The attendance record status automatically updates in the HRMS Web Matrix, calculates late arrival penalty, and updates payroll ledger.
              </p>
            </div>
          </div>

          {/* Interactive Payload Simulator */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-purple-400" />
                  <span>Interactive Biometric API Payload Simulator</span>
                </h3>
                <p className="text-slate-400 text-[11px]">Simulate a mobile face verification request to inspect schema alignment.</p>
              </div>

              <button
                onClick={handleSimulateMobileAuth}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold flex items-center space-x-1.5 shadow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simulate Verification Payload</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Employee</label>
                <select
                  value={simEmployeeId}
                  onChange={(e) => setSimEmployeeId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Facial Match Confidence Score</label>
                <input
                  type="number"
                  step="0.1"
                  value={simConfidence}
                  onChange={(e) => setSimConfidence(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {simResponse && (
              <div className="mt-4 p-4 rounded-2xl bg-slate-950 border border-purple-500/30 space-y-2 animate-fade-in font-mono text-[11px]">
                <div className="text-purple-300 font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Simulated HTTP 200 Response Payload</span>
                </div>
                <pre className="text-emerald-300 overflow-x-auto p-3 bg-slate-900 rounded-xl border border-slate-800">
                  {JSON.stringify(simResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setSelectedRecord(null)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Adjust Attendance Record</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Employee: <strong className="text-white">{selectedRecord.employeeName}</strong> • Date: <strong className="text-brand-300 font-mono">{selectedRecord.date}</strong>
            </p>

            <form onSubmit={handleSaveAdjustment} className="mt-4 space-y-4">
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
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Save & Log Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Mark Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsBulkModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Bulk Mark Daily Attendance</h3>
            <p className="text-xs text-slate-400 mt-0.5">Mark batch status for an entire division or company.</p>

            <form onSubmit={handleBulkMark} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Date</label>
                <input
                  type="date"
                  required
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Department</label>
                <select
                  value={bulkDeptId}
                  onChange={(e) => setBulkDeptId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="ALL">All Departments ({employees.length} Employees)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Status to Apply</label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as AttendanceStatus)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="PRESENT">Present (Full Day)</option>
                  <option value="HOLIDAY">Official Public Holiday</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="ABSENT">Absent</option>
                </select>
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
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Apply to Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
