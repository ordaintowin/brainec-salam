'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Users, DollarSign, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';

interface FeeOrderDetail {
  id: string;
  title: string;
  description?: string;
  amount: number;
  dueDate: string;
  class?: { id: string; name: string };
  invoiceCount: number;
}

interface StudentRow {
  id: string;
  studentId: string;
  name: string;
  className: string;
  amountPaid: number;
  amountDue: number;
  balance?: number;
}

interface FeeOrderSummary {
  feeOrder: FeeOrderDetail;
  totalToCollect: number;
  totalCollected: number;
  totalOutstanding: number;
  paidStudents: StudentRow[];
  owingStudents: (StudentRow & { balance: number })[];
}

export default function FeeOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = searchParams.get('filter'); // 'paid' | 'owing' | null
  const [data, setData] = useState<FeeOrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'paid' | 'owing'>(
    (filter === 'paid' || filter === 'owing') ? filter : 'all'
  );

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(`/finance/fee-orders/${params.id}/summary`);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
          </div>
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-gray-400">Fee order not found.</p>
      </div>
    );
  }

  const { feeOrder, totalToCollect, totalCollected, totalOutstanding, paidStudents, owingStudents } = data;

  const tabs = [
    { key: 'all' as const, label: `All Students (${paidStudents.length + owingStudents.length})` },
    { key: 'paid' as const, label: `Paid (${paidStudents.length})` },
    { key: 'owing' as const, label: `Owing (${owingStudents.length})` },
  ];

  const displayStudents = activeTab === 'paid' ? paidStudents
    : activeTab === 'owing' ? owingStudents
    : [...paidStudents.map(s => ({ ...s, balance: 0, status: 'PAID' })), ...owingStudents.map(s => ({ ...s, status: 'OWING' }))];

  return (
    <div className="p-8">
      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Finance
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{feeOrder.title}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {feeOrder.class?.name || 'All Classes'} · Due: {formatDate(feeOrder.dueDate)} · Unit: {formatCurrency(feeOrder.amount)} · {feeOrder.invoiceCount} invoice{feeOrder.invoiceCount !== 1 ? 's' : ''}
        </p>
        {feeOrder.description && (
          <p className="text-gray-500 text-sm mt-1">{feeOrder.description}</p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div
          className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setActiveTab('all')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-100">
              <DollarSign className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">To Collect</p>
              <p className="text-xl font-bold text-gray-800">{formatCurrency(totalToCollect)}</p>
            </div>
          </div>
        </div>
        <div
          className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setActiveTab('paid')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-50">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Collected</p>
              <p className="text-xl font-bold text-green-700">{formatCurrency(totalCollected)}</p>
              <p className="text-xs text-gray-400">{paidStudents.length} student{paidStudents.length !== 1 ? 's' : ''} paid</p>
            </div>
          </div>
        </div>
        <div
          className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setActiveTab('owing')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-50">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Outstanding</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
              <p className="text-xs text-gray-400">{owingStudents.length} student{owingStudents.length !== 1 ? 's' : ''} owing</p>
            </div>
          </div>
        </div>
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

      {/* Student Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
              <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student ID</th>
              <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Class</th>
              <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Amount Due</th>
              <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Amount Paid</th>
              {activeTab !== 'paid' && (
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Balance</th>
              )}
              {activeTab === 'all' && (
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Status</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No students found.
                </td>
              </tr>
            ) : (
              displayStudents.map((s) => (
                <tr key={s.studentId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.studentId}</td>
                  <td className="px-4 py-3 text-gray-600">{s.className}</td>
                  <td className="px-4 py-3">{formatCurrency(s.amountDue)}</td>
                  <td className="px-4 py-3 text-green-700">{formatCurrency(s.amountPaid)}</td>
                  {activeTab !== 'paid' && (
                    <td className="px-4 py-3 text-red-600">{formatCurrency('balance' in s ? s.balance : 0)}</td>
                  )}
                  {activeTab === 'all' && (
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={'status' in s ? (s as { status: string }).status : 'PENDING'} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
