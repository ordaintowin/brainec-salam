'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface StudentDetail {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  className: string;
  date?: string;
  notes?: string;
  count?: number;
  dates?: string[];
}

const scopeLabels: Record<string, string> = {
  day: 'Today',
  week: 'This Week',
  term: 'This Term',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  PRESENT: { label: 'Present', color: 'text-green-700' },
  ABSENT: { label: 'Absent', color: 'text-red-600' },
  LATE: { label: 'Late', color: 'text-yellow-700' },
};

export default function AttendanceDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = searchParams.get('scope') as 'day' | 'week' | 'term' || 'day';
  const status = searchParams.get('status') as 'PRESENT' | 'ABSENT' | 'LATE' || 'PRESENT';
  const classId = searchParams.get('classId') || undefined;

  const [students, setStudents] = useState<StudentDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetails = useCallback(async () => {
    try {
      const params: Record<string, string> = { scope, status };
      if (classId) params.classId = classId;
      const res = await api.get('/attendance/dashboard/details', { params });
      setStudents(res.data?.students || []);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [scope, status, classId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const statusInfo = statusLabels[status] || statusLabels.PRESENT;
  const scopeLabel = scopeLabels[scope] || scope;

  return (
    <div className="p-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Attendance
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          <span className={statusInfo.color}>{statusInfo.label}</span> Students — {scopeLabel}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {students.length} student{students.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No students found for this filter.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">#</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student ID</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Class</th>
                {scope === 'day' ? (
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Notes</th>
                ) : (
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Occurrences</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map((s, idx) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.firstName} {s.lastName}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.studentId}</td>
                  <td className="px-4 py-3 text-gray-600">{s.className}</td>
                  {scope === 'day' ? (
                    <td className="px-4 py-3 text-gray-500">{s.notes || '—'}</td>
                  ) : (
                    <td className="px-4 py-3">
                      <span className="font-medium">{s.count || 0} day{(s.count || 0) !== 1 ? 's' : ''}</span>
                      {s.dates && s.dates.length > 0 && (
                        <span className="text-xs text-gray-400 ml-2">
                          ({s.dates.slice(0, 3).map(d => formatDate(d)).join(', ')}
                          {s.dates.length > 3 ? ` +${s.dates.length - 3} more` : ''})
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
