'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Save, Loader2, ChevronRight, FileText, Lock, AlertTriangle } from 'lucide-react';
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

type ActiveView = 'dashboard' | 'mark';

export default function AttendancePage() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [termName, setTermName] = useState<string | null>(null);
  const [isTermClosed, setIsTermClosed] = useState(false);
  const [isDayOver, setIsDayOver] = useState(false);
  const [isDayClosed, setIsDayClosed] = useState(false);
  const [unclosedDay, setUnclosedDay] = useState<{ date: string; dateStr: string } | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardClassId, setDashboardClassId] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [closingDay, setClosingDay] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingUnclosed, setClosingUnclosed] = useState(false);
  const [showCloseUnclosedConfirm, setShowCloseUnclosedConfirm] = useState(false);

  const isTeacher = user?.role === 'TEACHER';
  const isHeadmistress = user?.role === 'HEADMISTRESS';
  const isReadOnly = isTermClosed || isDayClosed || (isDayOver && !isHeadmistress);

  // Check if it's after 3 PM (Ghana time = UTC)
  const isAfter3PM = () => {
    const now = new Date();
    return now.getUTCHours() >= 15;
  };

  // Get current day name and date for display
  const todayDisplay = () => {
    const d = new Date(selectedDate);
    const dayName = d.toLocaleDateString('en-GH', { weekday: 'long' });
    return { dayName, dateFormatted: formatDate(selectedDate) };
  };

  const fetchClasses = useCallback(async () => {
    try {
      const res = await api.get('/classes');
      const allClasses: SchoolClass[] = res.data?.classes || res.data || [];
      setClasses(allClasses);

      if (isTeacher && user?.teacher?.classId) {
        setSelectedClassId(user.teacher.classId);
        setDashboardClassId(user.teacher.classId);
      } else if (allClasses.length > 0 && !selectedClassId) {
        setSelectedClassId(allClasses[0].id);
      }
    } catch {
      setClasses([]);
    }
  }, [isTeacher, user, selectedClassId]);

  useEffect(() => {
    fetchClasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch dashboard
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

  const fetchStudentsForAttendance = useCallback(async () => {
    if (!selectedClassId || !selectedDate) return;
    setLoading(true);
    setError('');
    try {
      const attRes = await api.get(`/attendance`, { params: { classId: selectedClassId, date: selectedDate } });

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

      setStudents(
        attRecords.map(r => ({
          id: r.student.id,
          studentId: r.student.studentId,
          firstName: r.student.firstName,
          lastName: r.student.lastName,
          status: (r.attendance?.status as 'PRESENT' | 'ABSENT' | 'LATE') || 'PRESENT',
          notes: r.attendance?.notes || '',
        }))
      );
    } catch {
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedDate]);

  useEffect(() => {
    if (selectedClassId && activeView === 'mark') fetchStudentsForAttendance();
  }, [fetchStudentsForAttendance, selectedClassId, activeView]);

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
        records: students.map(s => ({
          studentId: s.id,
          status: s.status,
          notes: s.notes,
        })),
      });
      setSaved(true);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save attendance';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const closeAttendanceForDay = async () => {
    setClosingDay(true);
    try {
      await api.post('/attendance/close-day', {
        classId: selectedClassId,
        date: selectedDate,
      });
      setIsDayClosed(true);
      setShowCloseConfirm(false);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to close attendance';
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
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to close attendance';
      setError(message);
      setShowCloseUnclosedConfirm(false);
    } finally {
      setClosingUnclosed(false);
    }
  };

  const statusConfig = {
    PRESENT: { label: 'Present', classes: 'bg-green-100 text-green-700 ring-green-500' },
    ABSENT: { label: 'Absent', classes: 'bg-red-100 text-red-700 ring-red-500' },
    LATE: { label: 'Late', classes: 'bg-yellow-100 text-yellow-700 ring-yellow-500' },
  };

  const presentCount = students.filter(s => s.status === 'PRESENT').length;
  const absentCount = students.filter(s => s.status === 'ABSENT').length;
  const lateCount = students.filter(s => s.status === 'LATE').length;

  const buildDetailUrl = (scope: string, status: string) => {
    const params = new URLSearchParams({ scope, status });
    if (dashboardClassId) params.set('classId', dashboardClassId);
    return `/dashboard/attendance/details?${params.toString()}`;
  };

  const { dayName, dateFormatted } = todayDisplay();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-500 text-sm mt-1">Dashboard overview and daily attendance marking</p>
        </div>
      </div>

      {/* View Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-0">
          {[
            { key: 'dashboard' as const, label: 'Dashboard' },
            { key: 'mark' as const, label: 'Mark Attendance' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeView === tab.key
                  ? 'border-[#16a34a] text-[#16a34a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════ DASHBOARD VIEW ═══════════════ */}
      {activeView === 'dashboard' && (
        <div className="space-y-6">
          {/* Dashboard Class Filter */}
          {!isTeacher && (
            <div className="flex items-center gap-4">
              <select
                value={dashboardClassId}
                onChange={e => setDashboardClassId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
              >
                <option value="">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {dashboardLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            </div>
          ) : dashboard ? (
            <>
              {/* Active Term Info + Progress */}
              {dashboard.activeTerm && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-green-700">
                      <strong>Active Term:</strong> {dashboard.activeTerm.name} ({formatDate(dashboard.activeTerm.startDate)} — {formatDate(dashboard.activeTerm.endDate)})
                      <span className="ml-2 text-xs text-green-500">· {dashboard.totalStudents} students</span>
                    </div>
                  </div>
                  {dashboard.termProgress && (
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-3">
                      <div className="bg-white rounded-lg p-2.5 text-center border border-green-100">
                        <p className="text-[10px] text-gray-400 uppercase">Duration</p>
                        <p className="text-sm font-bold text-gray-800">{dashboard.termProgress.durationDays} days</p>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 text-center border border-green-100">
                        <p className="text-[10px] text-gray-400 uppercase">School Days</p>
                        <p className="text-sm font-bold text-gray-800">{dashboard.termProgress.totalSchoolDays}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 text-center border border-green-100">
                        <p className="text-[10px] text-gray-400 uppercase">Days Crossed</p>
                        <p className="text-sm font-bold text-green-700">{dashboard.termProgress.daysCrossed}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 text-center border border-green-100">
                        <p className="text-[10px] text-gray-400 uppercase">Days Left</p>
                        <p className="text-sm font-bold text-blue-700">{dashboard.termProgress.daysRemaining}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 text-center border border-green-100">
                        <p className="text-[10px] text-gray-400 uppercase">Holidays</p>
                        <p className="text-sm font-bold text-orange-600">{dashboard.termProgress.totalHolidays}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 text-center border border-green-100">
                        <p className="text-[10px] text-gray-400 uppercase">Attendance %</p>
                        <p className={`text-sm font-bold ${
                          dashboard.termProgress.overallAttendancePercent >= 80 ? 'text-green-700' :
                          dashboard.termProgress.overallAttendancePercent >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {dashboard.termProgress.overallAttendancePercent}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Today's Attendance */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Today</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Link
                    href={buildDetailUrl('day', 'PRESENT')}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Present</p>
                        <p className="text-2xl font-bold text-green-700 mt-1">{dashboard.today.present}</p>
                        <p className="text-xs text-gray-400">{dashboard.today.total > 0 ? Math.round((dashboard.today.present / dashboard.today.total) * 100) : 0}% of marked</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>
                  <Link
                    href={buildDetailUrl('day', 'ABSENT')}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Absent</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">{dashboard.today.absent}</p>
                        <p className="text-xs text-gray-400">{dashboard.today.total > 0 ? Math.round((dashboard.today.absent / dashboard.today.total) * 100) : 0}% of marked</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>
                  <Link
                    href={buildDetailUrl('day', 'LATE')}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Late</p>
                        <p className="text-2xl font-bold text-yellow-600 mt-1">{dashboard.today.late}</p>
                        <p className="text-xs text-gray-400">{dashboard.today.total > 0 ? Math.round((dashboard.today.late / dashboard.today.total) * 100) : 0}% of marked</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>
                </div>
              </div>

              {/* This Week */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">This Week</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(['PRESENT', 'ABSENT', 'LATE'] as const).map(status => {
                    const colors = { PRESENT: 'text-green-700', ABSENT: 'text-red-600', LATE: 'text-yellow-600' };
                    return (
                      <Link
                        key={status}
                        href={buildDetailUrl('week', status)}
                        className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider">{status.charAt(0) + status.slice(1).toLowerCase()}</p>
                            <p className={`text-2xl font-bold mt-1 ${colors[status]}`}>{dashboard.week[status.toLowerCase() as keyof DashboardStats]}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* This Term */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  This Term {dashboard.activeTerm ? `(${dashboard.activeTerm.name})` : ''}
                </h3>
                {dashboard.activeTerm ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['PRESENT', 'ABSENT', 'LATE'] as const).map(status => {
                      const colors = { PRESENT: 'text-green-700', ABSENT: 'text-red-600', LATE: 'text-yellow-600' };
                      return (
                        <Link
                          key={status}
                          href={buildDetailUrl('term', status)}
                          className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-gray-400 uppercase tracking-wider">{status.charAt(0) + status.slice(1).toLowerCase()}</p>
                              <p className={`text-2xl font-bold mt-1 ${colors[status]}`}>{dashboard.term[status.toLowerCase() as keyof DashboardStats]}</p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No active term. Create a term to track term-based attendance.</p>
                )}
              </div>

              {/* Class Reports */}
              {classes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Class Reports</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {classes.map(cls => (
                      <Link
                        key={cls.id}
                        href={`/dashboard/attendance/report/${cls.id}`}
                        className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow group"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-400 group-hover:text-[#16a34a] transition-colors" />
                          <span className="text-sm font-medium text-gray-800">{cls.name}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-400 text-sm">Failed to load dashboard data.</p>
          )}
        </div>
      )}

      {/* ═══════════════ MARK ATTENDANCE VIEW ═══════════════ */}
      {activeView === 'mark' && (
        <div>
          {/* Day Name & Date Display */}
          <div className="mb-4 bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
            <div>
              <p className="text-lg font-bold text-gray-900">{dayName}</p>
              <p className="text-sm text-gray-500">{dateFormatted}</p>
            </div>
            {termName && (
              <div className={`ml-auto px-3 py-1 rounded-full text-xs font-medium ${
                isTermClosed ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
              }`}>
                {termName} {isTermClosed && '(CLOSED)'}
              </div>
            )}
          </div>

          {/* Unclosed Previous Day Warning */}
          {unclosedDay && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>
                  Attendance for <strong>{formatDate(unclosedDay.dateStr)}</strong> has not been closed yet.
                  Please close it before continuing.
                </span>
              </div>
              <button
                onClick={() => setShowCloseUnclosedConfirm(true)}
                disabled={closingUnclosed}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-60"
              >
                {closingUnclosed ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                Close {formatDate(unclosedDay.dateStr)}
              </button>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap gap-4 mb-6">
            {!isTeacher && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                >
                  <option value="">Select class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {isTeacher && user?.teacher?.class && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-700">
                  {user.teacher.class.name}
                </div>
              </div>
            )}
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          {/* Term Closed Banner */}
          {isTermClosed && (
            <div className="mb-4 p-3 bg-gray-100 border border-gray-200 text-gray-600 rounded-lg text-sm">
              <strong>Term Closed</strong> — attendance editing is disabled.
            </div>
          )}

          {/* Day Closed Banner */}
          {isDayClosed && !isTermClosed && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>Attendance for this day has been closed.</span>
            </div>
          )}

          {/* Day Over Banner */}
          {isDayOver && !isTermClosed && !isDayClosed && !isHeadmistress && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">
              <strong>Day is over</strong> — attendance for past days cannot be edited.
            </div>
          )}

          {saved && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
              Attendance saved successfully!
            </div>
          )}

          {/* Summary strip */}
          {students.length > 0 && (
            <div className="flex gap-4 mb-4 text-sm">
              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full font-medium">Present: {presentCount}</span>
              <span className="px-3 py-1 bg-red-50 text-red-700 rounded-full font-medium">Absent: {absentCount}</span>
              <span className="px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full font-medium">Late: {lateCount}</span>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {selectedClassId ? 'No students in this class.' : 'Select a class to mark attendance.'}
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">#</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Status</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map((student, idx) => (
                      <tr key={student.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-gray-400">{student.studentId}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {(['PRESENT', 'ABSENT', 'LATE'] as const).map(status => (
                              <button
                                key={status}
                                onClick={() => toggleStatus(student.id, status)}
                                disabled={isReadOnly}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                  student.status === status
                                    ? `${statusConfig[status].classes} ring-2`
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                {statusConfig[status].label}
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
                            className={`w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#16a34a] ${isReadOnly ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3">
                {/* Close Attendance button — only after 3 PM and not already closed */}
                {!isDayClosed && !isTermClosed && selectedClassId && (isAfter3PM() || isHeadmistress) && (
                  <button
                    onClick={() => setShowCloseConfirm(true)}
                    disabled={closingDay}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  >
                    {closingDay ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    Close Attendance for Today
                  </button>
                )}
                <button
                  onClick={saveAttendance}
                  disabled={saving || isReadOnly}
                  className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Attendance
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Close Today Confirmation */}
      <ConfirmModal
        isOpen={showCloseConfirm}
        title="Close Attendance for Today"
        message={`Are you sure you want to close attendance for ${dateFormatted}? Once closed, only the headmistress can modify it.`}
        confirmLabel="Yes, Close Attendance"
        confirmClassName="bg-amber-600 hover:bg-amber-700"
        onConfirm={closeAttendanceForDay}
        onCancel={() => setShowCloseConfirm(false)}
        isLoading={closingDay}
      />

      {/* Close Unclosed Day Confirmation */}
      <ConfirmModal
        isOpen={showCloseUnclosedConfirm}
        title="Close Past Attendance"
        message={unclosedDay ? `Are you sure you want to close attendance for ${formatDate(unclosedDay.dateStr)}?` : ''}
        confirmLabel="Yes, Close It"
        confirmClassName="bg-amber-600 hover:bg-amber-700"
        onConfirm={closeUnclosedDay}
        onCancel={() => setShowCloseUnclosedConfirm(false)}
        isLoading={closingUnclosed}
      />
    </div>
  );
}
