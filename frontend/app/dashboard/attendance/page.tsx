'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Save,
  Loader2,
  Lock,
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Users,
  Sun,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import ConfirmModal from '@/components/ConfirmModal';

interface SchoolClass {
  id: string;
  name: string;
}

interface StudentRow {
  studentId: string;
  id: string;
  firstName: string;
  lastName: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
  notes: string;
}

interface DashboardStats {
  present: number;
  absent: number;
  late: number;
  total: number;
}

interface TermProgress {
  durationDays: number;
  totalSchoolDays: number;
  totalHolidays: number;
  daysCrossed: number;
  daysRemaining: number;
  overallAttendancePercent: number;
}

interface DashboardData {
  today: DashboardStats;
  week: DashboardStats;
  term: DashboardStats;
  totalStudents: number;
  activeTerm: { id: string; name: string; startDate: string; endDate: string } | null;
  termProgress: TermProgress | null;
}

interface TodayClassBreakdown {
  classId: string;
  className: string;
  studentCount: number;
  present: number;
  late: number;
  absent: number;
  totalMarked: number;
  attendancePercent: number;
}

interface TodayBreakdownData {
  date: string;
  activeTerm: { id: string; name: string } | null;
  classes: TodayClassBreakdown[];
}

type ActiveView = 'dashboard' | 'mark';

const STATUS_CONFIG = {
  PRESENT: { label: 'Present', classes: 'bg-green-100 text-green-700 ring-green-500' },
  ABSENT:  { label: 'Absent',  classes: 'bg-red-100 text-red-700 ring-red-500' },
  LATE:    { label: 'Late',    classes: 'bg-yellow-100 text-yellow-700 ring-yellow-500' },
} as const;

export default function AttendancePage() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');

  // ── Class / date state ─────────────────────────────────────
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // ── Mark-attendance state ──────────────────────────────────
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [termName, setTermName] = useState<string | null>(null);
  const [isTermClosed, setIsTermClosed] = useState(false);
  const [isDayOver, setIsDayOver] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [holidayLabel, setHolidayLabel] = useState<string | null>(null);
  const [isDayClosed, setIsDayClosed] = useState(false);
  const [unclosedDay, setUnclosedDay] = useState<{ date: string; dateStr: string } | null>(null);

  // ── Dashboard state ────────────────────────────────────────
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardClassId, setDashboardClassId] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [todayBreakdown, setTodayBreakdown] = useState<TodayBreakdownData | null>(null);

  // ── Close-day state ────────────────────────────────────────
  const [closingDay, setClosingDay] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingUnclosed, setClosingUnclosed] = useState(false);
  const [showCloseUnclosedConfirm, setShowCloseUnclosedConfirm] = useState(false);

  const isTeacher      = user?.role === 'TEACHER';
  const isHeadmistress = user?.role === 'HEADMISTRESS';
  const isReadOnly     = isTermClosed || isDayClosed || isHoliday || (isDayOver && !isHeadmistress);

  // Is the current local time after 3 PM (Ghana = UTC+0)?
  const isAfter3PM = () => new Date().getUTCHours() >= 15;

  // Human-readable day name and date for the selected date
  const getDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    const dayName      = d.toLocaleDateString('en-GH', { weekday: 'long',   timeZone: 'UTC' });
    const dateFormatted = d.toLocaleDateString('en-GH', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
    return { dayName, dateFormatted };
  };

  // ── Fetch classes ──────────────────────────────────────────
  const fetchClasses = useCallback(async () => {
    try {
      const res = await api.get('/classes');
      const allClasses: SchoolClass[] = res.data?.classes || res.data || [];
      setClasses(allClasses);
      if (isTeacher && user?.teacher?.classId) {
        setSelectedClassId(user.teacher.classId);
        setDashboardClassId(user.teacher.classId);
      }
    } catch {
      setClasses([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, user]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  // ── Fetch dashboard ────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dashboardClassId) params.classId = dashboardClassId;
      const res = await api.get('/attendance/dashboard', { params });
      setDashboard(res.data);
    } catch {
      setDashboard(null);
    } finally {
      setDashboardLoading(false);
    }
  }, [dashboardClassId]);

  useEffect(() => {
    if (activeView === 'dashboard') fetchDashboard();
  }, [activeView, fetchDashboard]);

  // ── Fetch today's per-class attendance breakdown ───────────
  useEffect(() => {
    if (activeView !== 'dashboard') return;
    api.get<TodayBreakdownData>('/attendance/today/breakdown')
      .then(res => setTodayBreakdown(res.data))
      .catch(() => setTodayBreakdown(null));
  }, [activeView]);

  // ── Fetch students for attendance marking ──────────────────
  const fetchStudentsForAttendance = useCallback(async () => {
    if (!selectedClassId || !selectedDate) return;
    setLoading(true);
    setError('');
    setIsHoliday(false);
    setHolidayLabel(null);
    try {
      const attRes = await api.get('/attendance', {
        params: { classId: selectedClassId, date: selectedDate },
      });

      let attRecords: Array<{
        student: { id: string; studentId: string; firstName: string; lastName: string };
        attendance: { status: string; notes?: string } | null;
      }>;

      if (Array.isArray(attRes.data)) {
        attRecords = attRes.data;
        setTermName(null);
        setIsTermClosed(false);
        setIsDayOver(false);
        setIsDayClosed(false);
        setUnclosedDay(null);
      } else {
        attRecords = attRes.data?.records || [];
        setTermName(attRes.data?.termName || null);
        setIsTermClosed(attRes.data?.isTermClosed || false);
        setIsDayOver(attRes.data?.isDayOver || false);
        setIsDayClosed(attRes.data?.isDayClosed || false);
        setUnclosedDay(attRes.data?.unclosedPreviousDay || null);
      }

      setStudents(attRecords.map(r => ({
        id: r.student.id,
        studentId: r.student.studentId,
        firstName: r.student.firstName,
        lastName: r.student.lastName,
        status: (r.attendance?.status as 'PRESENT' | 'ABSENT' | 'LATE') || 'PRESENT',
        notes: r.attendance?.notes || '',
      })));

      try {
        type TermDayLite = { date: string; isHoliday?: boolean; label?: string | null };
        type TermLite = { status: string; termDays?: TermDayLite[] };
        const termsRes = await api.get('/terms');
        const termsList: TermLite[] = termsRes.data?.data || termsRes.data || [];
        const activeTerm = termsList.find((t) => t.status === 'ACTIVE');
        if (activeTerm?.termDays && Array.isArray(activeTerm.termDays)) {
          const termDay = activeTerm.termDays.find(
            (d) => (d.date?.split('T')[0] ?? d.date) === selectedDate
          );
          setIsHoliday(termDay?.isHoliday === true);
          setHolidayLabel(termDay?.label ?? null);
        }
      } catch {
        // ignore
      }
    } catch {
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedDate]);

  useEffect(() => {
    if (selectedClassId && activeView === 'mark') fetchStudentsForAttendance();
  }, [fetchStudentsForAttendance, selectedClassId, activeView]);

  // ── Handlers ───────────────────────────────────────────────
  const toggleStatus = (studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE') => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, status } : s));
    setSaved(false);
  };

  const updateNotes = (studentId: string, notes: string) => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, notes } : s));
    setSaved(false);
  };

  const saveAttendance = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/attendance/bulk', {
        classId: selectedClassId,
        date: selectedDate,
        records: students.map(s => ({ studentId: s.id, status: s.status, notes: s.notes })),
      });
      setSaved(true);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to save attendance';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const closeAttendanceForDay = async () => {
    setClosingDay(true);
    try {
      await api.post('/attendance/close-day', { classId: selectedClassId, date: selectedDate });
      setIsDayClosed(true);
      setShowCloseConfirm(false);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to close attendance';
      setError(message);
      setShowCloseConfirm(false);
    } finally {
      setClosingDay(false);
    }
  };

  const closeUnclosedDay = async () => {
    if (!unclosedDay) return;
    setClosingUnclosed(true);
    try {
      await api.post('/attendance/close-day', {
        classId: selectedClassId,
        date: unclosedDay.dateStr,
      });
      setUnclosedDay(null);
      setShowCloseUnclosedConfirm(false);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to close attendance';
      setError(message);
      setShowCloseUnclosedConfirm(false);
    } finally {
      setClosingUnclosed(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────
  const attendedCount = students.filter(
    s => s.status === 'PRESENT' || s.status === 'LATE',
  ).length;
  const absentCount  = students.filter(s => s.status === 'ABSENT').length;
  const lateCount    = students.filter(s => s.status === 'LATE').length;

  const buildDetailUrl = (scope: string, status: string) => {
    const params = new URLSearchParams({ scope, status });
    if (dashboardClassId) params.set('classId', dashboardClassId);
    return `/dashboard/attendance/details?${params.toString()}`;
  };

  const { dayName, dateFormatted } = getDateDisplay(selectedDate);
  const selectedClassName = classes.find(c => c.id === selectedClassId)?.name || '';

  // ── Term progress percentage ───────────────────────────────
  const termProgressPct = dashboard?.termProgress
    ? dashboard.termProgress.totalSchoolDays > 0
      ? Math.round(
          (dashboard.termProgress.daysCrossed / dashboard.termProgress.totalSchoolDays) * 100,
        )
      : 0
    : 0;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl">
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Monitor and record student attendance by term and class
        </p>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex">
          {([
            { key: 'dashboard' as const, label: 'Overview' },
            { key: 'mark'      as const, label: 'Mark Attendance' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeView === tab.key
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════ OVERVIEW TAB ════════════════ */}
      {activeView === 'dashboard' && (
        <div className="space-y-6">
          {dashboardLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* No active term notice */}
              {!dashboard?.activeTerm && (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">No Active Term</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Attendance cannot be recorded until a term is open.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/dashboard/terms"
                    className="shrink-0 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Manage Terms →
                  </Link>
                </div>
              )}

              {/* ── Active term progress card ──────────────── */}
              {dashboard?.activeTerm && dashboard?.termProgress && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {/* Header strip */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CalendarDays className="w-4 h-4 text-green-700" />
                          <span className="text-base font-bold text-gray-900">
                            {dashboard.activeTerm.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">
                            ACTIVE
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(dashboard.activeTerm.startDate)} —{' '}
                          {formatDate(dashboard.activeTerm.endDate)}
                          <span className="ml-2">
                            · {dashboard.totalStudents} students enrolled
                          </span>
                        </p>
                      </div>
                      <Link
                        href="/dashboard/terms"
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        View Terms →
                      </Link>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="px-5 pt-4 pb-1">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span className="font-medium text-green-700">
                        {dashboard.termProgress.daysCrossed} school days completed
                      </span>
                      <span>{dashboard.termProgress.daysRemaining} days remaining</span>
                    </div>
                    <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all"
                        style={{ width: `${termProgressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1 text-center">{termProgressPct}% of term completed</p>
                  </div>

                  {/* Stats grid — working days, days covered, days left */}
                  <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      {
                        label: 'School Days',
                        value: dashboard.termProgress.totalSchoolDays,
                        color: 'text-gray-700',
                      },
                      {
                        label: 'Days Covered',
                        value: dashboard.termProgress.daysCrossed,
                        color: 'text-green-700',
                      },
                      {
                        label: 'Days Left',
                        value: dashboard.termProgress.daysRemaining,
                        color: 'text-blue-700',
                      },
                    ].map(s => (
                      <div
                        key={s.label}
                        className="text-center bg-gray-50 rounded-lg py-2.5 px-2 border border-gray-100"
                      >
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                          {s.label}
                        </p>
                        <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Today's attendance ─────────────────────── */}
              {dashboard && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-800">Today&apos;s Attendance</h2>
                    {!isTeacher && (
                      <select
                        value={dashboardClassId}
                        onChange={e => setDashboardClassId(e.target.value)}
                        className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
                      >
                        <option value="">All Classes</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {([
                      {
                        status: 'PRESENT' as const,
                        label: 'Present',
                        count: dashboard.today.present + dashboard.today.late,
                        color: 'text-green-700',
                        bg: 'bg-green-50 border-green-100',
                      },
                      {
                        status: 'ABSENT' as const,
                        label: 'Absent',
                        count: dashboard.today.absent,
                        color: 'text-red-600',
                        bg: 'bg-red-50 border-red-100',
                      },
                      {
                        status: 'LATE' as const,
                        label: 'Late',
                        count: dashboard.today.late,
                        color: 'text-yellow-600',
                        bg: 'bg-yellow-50 border-yellow-100',
                      },
                    ]).map(({ status, label, count, color, bg }) => (
                      <Link
                        key={status}
                        href={buildDetailUrl('day', status)}
                        className={`${bg} border rounded-xl p-5 hover:shadow-md transition-shadow group`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">
                              {label}
                            </p>
                            <p className={`text-3xl font-bold mt-1 ${color}`}>{count}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {dashboard.today.total > 0
                                ? Math.round((count / dashboard.today.total) * 100)
                                : 0}
                              % of {dashboard.today.total} marked
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* ── This term stats ────────────────────────── */}
              {/* ── Today's attendance by class ───────────── */}
              {todayBreakdown && todayBreakdown.classes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-800">
                      Today&apos;s Attendance by Class
                    </h2>
                    <p className="text-xs text-gray-400">Click a class to view details</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {todayBreakdown.classes.map(cls => (
                      <Link
                        key={cls.classId}
                        href={`/dashboard/attendance/daily/${cls.classId}`}
                        className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-green-700 transition-colors">
                              {cls.className}
                            </p>
                            <p className="text-xs text-gray-400">{cls.studentCount} students enrolled</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </div>
                        {cls.totalMarked > 0 ? (
                          <>
                            <div className="flex gap-2 text-xs mb-2">
                              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">
                                {cls.present + cls.late} present
                              </span>
                              <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full font-medium">
                                {cls.absent} absent
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  cls.attendancePercent >= 80
                                    ? 'bg-green-500'
                                    : cls.attendancePercent >= 60
                                    ? 'bg-yellow-400'
                                    : 'bg-red-400'
                                }`}
                                style={{ width: `${cls.attendancePercent}%` }}
                              />
                            </div>
                            <p
                              className={`text-xs font-bold mt-1.5 ${
                                cls.attendancePercent >= 80
                                  ? 'text-green-700'
                                  : cls.attendancePercent >= 60
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {cls.attendancePercent}% today
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 mt-1">No attendance marked yet</p>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════════ MARK ATTENDANCE TAB ════════════════ */}
      {activeView === 'mark' && (
        <div>
          {/* ── Context header: Term · Day · Date ─────────── */}
          <div className="mb-5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-xl px-5 py-4 flex flex-wrap items-center gap-4">
            {termName ? (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  isTermClosed
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {isTermClosed ? (
                  <Lock className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <CalendarDays className="w-3 h-3" aria-hidden="true" />
                )}
                {termName}
                {isTermClosed && ' (Closed)'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                <CalendarDays className="w-3 h-3" aria-hidden="true" />
                No Active Term
              </span>
            )}
            <div>
              <p className="text-base font-bold text-gray-900">{dayName}</p>
              <p className="text-sm text-gray-500">{dateFormatted}</p>
            </div>
            {selectedClassName && (
              <div className="ml-auto px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600">
                Class: {selectedClassName}
              </div>
            )}
          </div>

          {/* ── Controls: class + date ────────────────────── */}
          <div className="flex flex-wrap gap-4 mb-5">
            {!isTeacher && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Class
                </label>
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select class…</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {isTeacher && user?.teacher?.class && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Class
                </label>
                <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-700">
                  {user.teacher.class.name}
                </div>
              </div>
            )}
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* ── Unclosed previous day warning ─────────────── */}
          {unclosedDay && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Attendance Not Closed</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Please close attendance for{' '}
                    <strong>{formatDate(unclosedDay.dateStr)}</strong> before recording a new day.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCloseUnclosedConfirm(true)}
                disabled={closingUnclosed}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-60 transition-colors"
              >
                {closingUnclosed ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                Close {formatDate(unclosedDay.dateStr)}
              </button>
            </div>
          )}

          {/* ── Status banners ─────────────────────────────── */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          {isHoliday && (
            <div className="mb-4 p-3 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-sm flex items-center gap-2">
              <Sun className="w-4 h-4" />
              <span>
                <strong>Holiday{holidayLabel ? `: ${holidayLabel}` : ''}</strong> — Attendance cannot be marked on holidays.
              </span>
            </div>
          )}

          {isTermClosed && (
            <div className="mb-4 p-3 bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-sm flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>
                <strong>Term is closed</strong> — Attendance records cannot be modified.
              </span>
            </div>
          )}

          {isDayClosed && !isTermClosed && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-sm flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>
                Attendance for this day has been closed. Only the Admin can make changes.
              </span>
            </div>
          )}

          {isDayOver && !isTermClosed && !isDayClosed && !isHeadmistress && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl text-sm">
              <strong>This day has passed</strong> — Attendance for past days cannot be edited.
            </div>
          )}

          {saved && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium">
              ✓ Attendance saved successfully.
            </div>
          )}

          {/* ── Student count summary ─────────────────────── */}
          {students.length > 0 && (
            <div className="flex items-center gap-3 mb-4 text-sm">
              <span className="text-gray-400">{students.length} students</span>
              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold">
                Present: {attendedCount}
              </span>
              <span className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-semibold">
                Absent: {absentCount}
              </span>
              <span className="px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-semibold">
                Late: {lateCount}
              </span>
            </div>
          )}

          {/* ── Student list ───────────────────────────────── */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Users className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium text-gray-500">
                {selectedClassId ? 'No students in this class' : 'Select a class to mark attendance'}
              </p>
              {!selectedClassId && (
                <p className="text-xs text-gray-400 mt-1">
                  Use the Class dropdown above to get started
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase w-10">
                        #
                      </th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">
                        Student
                      </th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map((student, idx) => (
                      <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-xs text-gray-400">{student.studentId}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {(['PRESENT', 'ABSENT', 'LATE'] as const).map(status => (
                              <button
                                key={status}
                                onClick={() => toggleStatus(student.id, status)}
                                disabled={isReadOnly}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                  student.status === status
                                    ? `${STATUS_CONFIG[status].classes} ring-2`
                                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                {STATUS_CONFIG[status].label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={student.notes}
                            onChange={e => updateNotes(student.id, e.target.value)}
                            placeholder="Optional note…"
                            disabled={isReadOnly}
                            className={`w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500 ${
                              isReadOnly ? 'bg-gray-50 cursor-not-allowed' : ''
                            }`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Action buttons ─────────────────────────── */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  {/* Close-day button — visible only after 3 PM or for headmistress */}
                  {!isDayClosed && !isTermClosed && selectedClassId &&
                    (isAfter3PM() || isHeadmistress) && (
                    <button
                      onClick={() => setShowCloseConfirm(true)}
                      disabled={closingDay}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 transition-colors"
                    >
                      {closingDay ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                      Close Attendance for Today
                    </button>
                  )}
                  {/* Hint when close button is not yet available */}
                  {!isDayClosed && !isTermClosed && selectedClassId &&
                    !isAfter3PM() && !isHeadmistress && (
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <Lock className="w-3 h-3" />
                      Close attendance available after 3:00 PM
                    </p>
                  )}
                </div>
                <button
                  onClick={saveAttendance}
                  disabled={saving || isReadOnly}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 transition-colors"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Attendance
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Confirmation modals ────────────────────────────── */}
      <ConfirmModal
        isOpen={showCloseConfirm}
        title="Close Attendance for Today"
        message={`Are you sure you want to close attendance for ${dateFormatted}? Once closed, only the Admin can modify it.`}
        confirmLabel="Yes, Close Attendance"
        confirmClassName="bg-amber-600 hover:bg-amber-700"
        onConfirm={closeAttendanceForDay}
        onCancel={() => setShowCloseConfirm(false)}
        isLoading={closingDay}
      />
      <ConfirmModal
        isOpen={showCloseUnclosedConfirm}
        title="Close Past Attendance"
        message={
          unclosedDay
            ? `Are you sure you want to close attendance for ${formatDate(unclosedDay.dateStr)}?`
            : ''
        }
        confirmLabel="Yes, Close It"
        confirmClassName="bg-amber-600 hover:bg-amber-700"
        onConfirm={closeUnclosedDay}
        onCancel={() => setShowCloseUnclosedConfirm(false)}
        isLoading={closingUnclosed}
      />
    </div>
  );
}
