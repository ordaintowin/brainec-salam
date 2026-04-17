'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, AlertCircle, Archive } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

interface FeeOrderDetail {
  id: string;
  title: string;
  description?: string;
  amount: number;
  dueDate: string;
  type: 'CLASS' | 'INDIVIDUAL' | 'ALL';
  class?: { id: string; name: string } | null;
  invoiceCount: number;
  isArchived?: boolean;
  archivedAt?: string;
}

interface StudentEntry {
  id: string;
  studentId: string;
  name: string;
  className: string;
  amountPaid: number;
  amountDue: number;
  balance?: number;
}

interface FeeOrderSummaryData {
  feeOrder: FeeOrderDetail;
  totalToCollect: number;
  totalCollected: number;
  totalOutstanding: number;
  paidStudents: StudentEntry[];
  owingStudents: (StudentEntry & { balance: number })[];
}

const TYPE_LABELS: Record<string, { label: string; className: string }> = {
  INDIVIDUAL: { label: 'Individual', className: 'bg-orange-50 text-orange-700 border border-orange-200' },
  CLASS: { label: 'Class', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  ALL: { label: 'All Students', className: 'bg-purple-50 text-purple-700 border border-purple-200' },
};

export default function FeeOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const filterParam = searchParams.get('filter');

  const [data, setData] = useState<FeeOrderSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'owing' | 'paid'>('owing');

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(`/finance/fee-orders/${id}/summary`);
      setData(res.data);
    } catch {
      setError('Failed to load fee order details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (filterParam === 'paid') setActiveSection('paid');
    else setActiveSection('owing');
  }, [filterParam]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-red-500">{error || 'Fee order not found.'}</p>
      </div>
    );
  }

  const { feeOrder, totalToCollect, totalCollected, totalOutstanding, paidStudents, owingStudents } = data;
  const typeConfig = TYPE_LABELS[feeOrder.type] || TYPE_LABELS.ALL;
  const collectionPercent = totalToCollect > 0 ? Math.round((totalCollected / totalToCollect) * 100) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-5 text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Archived badge */}
      {feeOrder.isArchived && (
        <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-700">
          <Archive className="w-4 h-4" />
          <span>This order is fully paid and archived{feeOrder.archivedAt ? ` · ${formatDate(feeOrder.archivedAt)}` : ''}. It is excluded from dashboard totals.</span>
        </div>
      )}

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{feeOrder.title}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${typeConfig.className}`}>
                {typeConfig.label}
              </span>
              {feeOrder.isArchived && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  Archived
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
              <span>Unit amount: <span className="font-semibold text-gray-800">{formatCurrency(feeOrder.amount)}</span></span>
              <span>Due date: <span className="font-semibold text-gray-800">{formatDate(feeOrder.dueDate)}</span></span>
              {feeOrder.class && <span>Class: <span className="font-semibold text-gray-800">{feeOrder.class.name}</span></span>}
              <span><span className="font-semibold text-gray-800">{feeOrder.invoiceCount}</span> invoice{feeOrder.invoiceCount !== 1 ? 's' : ''}</span>
            </div>
            {feeOrder.description && (
              <p className="text-gray-400 text-sm mt-2 italic">{feeOrder.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total to Collect</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalToCollect)}</p>
          <p className="text-xs text-gray-400 mt-1">{feeOrder.invoiceCount} student{feeOrder.invoiceCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 shadow-sm p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Collected</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalCollected)}</p>
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{collectionPercent}% collected</span>
              <span className="text-xs text-green-600 font-medium">{paidStudents.length} paid</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(collectionPercent, 100)}%` }}
              />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
          <p className="text-xs text-gray-400 mt-1">{owingStudents.length} student{owingStudents.length !== 1 ? 's' : ''} still owing</p>
        </div>
      </div>

      {/* Section tabs */}
      {(owingStudents.length > 0 || paidStudents.length > 0) && (
        <>
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            {owingStudents.length > 0 && (
              <button
                onClick={() => setActiveSection('owing')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeSection === 'owing' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <AlertCircle className="w-4 h-4" />
                Owing Students
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                  {owingStudents.length}
                </span>
              </button>
            )}
            {paidStudents.length > 0 && (
              <button
                onClick={() => setActiveSection('paid')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeSection === 'paid' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Paid Students
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                  {paidStudents.length}
                </span>
              </button>
            )}
          </div>

          {/* Owing Students */}
          {activeSection === 'owing' && owingStudents.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-red-50 border-b border-red-100">
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold uppercase">#</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold uppercase">Student</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold uppercase">ID</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold uppercase">Class</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold uppercase">Amount Due</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold uppercase">Paid</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {owingStudents.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-red-50/30 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.studentId}</td>
                        <td className="px-4 py-3 text-gray-500">{s.className}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(s.amountDue)}</td>
                        <td className="px-4 py-3 text-right text-green-700">{formatCurrency(s.amountPaid)}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(s.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                      <td colSpan={4} className="px-4 py-3 text-xs text-gray-500 uppercase">Total</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(owingStudents.reduce((s, r) => s + r.amountDue, 0))}</td>
                      <td className="px-4 py-3 text-right text-green-700">{formatCurrency(owingStudents.reduce((s, r) => s + r.amountPaid, 0))}</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatCurrency(totalOutstanding)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Paid Students */}
          {activeSection === 'paid' && paidStudents.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-green-50 border-b border-green-100">
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold uppercase">#</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold uppercase">Student</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold uppercase">ID</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold uppercase">Class</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold uppercase">Amount Due</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-semibold uppercase">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paidStudents.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-green-50/30 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            {s.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.studentId}</td>
                        <td className="px-4 py-3 text-gray-500">{s.className}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(s.amountDue)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(s.amountPaid)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                      <td colSpan={4} className="px-4 py-3 text-xs text-gray-500 uppercase">Total</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(paidStudents.reduce((s, r) => s + r.amountDue, 0))}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatCurrency(totalCollected)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {owingStudents.length === 0 && paidStudents.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-400">No invoices found for this fee order.</p>
        </div>
      )}
    </div>
  );
}
