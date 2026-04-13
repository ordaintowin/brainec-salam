'use client';
import { useEffect, useState, useCallback } from 'react';
import { Users, GraduationCap, BookOpen, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import StatCard from '@/components/StatCard';
import { formatDateTime, formatCurrency } from '@/lib/utils';

interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
}

interface RecentPayment {
  id: string;
  paidAt: string;
  amount: number;
  method: string;
  paidBy: string;
  student?: { firstName: string; lastName: string };
  invoice?: { id: string; feeOrder?: { title: string } };
}

interface TeacherDashboard {
  className: string;
  studentCount: number;
  todayPresent: number;
  todayAbsent: number;
  todayLate: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [teacherData, setTeacherData] = useState<TeacherDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      if (user?.role === 'TEACHER') {
        const res = await api.get('/dashboard/teacher');
        setTeacherData(res.data);
      } else {
        const [statsRes, paymentsRes] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/finance/payments', { params: { limit: 10 } }),
        ]);
        setStats(statsRes.data);
        const payments = paymentsRes.data?.data || paymentsRes.data || [];
        setRecentPayments(Array.isArray(payments) ? payments : []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-gray-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  // Teacher view
  if (user?.role === 'TEACHER') {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {user.name}</h1>
          <p className="text-gray-500 text-sm mt-1">Teacher Dashboard</p>
        </div>

        {teacherData ? (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                My Class: {teacherData.className}
              </h2>
              <p className="text-gray-500 text-sm">{teacherData.studentCount} students enrolled</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <StatCard title="Present Today" value={teacherData.todayPresent} icon={ClipboardCheck} color="#16a34a" />
              <StatCard title="Absent Today" value={teacherData.todayAbsent} icon={ClipboardCheck} color="#dc2626" />
              <StatCard title="Late Today" value={teacherData.todayLate} icon={ClipboardCheck} color="#d97706" />
            </div>
          </div>
        ) : (
          <div className="text-gray-400">No class assigned yet.</div>
        )}
      </div>
    );
  }

  // Admin / Headmistress view
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of school operations</p>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatCard title="Total Students" value={stats.totalStudents} icon={Users} color="#2563eb" />
            <StatCard title="Total Teachers" value={stats.totalTeachers} icon={GraduationCap} color="#9333ea" />
            <StatCard title="Total Classes" value={stats.totalClasses} icon={BookOpen} color="#0891b2" />
          </div>
        </>
      )}

      {/* Recent Payments */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Recent Payments</h2>
        {recentPayments.length === 0 ? (
          <p className="text-gray-400 text-sm">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-medium">Date</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-medium">Student</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-medium">Fee Order</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-medium">Amount</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-medium">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentPayments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap text-xs">{formatDateTime(p.paidAt)}</td>
                    <td className="py-2.5 px-3 font-medium text-gray-700">
                      {p.student ? `${p.student.firstName} ${p.student.lastName}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">{p.invoice?.feeOrder?.title || '—'}</td>
                    <td className="py-2.5 px-3 font-medium text-green-700">{formatCurrency(p.amount)}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium capitalize">{p.method.replace('_', ' ').toLowerCase()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
