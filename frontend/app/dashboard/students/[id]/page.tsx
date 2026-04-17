'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Printer, ChevronLeft, ChevronRight, Calendar, CheckCircle2, XCircle, Clock, TrendingUp, Archive, CreditCard } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import ProfileCard from '@/components/ProfileCard';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import RecordPaymentModal from '@/components/RecordPaymentModal';
import BulkPaymentModal from '@/components/BulkPaymentModal';
import PrintInvoiceModal from '@/components/PrintInvoiceModal';
import { formatDate, formatCurrency } from '@/lib/utils';

interface Student {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  guardianAddress?: string;
  secondaryGuardianName?: string;
  secondaryGuardianPhone?: string;
  enrollmentDate: string;
  photoUrl?: string;
  class?: { id: string; name: string };
}

interface Invoice {
  id: string;
  feeOrder?: { title: string; description?: string };
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: string;
  dueDate: string;
  studentId: string;
  payments?: {
    id: string;
    paidAt: string;
    amount: number;
    method: string;
    reference?: string;
    paidBy: string;
    notes?: string;
  }[];
}

interface TermSummary {
  termId: string;
  termName: string;
  status: string;
  startDate: string;
  endDate: string;
  totalSchoolDays: number;
  daysCrossed: number;
  daysRemaining: number;
  present: number;
  absent: number;
  late: number;
  totalMarked: number;
  attendancePercent: number;
}

interface AttendanceDetail {
  id: string;
  date: string;
  status: string;
  notes?: string;
}

/* ---------- Pagination subcomponent ---------- */
function PaginationBar({
  meta,
  onPageChange,
}: {
  meta: { total: number; page: number; limit: number; totalPages: number };
  onPageChange: (p: number) => void;
}) {
  if (meta.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 px-2">
      <p className="text-xs text-gray-500">
        Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(meta.page - 1)}
          disabled={meta.page <= 1}
          className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: meta.totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === meta.totalPages || Math.abs(p - meta.page) <= 1)
          .reduce<(number | string)[]>((acc, p, i, arr) => {
            if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) {
              acc.push('...');
            }
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            typeof p === 'string' ? (
              <span key={`ellipsis-${i}`} className="px-2 text-xs text-gray-400">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${
                  p === meta.page
                    ? 'bg-[#16a34a] text-white'
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                {p}
              </button>
            ),
          )}
        <button
          onClick={() => onPageChange(meta.page + 1)}
          disabled={meta.page >= meta.totalPages}
          className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Status color map (shared across renders) ---------- */
const STATUS_COLOR_MAP: Record<string, string> = {
  PRESENT: 'text-green-600',
  ABSENT: 'text-red-600',
  LATE: 'text-yellow-600',
};

/* ---------- Clickable count badge ---------- */
function CountBadge({
  count,
  variant,
  onClick,
  title,
}: {
  count: number;
  variant: 'attended' | 'absent' | 'late';
  onClick: () => void;
  title: string;
}) {
  const styles = {
    attended: 'bg-green-50 text-green-700 hover:bg-green-100',
    absent: 'bg-red-50 text-red-700 hover:bg-red-100',
    late: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${styles[variant]}`}
      title={title}
    >
      {count}
    </button>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activeTab, setActiveTab] = useState<'fees' | 'attendance'>('fees');
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; invoiceId: string; studentId: string; balance: number }>({
    open: false, invoiceId: '', studentId: '', balance: 0,
  });
  const [printModal, setPrintModal] = useState<{ open: boolean; invoice: Invoice | null }>({ open: false, invoice: null });
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [bulkPaymentOpen, setBulkPaymentOpen] = useState(false);

  // Attendance History State
  const [termSummaries, setTermSummaries] = useState<TermSummary[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [drillDown, setDrillDown] = useState<{
    open: boolean;
    termId: string;
    termName: string;
    status: string;
    includeLate: boolean;
  } | null>(null);
  const [detailRecords, setDetailRecords] = useState<AttendanceDetail[]>([]);
  const [detailMeta, setDetailMeta] = useState<{ total: number; page: number; limit: number; totalPages: number }>({
    total: 0, page: 1, limit: 10, totalPages: 0,
  });
  const [detailLoading, setDetailLoading] = useState(false);
  const attendedCacheRef = useRef<{ termId: string; records: AttendanceDetail[] } | null>(null);

  // Pagination for past terms archive
  const ARCHIVE_PAGE_SIZE = 5;
  const [archivePage, setArchivePage] = useState(1);

  // Pagination for fee history (invoices)
  const INVOICES_PER_PAGE = 10;
  const [invoicePage, setInvoicePage] = useState(1);

  // Pagination for attendance term summaries
  const TERM_SUMMARIES_PER_PAGE = 10;
  const [termSummaryPage, setTermSummaryPage] = useState(1);

  const canManage = user?.role === 'HEADMISTRESS' || user?.role === 'ADMIN';

  // Split terms into active vs closed
  const activeTerm = useMemo(() => termSummaries.find(t => t.status === 'ACTIVE') || null, [termSummaries]);
  const closedTerms = useMemo(() => termSummaries.filter(t => t.status !== 'ACTIVE'), [termSummaries]);

  // Paginate closed terms
  const closedTermsMeta = useMemo(() => {
    const total = closedTerms.length;
    const totalPages = Math.ceil(total / ARCHIVE_PAGE_SIZE) || 1;
    return { total, page: archivePage, limit: ARCHIVE_PAGE_SIZE, totalPages };
  }, [closedTerms, archivePage]);

  const pagedClosedTerms = useMemo(() => {
    const start = (archivePage - 1) * ARCHIVE_PAGE_SIZE;
    return closedTerms.slice(start, start + ARCHIVE_PAGE_SIZE);
  }, [closedTerms, archivePage]);

  const paginatedTermSummaryData = useMemo(() => {
    const totalTermPages = Math.ceil(closedTerms.length / TERM_SUMMARIES_PER_PAGE);
    const paginatedClosedTerms = closedTerms.slice((termSummaryPage - 1) * TERM_SUMMARIES_PER_PAGE, termSummaryPage * TERM_SUMMARIES_PER_PAGE);
    return { totalTermPages, paginatedClosedTerms };
  }, [closedTerms, termSummaryPage]);

  const fetchStudent = useCallback(async () => {
    try {
      const sRes = await api.get(`/students/${id}`);
      setStudent(sRes.data);
      setInvoices(Array.isArray(sRes.data?.feeInvoices) ? sRes.data.feeInvoices : []);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchAttendanceHistory = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const res = await api.get(`/students/${id}/attendance-history`);
      setTermSummaries(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTermSummaries([]);
    } finally {
      setAttendanceLoading(false);
    }
  }, [id]);

  const fetchDetail = useCallback(async (termId: string, status: string, page = 1, includeLate = false) => {
    setDetailLoading(true);
    try {
      if (status === 'PRESENT' && includeLate) {
        const applyAttendedPage = (records: AttendanceDetail[]) => {
          const limit = 10;
          const total = records.length;
          const totalPages = Math.ceil(total / limit);
          const start = (page - 1) * limit;

          setDetailRecords(records.slice(start, start + limit));
          setDetailMeta({
            total,
            page,
            limit,
            totalPages,
          });
        };

        if (attendedCacheRef.current?.termId === termId) {
          applyAttendedPage(attendedCacheRef.current.records);
          return;
        }

        const fetchAllByStatus = async (statusFilter: 'PRESENT' | 'LATE') => {
          const firstRes = await api.get(`/students/${id}/attendance-history/${termId}`, {
            params: { status: statusFilter, page: 1, limit: 100 },
          });

          const firstPageRecords: AttendanceDetail[] = Array.isArray(firstRes.data?.data)
            ? firstRes.data.data
            : [];
          const totalPages: number = Number(firstRes.data?.meta?.totalPages ?? 1);

          if (totalPages <= 1) return firstPageRecords;

          const remaining: AttendanceDetail[] = [];
          for (let pageNum = 2; pageNum <= totalPages; pageNum += 1) {
            const pageRes = await api.get(`/students/${id}/attendance-history/${termId}`, {
              params: { status: statusFilter, page: pageNum, limit: 100 },
            });
            if (Array.isArray(pageRes.data?.data)) {
              remaining.push(...pageRes.data.data);
            }
          }

          return [
            ...firstPageRecords,
            ...remaining,
          ];
        };

        const [presentRecords, lateRecords] = await Promise.all([
          fetchAllByStatus('PRESENT'),
          fetchAllByStatus('LATE'),
        ]);

        const attendedRecords: AttendanceDetail[] = [
          ...presentRecords,
          ...lateRecords,
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        attendedCacheRef.current = { termId, records: attendedRecords };
        applyAttendedPage(attendedRecords);
        return;
      }

      const res = await api.get(`/students/${id}/attendance-history/${termId}`, {
        params: { status, page, limit: 10 },
      });
      attendedCacheRef.current = null;
      setDetailRecords(Array.isArray(res.data?.data) ? res.data.data : []);
      setDetailMeta(res.data?.meta || { total: 0, page: 1, limit: 10, totalPages: 0 });
    } catch {
      attendedCacheRef.current = null;
      setDetailRecords([]);
      setDetailMeta({ total: 0, page: 1, limit: 10, totalPages: 0 });
    } finally {
      setDetailLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStudent();
  }, [fetchStudent]);

  useEffect(() => {
    if (activeTab === 'attendance') {
      fetchAttendanceHistory();
    }
  }, [activeTab, fetchAttendanceHistory]);

  useEffect(() => {
    setInvoicePage(1);
  }, [invoices.length]);

  useEffect(() => {
    setTermSummaryPage(1);
  }, [closedTerms.length]);

  const handleDrillDown = (termId: string, termName: string, status: string, includeLate = false) => {
    setDrillDown({ open: true, termId, termName, status, includeLate });
    fetchDetail(termId, status, 1, includeLate);
  };
  const openAttendedDrillDown = (termId: string, termName: string) => {
    handleDrillDown(termId, termName, 'PRESENT', true);
  };

  const handleDetailPageChange = (newPage: number) => {
    if (!drillDown) return;
    fetchDetail(drillDown.termId, drillDown.status, newPage, drillDown.includeLate);
  };

  const closeDrillDown = () => {
    setDrillDown(null);
    setDetailRecords([]);
    setDetailMeta({ total: 0, page: 1, limit: 10, totalPages: 0 });
    attendedCacheRef.current = null;
  };

  if (loading) {
    return (
      <div className="p-8 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-32" />
        <div className="h-40 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!student) {
    return <div className="p-8 text-gray-500">Student not found.</div>;
  }

  /* ---------- Render: Active Term Progress Card ---------- */
  const renderActiveTermCard = (term: TermSummary) => {
    const progressPct = term.totalSchoolDays > 0 ? Math.round((term.daysCrossed / term.totalSchoolDays) * 100) : 0;
    const attendedDays = term.present + term.late;

    return (
      <div className="bg-white border border-green-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-5 py-4 border-b border-green-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">{term.termName}</h3>
                <p className="text-xs text-gray-500">
                  {formatDate(term.startDate)} — {formatDate(term.endDate)}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Current Term
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">Term Progress</span>
              <span className="text-xs font-bold text-gray-700">
                {term.daysCrossed} of {term.totalSchoolDays} school days
              </span>
            </div>
            <div className="relative w-full bg-gray-100 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(progressPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1 text-center">{progressPct}% of term completed</p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => openAttendedDrillDown(term.termId, term.termName)}
              title="Present (including late)"
              className="flex flex-col items-center p-3 rounded-lg bg-green-50 hover:bg-green-100 transition-colors cursor-pointer border border-green-100"
            >
              <CheckCircle2 className="w-5 h-5 text-green-600 mb-1" />
              <span className="text-lg font-bold text-green-700">{attendedDays}</span>
              <span className="text-[10px] text-green-600 font-medium">Present (incl. late)</span>
            </button>

            <button
              onClick={() => handleDrillDown(term.termId, term.termName, 'ABSENT')}
              className="flex flex-col items-center p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors cursor-pointer border border-red-100"
            >
              <XCircle className="w-5 h-5 text-red-500 mb-1" />
              <span className="text-lg font-bold text-red-700">{term.absent}</span>
              <span className="text-[10px] text-red-600 font-medium">Absent</span>
            </button>

            <button
              onClick={() => handleDrillDown(term.termId, term.termName, 'LATE')}
              className="flex flex-col items-center p-3 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors cursor-pointer border border-yellow-100"
            >
              <Clock className="w-5 h-5 text-yellow-600 mb-1" />
              <span className="text-lg font-bold text-yellow-700">{term.late}</span>
              <span className="text-[10px] text-yellow-600 font-medium">Late</span>
            </button>

            <div className="flex flex-col items-center p-3 rounded-lg bg-blue-50 border border-blue-100">
              <TrendingUp className="w-5 h-5 text-blue-600 mb-1" />
              <span className={`text-lg font-bold ${
                term.attendancePercent >= 80 ? 'text-green-700' :
                term.attendancePercent >= 60 ? 'text-yellow-700' :
                'text-red-700'
              }`}>
                {term.attendancePercent}%
              </span>
              <span className="text-[10px] text-blue-600 font-medium">Attendance</span>
            </div>
          </div>

          {/* Summary line */}
          <div className="text-xs text-gray-500 text-center bg-gray-50 rounded-lg py-2 px-3">
            Out of <strong className="text-gray-700">{term.totalSchoolDays}</strong> school days,{' '}
            <strong className="text-green-700">{attendedDays}</strong> attended so far
            {term.daysRemaining > 0 && (
              <> · <strong className="text-gray-700">{term.daysRemaining}</strong> days remaining</>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ---------- Render: Past Terms Archive Table ---------- */
  const renderPastTermsTable = (terms: TermSummary[]) => {
    if (terms.length === 0) return null;

    return (
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Archive className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Past Terms</h3>
          <span className="text-xs text-gray-400">({closedTerms.length} term{closedTerms.length !== 1 ? 's' : ''})</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Term</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Period</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-semibold">School Days</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-semibold">Present (incl. late)</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-semibold">Absent</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-semibold">Late</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-semibold">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {terms.map(term => {
                  const attended = term.present + term.late;
                  return (
                    <tr key={term.termId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-gray-900 text-sm">{term.termName}</span>
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                            CLOSED
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDate(term.startDate)} — {formatDate(term.endDate)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-gray-700 font-medium">{term.totalSchoolDays}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CountBadge
                          count={attended}
                          variant="attended"
                          onClick={() => openAttendedDrillDown(term.termId, term.termName)}
                          title="View attended days (present + late)"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CountBadge
                          count={term.absent}
                          variant="absent"
                          onClick={() => handleDrillDown(term.termId, term.termName, 'ABSENT')}
                          title="View absent days"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CountBadge
                          count={term.late}
                          variant="late"
                          onClick={() => handleDrillDown(term.termId, term.termName, 'LATE')}
                          title="View late days"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            term.attendancePercent >= 80
                              ? 'bg-green-100 text-green-700'
                              : term.attendancePercent >= 60
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {term.attendancePercent}%
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {attended}/{term.totalSchoolDays} days
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination for past terms - handled by outer termSummaryPage pagination */}
        </div>
      </div>
    );
  };

  /* ---------- Render: Drill-Down Detail View ---------- */
  const renderDrillDown = () => {
    if (!drillDown) return null;
    const drillDownStatusLabel = drillDown.status === 'PRESENT' && drillDown.includeLate
      ? 'attended'
      : drillDown.status.toLowerCase();
    // "Attended" in this view means PRESENT + LATE, so includeLate must be true for it to be active.
    const isFilterActive = (value: 'PRESENT' | 'ABSENT' | 'LATE') =>
      drillDown.status === value && (value !== 'PRESENT' || drillDown.includeLate);

    return (
      <div>
        {/* Drill-down header */}
        <div className="flex items-center gap-3 mb-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <button
            onClick={closeDrillDown}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900">
              {drillDown.termName}
            </h3>
            <p className="text-xs text-gray-500">
              Showing all{' '}
              <span className={`font-semibold ${drillDownStatusLabel === 'attended' ? 'text-green-600' : (STATUS_COLOR_MAP[drillDown.status] || 'text-gray-600')}`}>
                {drillDownStatusLabel}
              </span>{' '}
              days — {detailMeta.total} record{detailMeta.total !== 1 ? 's' : ''}
            </p>
          </div>
          {/* Filter chips */}
          <div className="hidden sm:flex items-center gap-1">
            {([
              { value: 'PRESENT', label: 'Present' },
              { value: 'ABSENT', label: 'Absent' },
              { value: 'LATE', label: 'Late' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  const includeLate = value === 'PRESENT';
                  setDrillDown({ ...drillDown, status: value, includeLate });
                  fetchDetail(drillDown.termId, value, 1, includeLate);
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  isFilterActive(value)
                    ? value === 'ABSENT'
                      ? 'bg-red-100 text-red-700'
                      : value === 'LATE'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {detailLoading ? (
          <div className="animate-pulse space-y-3 py-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : detailRecords.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-400 text-sm">No {drillDownStatusLabel} records found for this term.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold w-12">#</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Day</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailRecords.map((rec, idx) => {
                    const d = new Date(rec.date);
                    const dayName = d.toLocaleDateString('en-GH', { weekday: 'long' });
                    const rowNum = (detailMeta.page - 1) * detailMeta.limit + idx + 1;
                    return (
                      <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs font-mono">{rowNum}</td>
                        <td className="px-4 py-3 text-gray-700 font-medium">{formatDate(rec.date)}</td>
                        <td className="px-4 py-3 text-gray-500">{dayName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            rec.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                            rec.status === 'LATE' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {rec.status === 'PRESENT' && <CheckCircle2 className="w-3 h-3" />}
                            {rec.status === 'ABSENT' && <XCircle className="w-3 h-3" />}
                            {rec.status === 'LATE' && <Clock className="w-3 h-3" />}
                            {rec.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{rec.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-gray-100 px-4 py-2">
              <PaginationBar meta={detailMeta} onPageChange={handleDetailPageChange} />
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ---------- Render: Fees Tab ---------- */
  const renderFeesTab = () => {
    const outstandingInvoices = invoices.filter(inv => Number(inv.balance) > 0);
    const selectedInvoicesList = outstandingInvoices.filter(inv => selectedInvoiceIds.has(inv.id));
    const totalSelected = selectedInvoicesList.reduce((sum, inv) => sum + Number(inv.balance), 0);
    const allOutstandingSelected = outstandingInvoices.length > 0 && outstandingInvoices.every(inv => selectedInvoiceIds.has(inv.id));

    const toggleInvoice = (invId: string) => {
      setSelectedInvoiceIds(prev => {
        const next = new Set(prev);
        if (next.has(invId)) next.delete(invId);
        else next.add(invId);
        return next;
      });
    };

    const toggleAll = () => {
      if (allOutstandingSelected) {
        setSelectedInvoiceIds(new Set());
      } else {
        setSelectedInvoiceIds(new Set(outstandingInvoices.map(inv => inv.id)));
      }
    };

    const totalInvoicePages = Math.ceil(invoices.length / INVOICES_PER_PAGE);
    const paginatedInvoices = invoices.slice((invoicePage - 1) * INVOICES_PER_PAGE, invoicePage * INVOICES_PER_PAGE);

    return (
      <div>
        {/* Bulk payment action bar */}
        {canManage && selectedInvoiceIds.size > 0 && (
          <div className="mb-3 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-green-800">
                {selectedInvoiceIds.size} invoice{selectedInvoiceIds.size !== 1 ? 's' : ''} selected
              </span>
              <span className="text-sm text-green-700">
                Total: <span className="font-bold">{formatCurrency(totalSelected)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedInvoiceIds(new Set())}
                className="text-xs text-green-600 hover:text-green-800 underline"
              >
                Clear
              </button>
              <button
                onClick={() => setBulkPaymentOpen(true)}
                className="flex items-center gap-1.5 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                <CreditCard className="w-4 h-4" />
                Bulk Payment
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          {invoices.length === 0 ? (
            <p className="text-gray-400 text-sm py-4">No invoices found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {canManage && outstandingInvoices.length > 0 && (
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allOutstandingSelected}
                        onChange={toggleAll}
                        className="w-4 h-4 accent-[#16a34a] cursor-pointer"
                        title="Select all outstanding invoices"
                      />
                    </th>
                  )}
                  {canManage && outstandingInvoices.length === 0 && <th className="px-4 py-3 w-8" />}
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Invoice #</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Fee Type</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Total</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Paid</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Balance</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Due Date</th>
                  {canManage && <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedInvoices.map(inv => {
                  const hasBalance = Number(inv.balance) > 0;
                  const isChecked = selectedInvoiceIds.has(inv.id);
                  return (
                    <tr key={inv.id} className={`hover:bg-gray-50 ${isChecked ? 'bg-green-50' : ''}`}>
                      {canManage && (
                        <td className="px-4 py-3 w-8">
                          {hasBalance ? (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleInvoice(inv.id)}
                              className="w-4 h-4 accent-[#16a34a] cursor-pointer"
                            />
                          ) : (
                            <span className="inline-block w-4 h-4" />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 font-mono text-xs">INV-{inv.id.slice(-6).toUpperCase()}</td>
                      <td className="px-4 py-3">{inv.feeOrder?.title || '—'}</td>
                      <td className="px-4 py-3">{formatCurrency(inv.amountDue)}</td>
                      <td className="px-4 py-3 text-green-700">{formatCurrency(inv.amountPaid)}</td>
                      <td className="px-4 py-3 text-red-600">{formatCurrency(inv.balance)}</td>
                      <td className="px-4 py-3"><PaymentStatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3">{formatDate(inv.dueDate)}</td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {hasBalance && (
                              <button
                                onClick={() => setPaymentModal({ open: true, invoiceId: inv.id, studentId: inv.studentId, balance: inv.balance })}
                                className="text-xs bg-[#16a34a] hover:bg-green-700 text-white px-3 py-1 rounded-md"
                              >
                                Record Payment
                              </button>
                            )}
                            <button
                              onClick={() => setPrintModal({ open: true, invoice: inv })}
                              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                              title="Print invoice"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {totalInvoicePages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">Page {invoicePage} of {totalInvoicePages} ({invoices.length} total)</p>
            <div className="flex gap-1">
              <button onClick={() => setInvoicePage(p => p - 1)} disabled={invoicePage <= 1} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40">Previous</button>
              <button onClick={() => setInvoicePage(p => p + 1)} disabled={invoicePage >= totalInvoicePages} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Student Profile</h1>
        {canManage && (
          <button
            onClick={() => router.push(`/dashboard/students/${id}/edit`)}
            className="ml-auto flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
        )}
      </div>

      <ProfileCard
        name={`${student.firstName} ${student.lastName}`}
        photoUrl={student.photoUrl}
        idBadge={`ID: ${student.studentId}`}
        subtitle={student.class?.name}
        details={[
          { label: 'Date of Birth', value: formatDate(student.dateOfBirth) },
          { label: 'Gender', value: student.gender },
          { label: 'Class', value: student.class?.name || '—' },
          { label: 'Enrollment Date', value: formatDate(student.enrollmentDate) },
          { label: 'Guardian', value: student.guardianName },
          { label: 'Guardian Phone', value: student.guardianPhone },
          { label: 'Guardian Email', value: student.guardianEmail || '—' },
          { label: 'Address', value: student.guardianAddress || '—' },
          ...(student.secondaryGuardianName ? [{ label: 'Secondary Guardian', value: student.secondaryGuardianName }] : []),
          ...(student.secondaryGuardianPhone ? [{ label: 'Secondary Guardian Phone', value: student.secondaryGuardianPhone }] : []),
        ]}
      />

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200">
        <div className="flex gap-0">
          {(['fees', 'attendance'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); closeDrillDown(); }}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-[#16a34a] text-[#16a34a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'fees' ? 'Fee History' : 'Attendance History'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === 'fees' && renderFeesTab()}

        {activeTab === 'attendance' && !drillDown && (
          <div>
            {attendanceLoading ? (
              <div className="animate-pulse space-y-4 py-4">
                <div className="h-48 bg-gray-100 rounded-xl" />
                <div className="h-8 bg-gray-100 rounded w-40" />
                {[1, 2].map(i => (
                  <div key={i} className="h-14 bg-gray-100 rounded" />
                ))}
              </div>
            ) : termSummaries.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-400 text-sm">No attendance records found.</p>
                <p className="text-gray-300 text-xs mt-1">Attendance will appear here once terms are created and attendance is marked.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Active term progress card — always shown */}
                {activeTerm && renderActiveTermCard(activeTerm)}

                {/* Past terms archive table — paginated */}
                {renderPastTermsTable(paginatedTermSummaryData.paginatedClosedTerms)}

                {/* Edge case: no active term and no closed terms */}
                {!activeTerm && closedTerms.length === 0 && (
                  <p className="text-gray-400 text-sm py-4">No attendance data available.</p>
                )}

                {/* Term summaries pagination */}
                {paginatedTermSummaryData.totalTermPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-4">
                    <p className="text-sm text-gray-500">Page {termSummaryPage} of {paginatedTermSummaryData.totalTermPages} ({closedTerms.length} total)</p>
                    <div className="flex gap-1">
                      <button onClick={() => setTermSummaryPage(p => p - 1)} disabled={termSummaryPage <= 1} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40">Previous</button>
                      <button onClick={() => setTermSummaryPage(p => p + 1)} disabled={termSummaryPage >= paginatedTermSummaryData.totalTermPages} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'attendance' && drillDown && renderDrillDown()}
      </div>

      <RecordPaymentModal
        isOpen={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, invoiceId: '', studentId: '', balance: 0 })}
        invoiceId={paymentModal.invoiceId}
        studentId={paymentModal.studentId}
        balance={paymentModal.balance}
        onSuccess={fetchStudent}
      />

      <BulkPaymentModal
        isOpen={bulkPaymentOpen}
        onClose={() => setBulkPaymentOpen(false)}
        studentId={student.id}
        studentName={`${student.firstName} ${student.lastName}`}
        studentCode={student.studentId}
        selectedInvoices={invoices
          .filter(inv => selectedInvoiceIds.has(inv.id) && Number(inv.balance) > 0)
          .map(inv => ({ id: inv.id, feeOrderTitle: inv.feeOrder?.title || '—', balance: Number(inv.balance) }))}
        onSuccess={() => {
          setSelectedInvoiceIds(new Set());
          fetchStudent();
        }}
      />

      {printModal.invoice && (
        <PrintInvoiceModal
          isOpen={printModal.open}
          onClose={() => setPrintModal({ open: false, invoice: null })}
          invoice={{
            ...printModal.invoice,
            student: {
              studentId: student.studentId,
              firstName: student.firstName,
              lastName: student.lastName,
              class: student.class,
              guardianName: student.guardianName,
              guardianPhone: student.guardianPhone,
            },
          }}
        />
      )}
    </div>
  );
}
