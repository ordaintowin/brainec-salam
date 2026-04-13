'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Loader2, Download, Printer } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import LiveSearch from '@/components/LiveSearch';
import RecordPaymentModal from '@/components/RecordPaymentModal';
import PrintInvoiceModal from '@/components/PrintInvoiceModal';
import { formatCurrency, formatDate, exportToCSV } from '@/lib/utils';

type ActiveTab = 'feeOrders' | 'invoices' | 'payments' | 'summary';

interface FeeOrder {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  class?: { name: string };
  _count?: { invoices: number };
}

interface Invoice {
  id: string;
  student?: { id: string; firstName: string; lastName: string; studentId: string };
  feeOrder?: { title: string };
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: string;
  dueDate: string;
}

interface Payment {
  id: string;
  paidAt: string;
  amount: number;
  method: string;
  reference?: string;
  paidBy: string;
  student?: { firstName: string; lastName: string };
  invoice?: { id: string; feeOrder?: { title: string } };
}

interface FeeOrderBreakdown {
  feeOrderId: string;
  title: string;
  amount: number;
  dueDate: string;
  totalToCollect: number;
  totalCollected: number;
  totalOutstanding: number;
  invoiceCount: number;
  paidStudents: { studentId: string; name: string; className: string; amountPaid: number }[];
  owingStudents: { studentId: string; name: string; className: string; balance: number }[];
}

interface FinanceSummary {
  totalCollected: number;
  totalOutstanding: number;
  totalOverdue: number;
  perClassBreakdown: { classId: string; className: string; collected: number; outstanding: number }[];
  feeOrderBreakdown?: FeeOrderBreakdown[];
}

const feeOrderSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: z.string().min(1, 'Amount is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  classId: z.string().optional(),
  applyToAll: z.boolean().optional(),
});

type FeeOrderForm = z.infer<typeof feeOrderSchema>;
interface ClassOption { id: string; name: string }

export default function FinancePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('feeOrders');
  const [feeOrders, setFeeOrders] = useState<FeeOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [search, setSearch] = useState('');
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showFeeOrderModal, setShowFeeOrderModal] = useState(false);
  const [feeOrderError, setFeeOrderError] = useState('');
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; invoiceId: string; studentId: string; balance: number }>({
    open: false, invoiceId: '', studentId: '', balance: 0,
  });
  const [printModal, setPrintModal] = useState<{ open: boolean; invoice: Invoice | null }>({ open: false, invoice: null });

  const {
    register,
    handleSubmit,
    reset: resetFeeForm,
    formState: { errors: feeErrors, isSubmitting: feeSubmitting },
  } = useForm<FeeOrderForm>({ resolver: zodResolver(feeOrderSchema) });

  const canManage = user?.role === 'HEADMISTRESS' || user?.role === 'ADMIN';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const foRes = await api.get('/finance/fee-orders');
      setFeeOrders(foRes.data?.data || foRes.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
    try {
      const cRes = await api.get('/classes');
      setClasses(cRes.data?.classes || cRes.data || []);
    } catch {
      // silent
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await api.get('/finance/invoices', { params: { q: search, page: invoicePage, limit: 20 } });
      setInvoices(res.data?.data || res.data || []);
      setInvoiceTotalPages(res.data?.meta?.totalPages || 1);
    } catch {
      setInvoices([]);
    }
  }, [search, invoicePage]);

  const fetchPayments = useCallback(async () => {
    try {
      const res = await api.get('/finance/payments', { params: { limit: 50 } });
      setPayments(res.data?.data || res.data || []);
    } catch {
      setPayments([]);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/finance/summary');
      setSummary(res.data);
    } catch {
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (activeTab === 'invoices') fetchInvoices();
  }, [activeTab, fetchInvoices]);

  useEffect(() => {
    if (activeTab === 'payments') fetchPayments();
  }, [activeTab, fetchPayments]);

  useEffect(() => {
    if (activeTab === 'summary') fetchSummary();
  }, [activeTab, fetchSummary]);

  useEffect(() => {
    setInvoicePage(1);
  }, [search]);

  const onCreateFeeOrder = async (data: FeeOrderForm) => {
    setFeeOrderError('');
    try {
      await api.post('/finance/fee-orders', {
        title: data.name,
        amount: parseFloat(data.amount),
        dueDate: data.dueDate,
        classId: data.classId || undefined,
      });
      setShowFeeOrderModal(false);
      resetFeeForm();
      fetchAll();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create fee order';
      setFeeOrderError(message);
    }
  };

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'feeOrders', label: 'Fee Orders' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'payments', label: 'Payments' },
    { key: 'summary', label: 'Summary' },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
          <p className="text-gray-500 text-sm mt-1">Manage fees, invoices and payments</p>
        </div>
        {canManage && activeTab === 'feeOrders' && (
          <button
            onClick={() => { resetFeeForm(); setFeeOrderError(''); setShowFeeOrderModal(true); }}
            className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create Fee Order
          </button>
        )}
        {activeTab === 'invoices' && invoices.length > 0 && (
          <button
            onClick={() => exportToCSV(
              invoices.map(inv => ({
                'Student': `${inv.student?.firstName} ${inv.student?.lastName}`,
                'Student ID': inv.student?.studentId || '',
                'Fee Order': inv.feeOrder?.title || '',
                'Amount Due': Number(inv.amountDue).toFixed(2),
                'Amount Paid': Number(inv.amountPaid).toFixed(2),
                'Balance': Number(inv.balance).toFixed(2),
                'Status': inv.status,
                'Due Date': inv.dueDate ? formatDate(inv.dueDate) : '',
              })),
              'invoices',
            )}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        )}
        {activeTab === 'payments' && payments.length > 0 && (
          <button
            onClick={() => exportToCSV(
              payments.map(p => ({
                'Date': p.paidAt ? formatDate(p.paidAt) : '',
                'Student': `${p.student?.firstName} ${p.student?.lastName}`,
                'Fee Order': p.invoice?.feeOrder?.title || '',
                'Amount': Number(p.amount).toFixed(2),
                'Method': p.method,
                'Reference': p.reference || '',
                'Paid By': p.paidBy,
              })),
              'payments',
            )}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[#16a34a] text-[#16a34a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fee Orders Tab */}
      {activeTab === 'feeOrders' && (
        loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Amount</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Class</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Due Date</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Invoices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {feeOrders.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No fee orders yet.</td></tr>
                ) : (
                  feeOrders.map(fo => (
                    <tr key={fo.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{fo.title}</td>
                      <td className="px-4 py-3 text-[#16a34a] font-medium">{formatCurrency(fo.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">{fo.class?.name || 'All Classes'}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(fo.dueDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{fo._count?.invoices ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div>
          <div className="mb-4 max-w-sm">
            <LiveSearch value={search} onChange={setSearch} placeholder="Search by student name or invoice #…" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Invoice #</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Fee</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Total</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Paid</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Balance</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Due Date</th>
                  {canManage && <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.length === 0 ? (
                  <tr><td colSpan={canManage ? 9 : 8} className="px-4 py-8 text-center text-gray-400">No invoices found.</td></tr>
                ) : (
                  invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">INV-{inv.id.slice(-6).toUpperCase()}</td>
                      <td className="px-4 py-3">
                        {inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : '—'}
                        {inv.student?.studentId && <span className="block text-xs text-gray-400">{inv.student.studentId}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inv.feeOrder?.title || '—'}</td>
                      <td className="px-4 py-3">{formatCurrency(inv.amountDue)}</td>
                      <td className="px-4 py-3 text-green-700">{formatCurrency(inv.amountPaid)}</td>
                      <td className="px-4 py-3 text-red-600">{formatCurrency(inv.balance)}</td>
                      <td className="px-4 py-3"><PaymentStatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(inv.dueDate)}</td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {inv.balance > 0 && (
                              <button
                                onClick={() => setPaymentModal({ open: true, invoiceId: inv.id, studentId: inv.student?.id ?? '', balance: inv.balance })}
                                className="text-xs bg-[#16a34a] hover:bg-green-700 text-white px-3 py-1 rounded-md"
                              >
                                Record Payment
                              </button>
                            )}
                            {inv.status !== 'PENDING' && Number(inv.amountPaid) > 0 && (
                              <button
                                onClick={() => setPrintModal({ open: true, invoice: inv })}
                                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                                title="Print invoice"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {invoiceTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">Page {invoicePage} of {invoiceTotalPages}</p>
              <div className="flex gap-1">
                <button onClick={() => setInvoicePage(p => p - 1)} disabled={invoicePage <= 1} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40">Previous</button>
                <button onClick={() => setInvoicePage(p => p + 1)} disabled={invoicePage >= invoiceTotalPages} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Invoice #</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Amount</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Method</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Paid By</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Reference</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No payments recorded.</td></tr>
              ) : (
                payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{formatDate(p.paidAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.invoice?.id ? `INV-${p.invoice.id.slice(-6).toUpperCase()}` : '—'}</td>
                    <td className="px-4 py-3">
                      {p.student ? `${p.student.firstName} ${p.student.lastName}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-green-700">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{p.method.replace('_', ' ').toLowerCase()}</td>
                    <td className="px-4 py-3 text-gray-600">{p.paidBy}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.reference || '—'}</td>
                    <td className="px-4 py-3">
                      {p.invoice && (
                        <button
                          onClick={() => {
                            const inv = invoices.find(i => i.id === p.invoice?.id);
                            if (inv) setPrintModal({ open: true, invoice: inv });
                          }}
                          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                          title="Print receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {summary ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Total Collected</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(summary.totalCollected)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Outstanding</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(summary.totalOutstanding)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Overdue</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(summary.totalOverdue)}</p>
                </div>
              </div>

              {/* Per-Class Breakdown */}
              {summary.perClassBreakdown && summary.perClassBreakdown.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Per-Class Breakdown</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Class</th>
                          <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Collected</th>
                          <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {summary.perClassBreakdown.map((row) => (
                          <tr key={row.classId} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-800">{row.className}</td>
                            <td className="px-4 py-3 text-green-700">{formatCurrency(row.collected)}</td>
                            <td className="px-4 py-3 text-red-600">{formatCurrency(row.outstanding)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Fee Order Breakdown */}
              {summary.feeOrderBreakdown && summary.feeOrderBreakdown.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800">Fee Order Details</h3>
                  {summary.feeOrderBreakdown.map((fo) => (
                    <div key={fo.feeOrderId} className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="font-semibold text-gray-900">{fo.title}</h4>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fo.invoiceCount} invoice{fo.invoiceCount !== 1 ? 's' : ''} · Due: {formatDate(fo.dueDate)}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-gray-500">Unit: {formatCurrency(fo.amount)}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400 uppercase">To Collect</p>
                          <p className="text-lg font-bold text-gray-800">{formatCurrency(fo.totalToCollect)}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400 uppercase">Collected</p>
                          <p className="text-lg font-bold text-green-700">{formatCurrency(fo.totalCollected)}</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400 uppercase">Outstanding</p>
                          <p className="text-lg font-bold text-red-600">{formatCurrency(fo.totalOutstanding)}</p>
                        </div>
                      </div>

                      {/* Paid Students */}
                      {fo.paidStudents.length > 0 && (
                        <div className="mb-4">
                          <h5 className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">Paid ({fo.paidStudents.length})</h5>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-green-50 border-b">
                                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Student</th>
                                  <th className="text-left px-3 py-2 text-gray-500 font-medium">ID</th>
                                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Class</th>
                                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Amount Paid</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {fo.paidStudents.map((s) => (
                                  <tr key={s.studentId}>
                                    <td className="px-3 py-2 font-medium text-gray-700">{s.name}</td>
                                    <td className="px-3 py-2 text-gray-500">{s.studentId}</td>
                                    <td className="px-3 py-2 text-gray-500">{s.className}</td>
                                    <td className="px-3 py-2 text-green-700 font-medium">{formatCurrency(s.amountPaid)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Owing Students */}
                      {fo.owingStudents.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">Owing ({fo.owingStudents.length})</h5>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-red-50 border-b">
                                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Student</th>
                                  <th className="text-left px-3 py-2 text-gray-500 font-medium">ID</th>
                                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Class</th>
                                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Balance Owed</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {fo.owingStudents.map((s) => (
                                  <tr key={s.studentId}>
                                    <td className="px-3 py-2 font-medium text-gray-700">{s.name}</td>
                                    <td className="px-3 py-2 text-gray-500">{s.studentId}</td>
                                    <td className="px-3 py-2 text-gray-500">{s.className}</td>
                                    <td className="px-3 py-2 text-red-600 font-medium">{formatCurrency(s.balance)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-400">Loading summary…</p>
          )}
        </div>
      )}

      {/* Create Fee Order Modal */}
      {showFeeOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowFeeOrderModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Create Fee Order</h2>
              <button onClick={() => setShowFeeOrderModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {feeOrderError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{feeOrderError}</div>}
            <form onSubmit={handleSubmit(onCreateFeeOrder)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fee Name *</label>
                <input {...register('name')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" placeholder="e.g. Term 1 School Fees" />
                {feeErrors.name && <p className="text-red-500 text-xs mt-1">{feeErrors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₵) *</label>
                  <input type="number" step="0.01" {...register('amount')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                  {feeErrors.amount && <p className="text-red-500 text-xs mt-1">{feeErrors.amount.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                  <input type="date" {...register('dueDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                  {feeErrors.dueDate && <p className="text-red-500 text-xs mt-1">{feeErrors.dueDate.message}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apply to Class</label>
                <select {...register('classId')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                  <option value="">Select a class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="applyToAll" {...register('applyToAll')} className="w-4 h-4 accent-[#16a34a]" />
                <label htmlFor="applyToAll" className="text-sm text-gray-700">Apply to all students</label>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowFeeOrderModal(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={feeSubmitting} className="px-4 py-2 text-sm text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2">
                  {feeSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <RecordPaymentModal
        isOpen={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, invoiceId: '', studentId: '', balance: 0 })}
        invoiceId={paymentModal.invoiceId}
        studentId={paymentModal.studentId}
        balance={paymentModal.balance}
        onSuccess={fetchInvoices}
      />

      {printModal.invoice && (
        <PrintInvoiceModal
          isOpen={printModal.open}
          onClose={() => setPrintModal({ open: false, invoice: null })}
          invoice={printModal.invoice}
        />
      )}
    </div>
  );
}
