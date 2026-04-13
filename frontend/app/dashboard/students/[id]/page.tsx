'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Printer } from 'lucide-react';
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

interface AttendanceRecord {
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
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'fees' | 'attendance'>('fees');
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; invoiceId: string; studentId: string; balance: number }>({
    open: false, invoiceId: '', studentId: '', balance: 0,
  });
  const [printModal, setPrintModal] = useState<{ open: boolean; invoice: Invoice | null }>({ open: false, invoice: null });

  const canManage = user?.role === 'HEADMISTRESS' || user?.role === 'ADMIN';

  const fetchStudent = useCallback(async () => {
    try {
      const sRes = await api.get(`/students/${id}`);
      setStudent(sRes.data);
      setInvoices(Array.isArray(sRes.data?.feeInvoices) ? sRes.data.feeInvoices : []);
      setAttendance(Array.isArray(sRes.data?.attendances) ? sRes.data.attendances : []);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStudent();
  }, [fetchStudent]);

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
              onClick={() => setActiveTab(tab)}
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

        {activeTab === 'attendance' && (
          <div className="overflow-x-auto">
            {attendance.length === 0 ? (
              <p className="text-gray-400 text-sm py-4">No attendance records found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Date</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {attendance.map(rec => (
                    <tr key={rec.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{formatDate(rec.date)}</td>
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
                  ))}
                </tbody>
              </table>
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
