import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  MapPin,
  RefreshCw,
  Route,
  X,
  SlidersHorizontal,
  ScanFace,
  ShieldCheck,
  AlertCircle,
  Clock,
  Plus,
  Search,
  Check,
  UserCheck,
  UserX,
} from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../services/api';
import type { AttendanceRecord, AttendanceRoute, AttendanceStatus, Employee } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const RouteViewport: React.FC<{ positions: [number, number][] }> = ({ positions }) => {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 1) map.setView(positions[0], 17);
    else if (positions.length > 1) map.fitBounds(positions as LatLngBoundsExpression, { padding: [28, 28] });
  }, [map, positions]);
  return null;
};

const RoutePointPopup: React.FC<{ point: AttendanceRoute['points'][number]; index: number; total: number }> = ({ point, index, total }) => {
  const coordinate = `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinate)}`;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=18/${point.latitude}/${point.longitude}`;
  return (
    <div className="min-w-64 space-y-2 text-slate-800">
      <div>
        <strong className="text-sm">Route point {index + 1} of {total}</strong>
        <span className="block text-xs text-slate-600">{new Date(point.capturedAt).toLocaleString()}</span>
      </div>
      <dl className="grid grid-cols-[96px_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="font-semibold text-slate-600">Map location</dt><dd>{coordinate}</dd>
        <dt className="font-semibold text-slate-600">Accuracy</dt><dd>±{Math.round(point.accuracyMeters)} m</dd>
        <dt className="font-semibold text-slate-600">Speed</dt><dd>{point.speedMetersPerSecond == null ? 'Not recorded' : `${(point.speedMetersPerSecond * 3.6).toFixed(1)} km/h`}</dd>
        <dt className="font-semibold text-slate-600">Direction</dt><dd>{point.bearingDegrees == null ? 'Not recorded' : `${Math.round(point.bearingDegrees)}°`}</dd>
      </dl>
      <div className="border-t border-slate-200 pt-2 text-xs text-slate-600">Street and nearby-place names can be viewed in the linked map.</div>
      <div className="flex gap-2">
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white">Open Google Maps</a>
        <a href={osmUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700">OpenStreetMap</a>
      </div>
    </div>
  );
};

const TrackingMap: React.FC<{ route: AttendanceRoute; close: () => void }> = ({ route, close }) => {
  const positions = useMemo<[number, number][]>(() => route.points.map(point => [point.latitude, point.longitude]), [route.points]);
  const first = positions[0] || [20.5937, 78.9629];
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Route className="text-brand-400" />
            Workday route · {route.employee.firstName} {route.employee.lastName}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {route.employee.employeeCode} · {new Date(route.attendance.date).toLocaleDateString()} · {(route.distanceMeters / 1000).toFixed(2)} km · {route.points.length} secure points
          </p>
        </div>
        <div className="flex items-center gap-2">
          {route.active ? (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">LIVE TRACKING</span>
          ) : !route.trackingEnabled ? (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">TRACKING DISABLED</span>
          ) : (
            <span className="rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-300">TRACKING ENDED</span>
          )}
          <button onClick={close} className="rounded-xl border border-slate-700 p-2" aria-label="Close route map"><X className="h-4 w-4" /></button>
        </div>
      </header>
      {positions.length ? (
        <>
          <MapContainer center={first} zoom={16} scrollWheelZoom className="h-[460px] w-full">
            <TileLayer attribution="© OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Polyline positions={positions} pathOptions={{ color: '#7c3aed', weight: 6, opacity: 0.9 }} />
            {route.points.map((point, index) => {
              const isFirst = index === 0;
              const isLatest = index === route.points.length - 1;
              return (
                <CircleMarker
                  key={point.id}
                  center={[point.latitude, point.longitude]}
                  radius={isFirst || isLatest ? 9 : 6}
                  pathOptions={{
                    color: '#ffffff',
                    fillColor: isFirst ? '#10b981' : isLatest ? (route.active ? '#f59e0b' : '#ef4444') : '#7c3aed',
                    fillOpacity: 1,
                    weight: 3,
                  }}
                >
                  <RoutePointPopup point={point} index={index} total={route.points.length} />
                </CircleMarker>
              );
            })}
            <RouteViewport positions={positions} />
          </MapContainer>
          <footer className="grid gap-2 p-4 text-xs text-slate-300 sm:grid-cols-3">
            <span>Start: {new Date(route.points[0].capturedAt).toLocaleTimeString()}</span>
            <span>Latest: {new Date(route.points[route.points.length - 1].capturedAt).toLocaleTimeString()}</span>
            <span>Latest accuracy: ±{Math.round(route.points[route.points.length - 1].accuracyMeters)} m</span>
          </footer>
        </>
      ) : (
        <div className="grid min-h-72 place-items-center p-8 text-center text-slate-400">
          <div>
            <MapPin className="mx-auto mb-3 h-10 w-10" />
            <strong className="block text-white">{route.trackingEnabled ? 'Waiting for route points' : 'GPS tracking is disabled for this employee'}</strong>
            <span className="text-xs">{route.trackingEnabled ? 'Keep the Android app signed in and allow precise location while the employee is clocked in.' : 'Enable Workday GPS route tracking in the employee edit screen, then refresh the Android attendance screen.'}</span>
          </div>
        </div>
      )}
    </section>
  );
};

const toTimeInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const combineDateAndTime = (dateStr: string, timeStr: string) => {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

export const AttendancePage: React.FC = () => {
  const toast = useToast();
  const { currentUser } = useAuth();
  const canManage = currentUser?.permissions?.includes('attendance.manage') === true;
  const canViewRoutes = currentUser?.permissions?.includes('attendance.route.read') === true;

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [route, setRoute] = useState<AttendanceRoute | null>(null);
  const [routeBusy, setRouteBusy] = useState<string | null>(null);

  // Modal adjustment state
  const [adjustTarget, setAdjustTarget] = useState<{
    recordId?: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    avatarUrl?: string | null;
    date: string;
    status: AttendanceStatus;
    clockInTime: string;
    clockOutTime: string;
    correctionNote: string;
  } | null>(null);
  const [adjustSaving, setAdjustSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [attendanceResult, employeeResult] = await Promise.allSettled([
        api.getAttendanceV1(),
        api.getEmployeesV1(),
      ]);
      if (attendanceResult.status === 'rejected') throw attendanceResult.reason;
      const people = employeeResult.status === 'fulfilled' ? employeeResult.value : [];
      setRecords(attendanceResult.value);
      setEmployees(people);
    } catch (error) {
      toast.error('Attendance could not be loaded', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!route?.active) return;
    const timer = window.setInterval(() => {
      void api.getAttendanceRoute(route.attendance.id).then(setRoute).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [route?.active, route?.attendance.id]);

  const employeeMap = useMemo(() => new Map(employees.map(item => [item.id, item])), [employees]);

  const openAdjustForRecord = (record: AttendanceRecord) => {
    const emp = record.employee || employeeMap.get(record.employeeId);
    setAdjustTarget({
      recordId: record.id,
      employeeId: record.employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : record.employeeId,
      employeeCode: emp ? emp.employeeCode : '',
      avatarUrl: emp?.avatarUrl || record.clockInPhotoUrl,
      date: record.date.slice(0, 10),
      status: record.status,
      clockInTime: toTimeInput(record.clockInTime),
      clockOutTime: toTimeInput(record.clockOutTime),
      correctionNote: record.correctionNote || '',
    });
  };

  const openNewAdjustment = () => {
    const firstEmp = employees[0];
    const todayStr = new Date().toISOString().slice(0, 10);
    setAdjustTarget({
      employeeId: firstEmp?.id || '',
      employeeName: firstEmp ? `${firstEmp.firstName} ${firstEmp.lastName}` : '',
      employeeCode: firstEmp?.employeeCode || '',
      avatarUrl: firstEmp?.avatarUrl,
      date: todayStr,
      status: 'PRESENT',
      clockInTime: '10:00',
      clockOutTime: '19:00',
      correctionNote: '',
    });
  };

  const saveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    if (!adjustTarget.correctionNote.trim() || adjustTarget.correctionNote.trim().length < 3) {
      toast.error('Reason required', 'Please provide an adjustment reason with at least 3 characters.');
      return;
    }

    setAdjustSaving(true);
    try {
      const clockInIso = adjustTarget.clockInTime
        ? combineDateAndTime(adjustTarget.date, adjustTarget.clockInTime)
        : null;
      const clockOutIso = adjustTarget.clockOutTime
        ? combineDateAndTime(adjustTarget.date, adjustTarget.clockOutTime)
        : null;

      await api.saveManualAttendanceV1({
        employeeId: adjustTarget.employeeId,
        date: adjustTarget.date,
        status: adjustTarget.status,
        clockInTime: clockInIso,
        clockOutTime: clockOutIso,
        correctionNote: adjustTarget.correctionNote.trim(),
      });

      toast.success('Attendance adjusted successfully', `Record updated for ${adjustTarget.employeeName || 'employee'}.`);
      setAdjustTarget(null);
      await load();
    } catch (error) {
      toast.error('Adjustment failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setAdjustSaving(false);
    }
  };

  const openRoute = async (recordId: string) => {
    setRouteBusy(recordId);
    try {
      setRoute(await api.getAttendanceRoute(recordId));
    } catch (error) {
      toast.error('Route could not be loaded', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setRouteBusy(null);
    }
  };

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter(item => {
      const emp = item.employee || employeeMap.get(item.employeeId);
      const name = emp ? `${emp.firstName} ${emp.lastName}` : '';
      const code = emp ? emp.employeeCode : '';
      const matchesQuery = query === '' ||
        name.toLowerCase().includes(query.toLowerCase()) ||
        code.toLowerCase().includes(query.toLowerCase()) ||
        item.date.includes(query);
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [records, employeeMap, query, statusFilter]);

  // High-level statistics
  const stats = useMemo(() => {
    const total = records.length;
    const faceVerified = records.filter(r => r.faceAuthVerified || r.source === 'MOBILE_FACE').length;
    const late = records.filter(r => r.status === 'LATE').length;
    const absent = records.filter(r => r.status === 'ABSENT').length;
    return { total, faceVerified, late, absent };
  }, [records]);

  return (
    <div className="neo-page neo-attendance space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-white">
            <CalendarCheck className="h-7 w-7 text-brand-400" />
            Attendance Face Register
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Live face verification punches, biometric GPS audit trails, midnight auto-absent reconciliation, and payroll-safe adjustments.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <button
              onClick={openNewAdjustment}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-500/20 hover:bg-brand-400 transition-all"
            >
              <Plus className="h-4 w-4" />
              Adjust / Add Record
            </button>
          )}
          <button
            onClick={() => void load()}
            className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 text-slate-300 hover:text-white hover:border-slate-700 transition-all"
            aria-label="Refresh attendance register"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin text-brand-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Mini Stat Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="h-10 w-10 rounded-xl bg-violet-500/15 text-violet-400 grid place-items-center">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Total Records</div>
            <div className="text-xl font-bold text-white">{stats.total}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center">
            <ScanFace className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Face Verified</div>
            <div className="text-xl font-bold text-emerald-400">{stats.faceVerified}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-400 grid place-items-center">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Late Entries</div>
            <div className="text-xl font-bold text-amber-400">{stats.late}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="h-10 w-10 rounded-xl bg-rose-500/15 text-rose-400 grid place-items-center">
            <UserX className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Absent (Inc. 12 AM)</div>
            <div className="text-xl font-bold text-rose-400">{stats.absent}</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search employee by name, code or date..."
            className="input w-full pl-10 bg-slate-900/80 border-slate-800 text-slate-200 placeholder:text-slate-500 text-xs rounded-xl"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input bg-slate-900/80 border-slate-800 text-slate-200 text-xs rounded-xl min-w-36"
        >
          <option value="ALL">All Statuses</option>
          <option value="PRESENT">Present</option>
          <option value="LATE">Late</option>
          <option value="ABSENT">Absent</option>
          <option value="HALF_DAY">Half Day</option>
          <option value="LEAVE">On Leave</option>
          <option value="HOLIDAY">Holiday</option>
          <option value="WEEKEND">Weekend</option>
        </select>
      </div>

      {/* Active Route Map */}
      {route && <TrackingMap route={route} close={() => setRoute(null)} />}

      {/* Attendance Face List Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Employee & Face</th>
                <th className="py-3.5 px-3">Date</th>
                <th className="py-3.5 px-3">Verification</th>
                <th className="py-3.5 px-3">Clock In</th>
                <th className="py-3.5 px-3">Clock Out</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-3">Adjustment / Note</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <ScanFace className="mx-auto mb-2 h-8 w-8 text-slate-600" />
                    No attendance records match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map(item => {
                  const emp = item.employee || employeeMap.get(item.employeeId);
                  const isPastDate = item.date < todayStr;
                  const isMissingClockOut = Boolean(item.clockInTime && !item.clockOutTime && isPastDate);
                  const isFaceAuth = item.faceAuthVerified || item.source === 'MOBILE_FACE';
                  const initials = emp ? `${emp.firstName[0] || ''}${emp.lastName[0] || ''}`.toUpperCase() : 'EM';
                  const avatarSrc = emp?.avatarUrl || item.clockInPhotoUrl;

                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Employee & Face thumbnail */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-none">
                            {avatarSrc ? (
                              <img
                                src={avatarSrc}
                                alt={emp ? `${emp.firstName}'s face` : 'Employee face'}
                                className="h-10 w-10 rounded-full object-cover border-2 border-brand-500/40 shadow-sm"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-violet-600/20 text-violet-300 font-bold border border-violet-500/30 flex items-center justify-center text-xs">
                                {initials}
                              </div>
                            )}
                            {isFaceAuth && (
                              <span
                                title="Live Face Verified"
                                className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] shadow"
                              >
                                <ScanFace className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-100">
                              {emp ? `${emp.firstName} ${emp.lastName}` : item.employeeId}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {emp?.employeeCode || '—'}{'department' in (emp || {}) && (emp as { department?: { name: string } | null })?.department?.name ? ` · ${(emp as { department?: { name: string } | null }).department!.name}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-3 text-slate-300 font-medium">
                        {item.date}
                      </td>

                      {/* Verification method badge */}
                      <td className="py-3.5 px-3">
                        {isFaceAuth ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <ScanFace className="h-3 w-3" />
                            Live Face {item.faceConfidenceScore ? `${(item.faceConfidenceScore * 100).toFixed(0)}%` : 'Verified'}
                          </span>
                        ) : item.source === 'WEB_ADMIN' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            <SlidersHorizontal className="h-3 w-3" />
                            HR Adjusted
                          </span>
                        ) : item.source === 'BIOMETRIC_DEVICE' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            <ShieldCheck className="h-3 w-3" />
                            Biometric
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            {item.source}
                          </span>
                        )}
                      </td>

                      {/* Clock In */}
                      <td className="py-3.5 px-3">
                        {item.clockInTime ? (
                          <div>
                            <span className="font-semibold text-slate-200">
                              {new Date(item.clockInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                            {item.status === 'LATE' && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                LATE
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono">—</span>
                        )}
                      </td>

                      {/* Clock Out */}
                      <td className="py-3.5 px-3">
                        {item.clockOutTime ? (
                          <span className="font-semibold text-slate-200">
                            {new Date(item.clockOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </span>
                        ) : isMissingClockOut ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20">
                            <AlertCircle className="h-3 w-3" />
                            No clock-out (12 AM Absent)
                          </span>
                        ) : item.clockInTime ? (
                          <span className="text-amber-400 font-medium text-[11px] flex items-center gap-1">
                            <Clock className="h-3 w-3 animate-pulse" />
                            Workday in progress
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono">—</span>
                        )}
                      </td>

                      {/* Status badge */}
                      <td className="py-3.5 px-3">
                        {item.status === 'PRESENT' && (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            PRESENT
                          </span>
                        )}
                        {item.status === 'LATE' && (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            LATE
                          </span>
                        )}
                        {item.status === 'ABSENT' && (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            ABSENT
                          </span>
                        )}
                        {item.status === 'HALF_DAY' && (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                            HALF DAY
                          </span>
                        )}
                        {item.status === 'LEAVE' && (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/40">
                            LEAVE
                          </span>
                        )}
                        {!['PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'LEAVE'].includes(item.status) && (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            {item.status}
                          </span>
                        )}
                      </td>

                      {/* Adjustment / Note */}
                      <td className="py-3.5 px-3 max-w-48 truncate">
                        {item.correctionNote ? (
                          <span className="text-[11px] text-slate-300" title={item.correctionNote}>
                            {item.correctionNote}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canManage && (
                            <button
                              onClick={() => openAdjustForRecord(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-violet-600/20 hover:bg-violet-600/35 text-violet-300 border border-violet-500/40 transition-all text-xs shadow-sm hover:scale-[1.02]"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                              Adjust
                            </button>
                          )}
                          {canViewRoutes && item.clockInTime && (
                            <button
                              disabled={routeBusy === item.id}
                              onClick={() => void openRoute(item.id)}
                              className="inline-flex items-center gap-1 rounded-xl border border-brand-500/30 px-2.5 py-1.5 text-brand-300 hover:bg-brand-500/15 disabled:opacity-50 transition-all text-xs"
                            >
                              <Route className="h-3.5 w-3.5" />
                              {routeBusy === item.id ? 'Loading…' : 'Route'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attendance Adjustment Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5">
            <header className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-brand-500/20 text-brand-400 grid place-items-center">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Adjust Attendance Record</h2>
                  <p className="text-xs text-slate-400">Modify status, punch times, and record audit note</p>
                </div>
              </div>
              <button
                onClick={() => setAdjustTarget(null)}
                className="rounded-xl border border-slate-800 p-2 text-slate-400 hover:text-white hover:border-slate-700"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form onSubmit={saveAdjustment} className="space-y-4">
              {/* Employee selection (or banner if editing existing record) */}
              {adjustTarget.recordId ? (
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                  {adjustTarget.avatarUrl ? (
                    <img src={adjustTarget.avatarUrl} alt="Employee" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-violet-600/30 text-violet-300 font-bold flex items-center justify-center text-xs">
                      {adjustTarget.employeeName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-white text-sm">{adjustTarget.employeeName}</div>
                    <div className="text-xs text-slate-400">{adjustTarget.employeeCode} · Date: {adjustTarget.date}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Select Employee</label>
                  <select
                    required
                    value={adjustTarget.employeeId}
                    onChange={e => {
                      const emp = employeeMap.get(e.target.value);
                      setAdjustTarget({
                        ...adjustTarget,
                        employeeId: e.target.value,
                        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : '',
                        employeeCode: emp ? emp.employeeCode : '',
                        avatarUrl: emp?.avatarUrl,
                      });
                    }}
                    className="input w-full bg-slate-800 border-slate-700 text-white rounded-xl text-xs"
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date */}
              {!adjustTarget.recordId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Date</label>
                  <input
                    type="date"
                    required
                    value={adjustTarget.date}
                    onChange={e => setAdjustTarget({ ...adjustTarget, date: e.target.value })}
                    className="input w-full bg-slate-800 border-slate-700 text-white rounded-xl text-xs"
                  />
                </div>
              )}

              {/* Status Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Attendance Status</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {(['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE', 'HOLIDAY', 'WEEKEND'] as AttendanceStatus[]).map(status => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setAdjustTarget({ ...adjustTarget, status })}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border ${
                        adjustTarget.status === status
                          ? 'bg-brand-500 text-white border-brand-400 shadow-md shadow-brand-500/30'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clock In / Out Times */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">Clock In Time</label>
                    {adjustTarget.clockInTime && (
                      <button
                        type="button"
                        onClick={() => setAdjustTarget({ ...adjustTarget, clockInTime: '' })}
                        className="text-[10px] text-slate-400 hover:text-rose-400"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="time"
                    value={adjustTarget.clockInTime}
                    onChange={e => setAdjustTarget({ ...adjustTarget, clockInTime: e.target.value })}
                    className="input w-full bg-slate-800 border-slate-700 text-white rounded-xl text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">Clock Out Time</label>
                    {adjustTarget.clockOutTime && (
                      <button
                        type="button"
                        onClick={() => setAdjustTarget({ ...adjustTarget, clockOutTime: '' })}
                        className="text-[10px] text-slate-400 hover:text-rose-400"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="time"
                    value={adjustTarget.clockOutTime}
                    onChange={e => setAdjustTarget({ ...adjustTarget, clockOutTime: e.target.value })}
                    className="input w-full bg-slate-800 border-slate-700 text-white rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400 mr-1 self-center">Presets:</span>
                <button
                  type="button"
                  onClick={() => setAdjustTarget({ ...adjustTarget, status: 'PRESENT', clockInTime: '10:00', clockOutTime: '19:00' })}
                  className="px-2 py-1 rounded-lg bg-slate-800 text-[10px] font-semibold text-slate-300 hover:bg-slate-700 border border-slate-700"
                >
                  Full Day (10–19)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustTarget({ ...adjustTarget, status: 'HALF_DAY', clockInTime: '10:00', clockOutTime: '14:00' })}
                  className="px-2 py-1 rounded-lg bg-slate-800 text-[10px] font-semibold text-slate-300 hover:bg-slate-700 border border-slate-700"
                >
                  Half Day (10–14)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustTarget({ ...adjustTarget, status: 'ABSENT', clockInTime: '', clockOutTime: '' })}
                  className="px-2 py-1 rounded-lg bg-slate-800 text-[10px] font-semibold text-rose-300 hover:bg-slate-700 border border-slate-700"
                >
                  Clear to Absent
                </button>
              </div>

              {/* Correction Reason */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Correction Reason / Audit Note <span className="text-rose-400">*</span></span>
                  <span className="text-[10px] text-slate-500">Min 3 characters</span>
                </label>
                <textarea
                  required
                  rows={2}
                  minLength={3}
                  value={adjustTarget.correctionNote}
                  onChange={e => setAdjustTarget({ ...adjustTarget, correctionNote: e.target.value })}
                  placeholder="e.g. Employee attended client onsite meeting; clock-out approved by HR / manager."
                  className="input w-full bg-slate-800 border-slate-700 text-white rounded-xl text-xs py-2"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustSaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-xs font-bold hover:bg-brand-400 disabled:opacity-50 shadow-lg shadow-brand-500/25"
                >
                  {adjustSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Save Adjustment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
