'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

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
  feeOrderBreakdown?: FeeOrderBreakdown[];
}

const filterConfig: Record<string, { label: string; description: string; color: string; bgColor: string }> = {
  outstanding: {
    label: 'Outstanding Orders',
    description: 'Fee orders with unpaid balances',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  collected: {
    label: 'Collected Orders',
    description: 'Fee orders with payments received',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
  },
  overdue: {
    label: 'Overdue Orders',
    description: 'Fee orders past their due date with outstanding balances',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
};

export default function SummaryFilterPage() {
  const params = useParams();
  const router = useRouter();
  const filter = params.filter as string;
  const config = filterConfig[filter];
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/finance/summary');
      setSummary(res.data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (!config) {
    return (
      <div className="p-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-gray-400">Invalid filter.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  const feeOrders = summary?.feeOrderBreakdown || [];

  // Filter fee orders based on the selected filter
  const filteredOrders = feeOrders.filter(fo => {
    if (filter === 'outstanding') return fo.totalOutstanding > 0;
    if (filter === 'collected') return fo.totalCollected > 0;
    if (filter === 'overdue') {
      const isPastDue = new Date(fo.dueDate) < new Date();
      return fo.totalOutstanding > 0 && isPastDue;
    }
    return true;
  });

  // Determine which detail filter to pass when drilling down
  const drillDownFilter = filter === 'outstanding' || filter === 'overdue' ? 'owing' : 'paid';

  return (
    <div className="p-8">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Finance Summary
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{config.label}</h1>
        <p className="text-gray-500 text-sm mt-1">{config.description}</p>
      </div>

      {/* Fee Order Cards */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400">No fee orders match this filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map(fo => (
            <Link
              key={fo.feeOrderId}
              href={`/dashboard/finance/orders/${fo.feeOrderId}?filter=${drillDownFilter}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{fo.title}</h3>
                    <span className="text-xs text-gray-400">
                      {fo.invoiceCount} invoice{fo.invoiceCount !== 1 ? 's' : ''} · Due: {formatDate(fo.dueDate)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 uppercase">To Collect</p>
                      <p className="text-sm font-bold text-gray-800">{formatCurrency(fo.totalToCollect)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase">Collected</p>
                      <p className="text-sm font-bold text-green-700">{formatCurrency(fo.totalCollected)}</p>
                      {fo.paidStudents.length > 0 && (
                        <p className="text-xs text-gray-400">{fo.paidStudents.length} student{fo.paidStudents.length !== 1 ? 's' : ''}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase">Outstanding</p>
                      <p className={`text-sm font-bold ${config.color}`}>{formatCurrency(fo.totalOutstanding)}</p>
                      {fo.owingStudents.length > 0 && (
                        <p className="text-xs text-gray-400">{fo.owingStudents.length} student{fo.owingStudents.length !== 1 ? 's' : ''}</p>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0 ml-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
