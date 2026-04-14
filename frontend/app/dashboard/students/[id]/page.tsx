'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import ProfileCard from '@/components/ProfileCard';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import RecordPaymentModal from '@/components/RecordPaymentModal';
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

  // Attendance History State
  const [termSummaries, setTermSummaries] = useState<TermSummary[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [drillDown, setDrillDown] = useState<{
    open: boolean;
    termId: string;
    termName: string;
    status: string;
  } | null>(null);
  const [detailRecords, setDetailRecords] = useState<AttendanceDetail[]>([]);
  const [detailMeta, setDetailMeta] = useState<{ total: number; page: number; limit: number; totalPages: number }>({
    total: 0, page: 1, limit: 10, totalPages: 0,
  });
  const [detailLoading, setDetailLoading] = useState(false);

  const canManage = user?.role === 'HEADMISTRESS' || user?.role === 'ADMIN';

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

  const fetchDetail = useCallback(async (termId: string, status: string, page = 1) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/students/${id}/attendance-history/${termId}`, {
        params: { status, page, limit: 10 },
      });
      setDetailRecords(Array.isArray(res.data?.data) ? res.data.data : []);
      setDetailMeta(res.data?.meta || { total: 0, page: 1, limit: 10, totalPages: 0 });
    } catch {
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

  const handleDrillDown = (termId: string, termName: string, status: string) => {
    setDrillDown({ open: true, termId, termName, status });
    fetchDetail(termId, status, 1);
  };

  const handleDetailPageChange = (newPage: number) => {
    if (!drillDown) return;
    fetchDetail(drillDown.termId, drillDown.status, newPage);
  };

  const closeDrillDown = () => {
    setDrillDown(null);
    setDetailRecords([]);
    setDetailMeta({ total: 0, page: 1, limit: 10, totalPages: 0 });
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
        {activeTab === 'fees' && (
          <div className="overflow-x-auto">
            {invoices.length === 0 ? (
              <p className="text-gray-400 text-sm py-4">No invoices found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
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
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50">
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
                            {inv.balance > 0 && (
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
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'attendance' && !drillDown && (
          <div>
            {attendanceLoading ? (
              <div className="animate-pulse space-y-3 py-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-gray-100 rounded" />
                ))}
              </div>
            ) : termSummaries.length === 0 ? (
              <p className="text-gray-400 text-sm py-4">No attendance records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Term</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Period</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Status</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium">School Days</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium">Present</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium">Absent</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium">Late</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {termSummaries.map(term => (
                      <tr key={term.termId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{term.termName}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {formatDate(term.startDate)} — {formatDate(term.endDate)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            term.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {term.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 font-medium">{term.totalSchoolDays}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDrillDown(term.termId, term.termName, 'PRESENT')}
                            className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors cursor-pointer"
                            title="View present days"
                          >
                            {term.present}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDrillDown(term.termId, term.termName, 'ABSENT')}
                            className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                            title="View absent days"
                          >
                            {term.absent}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDrillDown(term.termId, term.termName, 'LATE')}
                            className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-semibold bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors cursor-pointer"
                            title="View late days"
                          >
                            {term.late}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            term.attendancePercent >= 80
                              ? 'bg-green-100 text-green-700'
                              : term.attendancePercent >= 60
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {term.attendancePercent}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'attendance' && drillDown && (
          <div>
            {/* Drill-down header */}
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={closeDrillDown}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {drillDown.termName}
                </h3>
                <p className="text-xs text-gray-500">
                  Showing all{' '}
                  <span className={`font-semibold ${
                    drillDown.status === 'PRESENT' ? 'text-green-600' :
                    drillDown.status === 'ABSENT' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {drillDown.status.toLowerCase()}
                  </span>{' '}
                  days — {detailMeta.total} record{detailMeta.total !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {detailLoading ? (
              <div className="animate-pulse space-y-3 py-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-10 bg-gray-100 rounded" />
                ))}
              </div>
            ) : detailRecords.length === 0 ? (
              <p className="text-gray-400 text-sm py-4">No records found.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium w-8">#</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Date</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Day</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Status</th>
                        <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detailRecords.map((rec, idx) => {
                        const d = new Date(rec.date);
                        const dayName = d.toLocaleDateString('en-GH', { weekday: 'long' });
                        const rowNum = (detailMeta.page - 1) * detailMeta.limit + idx + 1;
                        return (
                          <tr key={rec.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-400 text-xs">{rowNum}</td>
                            <td className="px-4 py-3 text-gray-700">{formatDate(rec.date)}</td>
                            <td className="px-4 py-3 text-gray-500">{dayName}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                rec.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                                rec.status === 'LATE' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {rec.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500">{rec.notes || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {detailMeta.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 px-2">
                    <p className="text-xs text-gray-500">
                      Showing {(detailMeta.page - 1) * detailMeta.limit + 1}–{Math.min(detailMeta.page * detailMeta.limit, detailMeta.total)} of {detailMeta.total}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDetailPageChange(detailMeta.page - 1)}
                        disabled={detailMeta.page <= 1}
                        className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {Array.from({ length: detailMeta.totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === detailMeta.totalPages || Math.abs(p - detailMeta.page) <= 1)
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
                              onClick={() => handleDetailPageChange(p)}
                              className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${
                                p === detailMeta.page
                                  ? 'bg-[#16a34a] text-white'
                                  : 'hover:bg-gray-100 text-gray-600'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => handleDetailPageChange(detailMeta.page + 1)}
                        disabled={detailMeta.page >= detailMeta.totalPages}
                        className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <RecordPaymentModal
        isOpen={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, invoiceId: '', studentId: '', balance: 0 })}
        invoiceId={paymentModal.invoiceId}
        studentId={paymentModal.studentId}
        balance={paymentModal.balance}
        onSuccess={fetchStudent}
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
