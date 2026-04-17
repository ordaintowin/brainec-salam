'use client';
import { Fragment, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  X,
  Loader2,
  Lock,
  FileText,
  Calendar,
  Sun,
  Pencil,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react';
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

interface SchoolClass {
  id: string;
  name: string;
}

interface AttendanceRecord {
  student: {
    id: string;
    studentId: string;
    firstName: string;
    lastName: string;
  };
  attendance: {
    status: 'PRESENT' | 'ABSENT' | 'LATE';
    notes?: string;
  } | null;
}

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | null;
type NonNullAttendanceStatus = Exclude<AttendanceStatus, null>;

interface CalendarDayClassReport {
  classId: string;
  className: string;
  records: AttendanceRecord[];
  present: number;
  absent: number;
  late: number;
  total: number;
}

const REPORT_TABLE_COLUMN_COUNT = 7;
const NOT_MARKED_LABEL = 'Not Marked';
const DAY_STATUS_BADGE_STYLES: Record<NonNullAttendanceStatus | 'NOT_MARKED', string> = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-700',
  LATE: 'bg-amber-100 text-amber-700',
  NOT_MARKED: 'bg-gray-100 text-gray-600',
};

const calculateDayAttendancePercent = (present: number, late: number, total: number) =>
  total > 0 ? Math.round(((present + late) / total) * 100) : 0;

const getAttendedCount = (present: number, late: number) => present + late;

const getNotMarkedCount = (row: CalendarDayClassReport) =>
  Math.max(row.total - (row.present + row.absent + row.late), 0);

const escapeCsvValue = (value: string | number) => {
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

const rowsToCsv = (rows: Array<Record<string, string | number>>) => {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const headerRow = headers.map(escapeCsvValue).join(',');
  const dataRows = rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? '')).join(','));
  return [headerRow, ...dataRows].join('\n');
};

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
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [editError, setEditError] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(null);
  const [selectedDayReports, setSelectedDayReports] = useState<CalendarDayClassReport[]>([]);
  const [expandedDayClasses, setExpandedDayClasses] = useState<Set<string>>(new Set());
  const [selectedDayLoading, setSelectedDayLoading] = useState(false);
  const [selectedDayError, setSelectedDayError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TermForm>({ resolver: zodResolver(termSchema) });

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    formState: { errors: editErrors, isSubmitting: editSubmitting },
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
    setSelectedCalendarDay(null);
    setSelectedDayReports([]);
    setSelectedDayError('');
    setReportSearch('');
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
    setReportSearch('');
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
    if (!isHoliday && !window.confirm('Remove holiday and mark as school day?')) {
      return;
    }
    setTogglingDay(dayId);
    try {
      const label = isHoliday ? prompt('Holiday label (optional):') || undefined : undefined;
      await api.patch(`/terms/days/${dayId}/holiday`, { isHoliday, label });
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

  useEffect(() => {
    if (!selectedCalendarDay) {
      setSelectedDayReports([]);
      setExpandedDayClasses(new Set());
      setSelectedDayError('');
      return;
    }

    let cancelled = false;

    const fetchDayReport = async () => {
      setSelectedDayLoading(true);
      setSelectedDayError('');
      try {
        const classesRes = await api.get('/classes');
        const classes: SchoolClass[] = classesRes.data?.classes || classesRes.data || [];

        const reports = await Promise.all(
          classes.map(async (schoolClass): Promise<CalendarDayClassReport> => {
            const attRes = await api.get('/attendance', {
              params: { classId: schoolClass.id, date: selectedCalendarDay },
            });
            const records: AttendanceRecord[] = Array.isArray(attRes.data)
              ? attRes.data
              : attRes.data?.records || [];

            const present = records.filter((r) => r.attendance?.status === 'PRESENT').length;
            const absent = records.filter((r) => r.attendance?.status === 'ABSENT').length;
            const late = records.filter((r) => r.attendance?.status === 'LATE').length;

            return {
              classId: schoolClass.id,
              className: schoolClass.name,
              records,
              present,
              absent,
              late,
              total: records.length,
            };
          }),
        );

        if (!cancelled) {
          setSelectedDayReports(reports);
          setExpandedDayClasses(new Set());
        }
      } catch {
        if (!cancelled) {
          setSelectedDayReports([]);
          setExpandedDayClasses(new Set());
          setSelectedDayError('Failed to load attendance report for this day.');
        }
      } finally {
        if (!cancelled) {
          setSelectedDayLoading(false);
        }
      }
    };

    fetchDayReport();

    return () => {
      cancelled = true;
    };
  }, [selectedCalendarDay]);

  const handleCreateClick = () => {
    if (hasActiveTerm) {
      setCreateError('Please close the current active term before creating a new one.');
      return;
    }
    reset();
    setCreateError('');
    setShowModal(true);
  };

  const openEditModal = (term: Term) => {
    resetEdit({
      name: term.name,
      startDate: term.startDate.slice(0, 10),
      endDate: term.endDate.slice(0, 10),
    });
    setEditError('');
    setEditingTerm(term);
    setIsEditModalOpen(true);
  };

  const onEdit = async (data: TermForm) => {
    if (!editingTerm) return;
    setEditError('');
    try {
      await api.patch(`/terms/${editingTerm.id}`, data);
      setIsEditModalOpen(false);
      setEditingTerm(null);
      fetchTerms();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update term';
      setEditError(msg);
    }
  };

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

  const filteredReportStudents = useMemo(() => {
    if (!report) return [];
    const query = reportSearch.trim().toLowerCase();
    if (!query) return report.students;
    return report.students.filter((row) => {
      const fullName = `${row.student.firstName} ${row.student.lastName}`.toLowerCase();
      const studentId = row.student.studentId.toLowerCase();
      return fullName.includes(query) || studentId.includes(query);
    });
  }, [report, reportSearch]);

  const canManage = user?.role === 'HEADMISTRESS';

  const toggleDayClassExpanded = (classId: string) => {
    setExpandedDayClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: AttendanceStatus) => {
    const effectiveStatus = status ?? 'NOT_MARKED';
    const label = effectiveStatus === 'NOT_MARKED' ? NOT_MARKED_LABEL : effectiveStatus;
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${DAY_STATUS_BADGE_STYLES[effectiveStatus]}`}> 
        {label}
      </span>
    );
  };

  const handleDayExcelDownload = () => {
    if (!selectedCalendarDay || selectedDayReports.length === 0) return;

    const summaryRows = selectedDayReports.map((cls) => {
      const presentCount = cls.records.filter((r) => r.attendance?.status === 'PRESENT').length;
      const late = cls.records.filter((r) => r.attendance?.status === 'LATE').length;
      const attendedCount = getAttendedCount(presentCount, late);
      const absent = cls.records.filter((r) => r.attendance?.status === 'ABSENT').length;
      const notMarked = cls.records.filter((r) => !r.attendance).length;
      const total = cls.records.length;
      const attendancePct = total > 0
        ? Math.round((attendedCount / total) * 100)
        : 0;
      return {
        'Class': cls.className,
        'Attended': attendedCount,
        'Absent': absent,
        'Late': late,
        'Not Marked': notMarked,
        'Total': total,
        'Attendance %': `${attendancePct}%`,
      };
    });

    const detailsRows = selectedDayReports.flatMap((cls) =>
      cls.records.map((r) => ({
        'Class': cls.className,
        'Student ID': r.student.studentId,
        'Student Name': `${r.student.firstName} ${r.student.lastName}`,
        'Status': r.attendance?.status ?? NOT_MARKED_LABEL,
        'Notes': r.attendance?.notes ?? '',
      }))
    );

    const csvContent = [
      'Summary',
      rowsToCsv(summaryRows),
      '',
      'Details',
      rowsToCsv(detailsRows),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Attendance_${selectedCalendarDay}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

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
                  {canManage && (
                    <button
                      onClick={() => openEditModal(term)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
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
              onClick={() => {
                setCalendarTerm(null);
                setSelectedCalendarDay(null);
                setSelectedDayReports([]);
                setExpandedDayClasses(new Set());
                setSelectedDayError('');
              }}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Close Calendar
            </button>
          </div>

          {Object.entries(groupByMonth(calendarTerm.termDays)).map(([month, days]) => (
            <div key={month} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{month}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-2">
                {days.map(day => {
                  const dayDate = day.date.split('T')[0];
                  const d = new Date(`${dayDate}T00:00:00Z`);
                  const dayName = d.toLocaleDateString('en-GH', { weekday: 'short' });
                  const dayNum = d.getUTCDate();
                  const todayDate = new Date().toISOString().slice(0, 10);
                  const isPast = dayDate < todayDate;
                  const isToday = dayDate === todayDate;
                  const isSelected = selectedCalendarDay === dayDate;
                  const shouldDisableMarkHoliday = !day.isHoliday && isPast && !isToday;

                  return (
                    <div
                      key={day.id}
                      onClick={() => setSelectedCalendarDay(prev => (prev === dayDate ? null : dayDate))}
                      className={`relative p-2 rounded-lg border text-center text-xs transition-all cursor-pointer ${
                        day.isHoliday
                          ? 'bg-orange-50 border-orange-200 text-orange-700'
                          : isToday
                          ? 'bg-green-100 border-green-300 text-green-800 ring-2 ring-green-400'
                          : isPast
                          ? 'bg-gray-50 border-gray-200 text-gray-500'
                          : 'bg-white border-gray-200 text-gray-700'
                      } ${isSelected ? 'ring-2 ring-[#16a34a]' : ''}`}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleHoliday(day.id, !day.isHoliday);
                          }}
                          disabled={togglingDay === day.id || shouldDisableMarkHoliday}
                          className="mt-1 text-[10px] underline text-gray-400 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

          {selectedCalendarDay && (
            <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-900">
                  Attendance for {new Date(`${selectedCalendarDay}T00:00:00Z`).toLocaleDateString('en-GH', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </h3>
                <button
                  onClick={handleDayExcelDownload}
                  disabled={selectedDayLoading || !!selectedDayError || selectedDayReports.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-[#16a34a] hover:bg-green-700 text-white rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Download CSV
                </button>
              </div>

              {selectedDayLoading ? (
                <p className="text-sm text-gray-500 mt-3">Loading day report...</p>
              ) : selectedDayError ? (
                <p className="text-sm text-red-600 mt-3">{selectedDayError}</p>
              ) : selectedDayReports.length === 0 ? (
                <p className="text-sm text-gray-500 mt-3">No classes found.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium uppercase">Class</th>
                        <th className="text-center px-4 py-2 text-xs text-gray-400 font-medium uppercase">Attended</th>
                        <th className="text-center px-4 py-2 text-xs text-gray-400 font-medium uppercase">Absent</th>
                        <th className="text-center px-4 py-2 text-xs text-gray-400 font-medium uppercase">Late</th>
                        <th className="text-center px-4 py-2 text-xs text-gray-400 font-medium uppercase">Attendance %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedDayReports.map((row) => {
                        const total = row.total;
                        const attendancePercent = calculateDayAttendancePercent(row.present, row.late, total);
                        const isExpanded = expandedDayClasses.has(row.classId);
                        return (
                          <Fragment key={row.classId}> 
                            <tr
                              onClick={() => toggleDayClassExpanded(row.classId)}
                              className="cursor-pointer hover:bg-gray-50"
                            >
                              <td className="px-4 py-2 font-medium text-gray-800">
                                <div className="flex items-center gap-2">
                                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                  {row.className}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-center text-green-700 font-medium">{getAttendedCount(row.present, row.late)}</td>
                              <td className="px-4 py-2 text-center text-red-600 font-medium">{row.absent}</td>
                              <td className="px-4 py-2 text-center text-yellow-600 font-medium">{row.late}</td>
                              <td className="px-4 py-2 text-center text-gray-700">{total > 0 ? `${attendancePercent}%` : '—'}</td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-gray-50/50">
                                <td colSpan={5} className="px-4 py-3">
                                  <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
                                    <table className="w-full text-xs md:text-sm">
                                      <thead>
                                        <tr className="bg-gray-50 border-b">
                                          <th className="text-left px-3 py-2 text-[11px] text-gray-400 font-medium uppercase">Student ID</th>
                                          <th className="text-left px-3 py-2 text-[11px] text-gray-400 font-medium uppercase">Student Name</th>
                                          <th className="text-left px-3 py-2 text-[11px] text-gray-400 font-medium uppercase">Status</th>
                                          <th className="text-left px-3 py-2 text-[11px] text-gray-400 font-medium uppercase">Notes</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {row.records.length > 0 ? row.records.map((record) => (
                                          <tr key={record.student.id}>
                                            <td className="px-3 py-2 text-gray-600">{record.student.studentId}</td>
                                            <td className="px-3 py-2 font-medium text-gray-800"> 
                                              {record.student.firstName} {record.student.lastName}
                                            </td>
                                            <td className="px-3 py-2">
                                              {getStatusBadge(record.attendance?.status ?? null)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">{record.attendance?.notes || '—'}</td>
                                          </tr>
                                        )) : (
                                          <tr>
                                            <td colSpan={4} className="px-3 py-3 text-center text-gray-400">
                                              No student records found.
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">School Days</p>
              <p className="text-xl font-bold text-gray-800">{report.totalSchoolDays}</p>
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
              <div className="p-4 border-b border-gray-200">
                <input
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="Search by student name or ID"
                  className="w-full md:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">ID</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Class</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Attended</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Absent</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Late</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredReportStudents.length > 0 ? (
                    filteredReportStudents.map((row) => {
                      const total = row.present + row.absent + row.late;
                      const attendancePercent = total > 0
                        ? Math.round((getAttendedCount(row.present, row.late) / total) * 100)
                        : 0;
                      return (
                        <tr key={row.student.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{row.student.firstName} {row.student.lastName}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{row.student.studentId}</td>
                          <td className="px-4 py-3 text-gray-600">{row.student.className}</td>
                          <td className="px-4 py-3 text-center text-green-700 font-medium">{getAttendedCount(row.present, row.late)}</td>
                          <td className="px-4 py-3 text-center text-red-600 font-medium">{row.absent}</td>
                          <td className="px-4 py-3 text-center text-yellow-600 font-medium">{row.late}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              attendancePercent >= 80
                                ? 'bg-green-100 text-green-700'
                                : attendancePercent >= 60
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                            }`}> 
                              {attendancePercent}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={REPORT_TABLE_COLUMN_COUNT} className="px-4 py-6 text-center text-sm text-gray-400">
                        No students match your search.
                      </td>
                    </tr>
                  )}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* Edit Term Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setIsEditModalOpen(false);
              setEditingTerm(null);
            }}
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Edit Term</h2>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingTerm(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{editError}</div>
            )}

            <form onSubmit={handleEditSubmit(onEdit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term Name *</label>
                <input
                  {...registerEdit('name')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                />
                {editErrors.name && <p className="text-red-500 text-xs mt-1">{editErrors.name.message}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input type="date" {...registerEdit('startDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                  {editErrors.startDate && <p className="text-red-500 text-xs mt-1">{editErrors.startDate.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                  <input type="date" {...registerEdit('endDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                  {editErrors.endDate && <p className="text-red-500 text-xs mt-1">{editErrors.endDate.message}</p>}
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingTerm(null);
                  }}
                  className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 text-sm text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2"
                >
                  {editSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
