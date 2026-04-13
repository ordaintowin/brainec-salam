'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Save, Loader2, ChevronRight, FileText } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

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

interface DashboardData {
  today: DashboardStats;
  week: DashboardStats;
  term: DashboardStats;
  totalStudents: number;
  activeTerm: { id: string; name: string; startDate: string; endDate: string } | null;
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
  const [hasActiveTerm, setHasActiveTerm] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardClassId, setDashboardClassId] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const isTeacher = user?.role === 'TEACHER';
  const isHeadmistress = user?.role === 'HEADMISTRESS';
  const isReadOnly = isTermClosed || (isDayOver && !isHeadmistress) || !hasActiveTerm;

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
        setHasActiveTerm(false);
      } else {
        attRecords = attRes.data?.records || [];
        setTermName(attRes.data?.termName || null);
        setIsTermClosed(attRes.data?.isTermClosed || false);
        setIsDayOver(attRes.data?.isDayOver || false);
        setHasActiveTerm(attRes.data?.hasActiveTerm ?? true);
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
              {/* Active Term Info */}
              {dashboard.activeTerm && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                  <strong>Active Term:</strong> {dashboard.activeTerm.name} ({formatDate(dashboard.activeTerm.startDate)} — {formatDate(dashboard.activeTerm.endDate)})
                  <span className="ml-2 text-xs text-green-500">· {dashboard.totalStudents} students</span>
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
                  <Link
                    href={buildDetailUrl('week', 'PRESENT')}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Present</p>
                        <p className="text-2xl font-bold text-green-700 mt-1">{dashboard.week.present}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>
                  <Link
                    href={buildDetailUrl('week', 'ABSENT')}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Absent</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">{dashboard.week.absent}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>
                  <Link
                    href={buildDetailUrl('week', 'LATE')}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Late</p>
                        <p className="text-2xl font-bold text-yellow-600 mt-1">{dashboard.week.late}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </Link>
                </div>
              </div>

              {/* This Term */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  This Term {dashboard.activeTerm ? `(${dashboard.activeTerm.name})` : ''}
                </h3>
                {dashboard.activeTerm ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Link
                      href={buildDetailUrl('term', 'PRESENT')}
                      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wider">Present</p>
                          <p className="text-2xl font-bold text-green-700 mt-1">{dashboard.term.present}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </div>
                    </Link>
                    <Link
                      href={buildDetailUrl('term', 'ABSENT')}
                      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wider">Absent</p>
                          <p className="text-2xl font-bold text-red-600 mt-1">{dashboard.term.absent}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </div>
                    </Link>
                    <Link
                      href={buildDetailUrl('term', 'LATE')}
                      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wider">Late</p>
                          <p className="text-2xl font-bold text-yellow-600 mt-1">{dashboard.term.late}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </div>
                    </Link>
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

          {/* No Active Term Banner */}
          {!hasActiveTerm && !loading && selectedClassId && (
            <div className="mb-4 p-3 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg text-sm">
              <strong>No active term</strong> — attendance cannot be marked until a term is opened. Please go to <a href="/dashboard/terms" className="underline font-medium">Terms</a> to create or activate a term.
            </div>
          )}

          {/* Term Info Banner */}
          {termName && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between ${
              isTermClosed ? 'bg-gray-100 border border-gray-200 text-gray-600' : 'bg-green-50 border border-green-200 text-green-700'
            }`}>
              <span>
                <strong>Term:</strong> {termName}
                {isTermClosed && <span className="ml-2 text-xs font-medium bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">CLOSED — editing disabled</span>}
              </span>
            </div>
          )}

          {/* Day Over Banner */}
          {isDayOver && !isTermClosed && !isHeadmistress && (
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

              <div className="flex justify-end">
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
    </div>
  );
}
