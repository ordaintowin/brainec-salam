'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Loader2, Lock, FileText, Calendar, Sun } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import ConfirmModal from '@/components/ConfirmModal';

interface TermDay {
  id: string;
  date: string;
  isHoliday: boolean;
  label?: string | null;
}

interface Term {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'CLOSED';
  closedAt?: string;
  createdAt: string;
  termDays?: TermDay[];
  _count?: { termDays: number };
}

interface TermReport {
  term: { id: string; name: string; startDate: string; endDate: string; status: string };
  totalSchoolDays: number;
  totalRecords: number;
  students: {
    student: {
      id: string;
      studentId: string;
      firstName: string;
      lastName: string;
      className: string;
    };
    present: number;
    absent: number;
    late: number;
    total: number;
    attendancePercent: number;
  }[];
}

const termSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
});

type TermForm = z.infer<typeof termSchema>;

export default function TermsPage() {
  const { user } = useAuth();
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [createError, setCreateError] = useState('');
  const [closing, setClosing] = useState<string | null>(null);
  const [report, setReport] = useState<TermReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [calendarTerm, setCalendarTerm] = useState<Term | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [togglingDay, setTogglingDay] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TermForm>({ resolver: zodResolver(termSchema) });

  const hasActiveTerm = terms.some(t => t.status === 'ACTIVE');

  const fetchTerms = useCallback(async () => {
    try {
      const res = await api.get('/terms');
      setTerms(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTerms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  const onCreate = async (data: TermForm) => {
    setCreateError('');
    try {
      await api.post('/terms', data);
      setShowModal(false);
      reset();
      fetchTerms();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create term';
      setCreateError(msg);
    }
  };

  const closeTerm = async (id: string) => {
    setClosing(id);
    try {
      await api.post(`/terms/${id}/close`);
      fetchTerms();
      if (report?.term.id === id) setReport(null);
      if (calendarTerm?.id === id) setCalendarTerm(null);
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to close term');
    } finally {
      setClosing(null);
      setCloseConfirm(null);
    }
  };

  const viewReport = async (termId: string) => {
    setReportLoading(true);
    setCalendarTerm(null);
    try {
      const res = await api.get(`/terms/${termId}/report`);
      setReport(res.data);
    } catch {
      alert('Failed to load report');
    } finally {
      setReportLoading(false);
    }
  };

  const viewCalendar = async (termId: string) => {
    setCalendarLoading(true);
    setReport(null);
    try {
      const res = await api.get(`/terms/${termId}`);
      setCalendarTerm(res.data);
    } catch {
      alert('Failed to load calendar');
    } finally {
      setCalendarLoading(false);
    }
  };

  const toggleHoliday = async (dayId: string, isHoliday: boolean) => {
    setTogglingDay(dayId);
    try {
      const label = isHoliday ? prompt('Holiday label (optional):') || undefined : undefined;
      await api.patch(`/terms/days/${dayId}/holiday`, { isHoliday, label });
      // Refresh the calendar
      if (calendarTerm) {
        const res = await api.get(`/terms/${calendarTerm.id}`);
        setCalendarTerm(res.data);
      }
    } catch {
      alert('Failed to toggle holiday');
    } finally {
      setTogglingDay(null);
    }
  };

  const handleCreateClick = () => {
    if (hasActiveTerm) {
      setCreateError('Please close the current active term before creating a new one.');
      return;
    }
    reset();
    setCreateError('');
    setShowModal(true);
  };

  // Group calendar days by month
  const groupByMonth = (days: TermDay[]) => {
    const months: Record<string, TermDay[]> = {};
    for (const day of days) {
      const d = new Date(day.date);
      const key = d.toLocaleDateString('en-GH', { month: 'long', year: 'numeric' });
      if (!months[key]) months[key] = [];
      months[key].push(day);
    }
    return months;
  };

  const canManage = user?.role === 'HEADMISTRESS';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Terms</h1>
          <p className="text-gray-500 text-sm mt-1">Manage school terms, calendar, and attendance reports</p>
        </div>
        {canManage && (
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create Term
          </button>
        )}
      </div>

      {/* Warning if active term exists */}
      {hasActiveTerm && createError && !showModal && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">
          {createError}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : terms.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No terms created yet.</p>
          <p className="text-sm mt-1">Create your first term to start organizing attendance.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {terms.map((term) => (
            <div key={term.id} className={`bg-white rounded-xl border p-5 ${term.status === 'ACTIVE' ? 'border-green-200' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{term.name}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      term.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {term.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatDate(term.startDate)} — {formatDate(term.endDate)}
                    {term._count?.termDays != null && (
                      <span className="ml-2 text-xs text-gray-400">· {term._count.termDays} school days</span>
                    )}
                    {term.closedAt && <span className="ml-2 text-xs text-gray-400">· Closed {formatDate(term.closedAt)}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => viewCalendar(term.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                    disabled={calendarLoading}
                  >
                    <Calendar className="w-4 h-4" />
                    Calendar
                  </button>
                  <button
                    onClick={() => viewReport(term.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                    disabled={reportLoading}
                  >
                    <FileText className="w-4 h-4" />
                    Report
                  </button>
                  {term.status === 'ACTIVE' && canManage && (
                    <button
                      onClick={() => setCloseConfirm(term.id)}
                      disabled={closing === term.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg disabled:opacity-60"
                    >
                      {closing === term.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Close Term
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Term Calendar */}
      {calendarTerm && calendarTerm.termDays && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Calendar: {calendarTerm.name}
              </h2>
              <p className="text-sm text-gray-500">
                {calendarTerm.termDays.filter(d => !d.isHoliday).length} school days · {calendarTerm.termDays.filter(d => d.isHoliday).length} holidays
              </p>
            </div>
            <button
              onClick={() => setCalendarTerm(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Close Calendar
            </button>
          </div>

          {Object.entries(groupByMonth(calendarTerm.termDays)).map(([month, days]) => (
            <div key={month} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{month}</h3>
              <div className="grid grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-2">
                {days.map(day => {
                  const d = new Date(day.date);
                  const dayName = d.toLocaleDateString('en-GH', { weekday: 'short' });
                  const dayNum = d.getUTCDate();
                  const today = new Date();
                  today.setUTCHours(0, 0, 0, 0);
                  const isPast = d <= today;
                  const isToday = d.getTime() === today.getTime();

                  return (
                    <div
                      key={day.id}
                      className={`relative p-2 rounded-lg border text-center text-xs transition-all ${
                        day.isHoliday
                          ? 'bg-orange-50 border-orange-200 text-orange-700'
                          : isToday
                          ? 'bg-green-100 border-green-300 text-green-800 ring-2 ring-green-400'
                          : isPast
                          ? 'bg-gray-50 border-gray-200 text-gray-500'
                          : 'bg-white border-gray-200 text-gray-700'
                      }`}
                    >
                      <p className="font-bold text-sm">{dayNum}</p>
                      <p className="text-[10px] text-gray-400">{dayName}</p>
                      {day.isHoliday && (
                        <div className="flex items-center justify-center gap-0.5 mt-0.5">
                          <Sun className="w-3 h-3 text-orange-500" />
                          <span className="text-[9px] text-orange-600 truncate">{day.label || 'Holiday'}</span>
                        </div>
                      )}
                      {canManage && calendarTerm.status === 'ACTIVE' && (
                        <button
                          onClick={() => toggleHoliday(day.id, !day.isHoliday)}
                          disabled={togglingDay === day.id}
                          className="mt-1 text-[10px] underline text-gray-400 hover:text-gray-700 disabled:opacity-50"
                        >
                          {togglingDay === day.id ? '…' : day.isHoliday ? 'Mark School Day' : 'Mark Holiday'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Term Report */}
      {report && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Attendance Report: {report.term.name}
            </h2>
            <button
              onClick={() => setReport(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Close Report
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">School Days</p>
              <p className="text-xl font-bold text-gray-800">{report.totalSchoolDays}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Total Records</p>
              <p className="text-xl font-bold text-gray-800">{report.totalRecords}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Students</p>
              <p className="text-xl font-bold text-gray-800">{report.students.length}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Period</p>
              <p className="text-sm font-bold text-gray-800">{formatDate(report.term.startDate)} — {formatDate(report.term.endDate)}</p>
            </div>
          </div>

          {report.students.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">ID</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Class</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Present</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Absent</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Late</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Total</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.students.map((row) => (
                    <tr key={row.student.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{row.student.firstName} {row.student.lastName}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.student.studentId}</td>
                      <td className="px-4 py-3 text-gray-600">{row.student.className}</td>
                      <td className="px-4 py-3 text-center text-green-700 font-medium">{row.present}</td>
                      <td className="px-4 py-3 text-center text-red-600 font-medium">{row.absent}</td>
                      <td className="px-4 py-3 text-center text-yellow-600 font-medium">{row.late}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{row.total}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          row.attendancePercent >= 80
                            ? 'bg-green-100 text-green-700'
                            : row.attendancePercent >= 60
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {row.attendancePercent}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No attendance records found for this term.</p>
          )}
        </div>
      )}

      {/* Close Term Confirmation */}
      <ConfirmModal
        isOpen={!!closeConfirm}
        title="Close Term"
        message="Are you sure you want to close this term? Once closed, attendance records cannot be edited."
        confirmLabel="Close Term"
        onConfirm={() => closeConfirm && closeTerm(closeConfirm)}
        onCancel={() => setCloseConfirm(null)}
        isLoading={!!closing}
      />

      {/* Create Term Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Create New Term</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{createError}</div>
            )}

            <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term Name *</label>
                <input
                  {...register('name')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                  placeholder="e.g. Term 1 2026"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input type="date" {...register('startDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                  {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                  <input type="date" {...register('endDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                  {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                School days (weekdays only) will be auto-generated. You can mark holidays afterwards.
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Term
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
