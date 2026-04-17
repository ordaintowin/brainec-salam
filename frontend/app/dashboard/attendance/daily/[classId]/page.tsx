'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Users } from 'lucide-react';
import api from '@/lib/api';

interface StudentRecord {
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

interface DailyClassData {
  records: StudentRecord[];
  termId: string | null;
  termName: string | null;
  isTermClosed: boolean;
  isDayOver: boolean;
  isDayClosed: boolean;
}

const TODAY = new Date().toISOString().split('T')[0];

export default function DailyClassAttendancePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const classId = params.classId as string;
  const queryDate = searchParams.get('date');
  const selectedDate = useMemo(() => {
    if (!queryDate || !/^\d{4}-\d{2}-\d{2}$/.test(queryDate)) return TODAY;
    const parsed = new Date(`${queryDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return TODAY;
    return parsed.toISOString().slice(0, 10) === queryDate ? queryDate : TODAY;
  }, [queryDate]);

  const [data, setData] = useState<DailyClassData | null>(null);
  const [className, setClassName] = useState('');
  const [loading, setLoading] = useState(true);

  const { dayName, dateFormatted } = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00Z');
    return {
      dayName: d.toLocaleDateString('en-GH', { weekday: 'long', timeZone: 'UTC' }),
      dateFormatted: d.toLocaleDateString('en-GH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    };
  }, [selectedDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [attRes, clsRes] = await Promise.all([
        api.get('/attendance', { params: { classId, date: selectedDate } }),
        api.get(`/classes/${classId}`),
      ]);
      setData(attRes.data);
      setClassName(clsRes.data?.name || '');
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [classId, selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalStudents = data?.records.length ?? 0;
  const presentCount = data?.records.filter(
    (r) => r.attendance?.status === 'PRESENT' || r.attendance?.status === 'LATE',
  ).length ?? 0;
  const absentCount = data?.records.filter(
    (r) => r.attendance?.status === 'ABSENT',
  ).length ?? 0;
  const lateCount = data?.records.filter(
    (r) => r.attendance?.status === 'LATE',
  ).length ?? 0;
  const markedCount = data?.records.filter((r) => r.attendance !== null).length ?? 0;
  const attendancePct =
    markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : 0;

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

  return (
    <div className="p-6 max-w-4xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-5 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Attendance
      </button>

      {/* Summary header */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-xl px-5 py-4 mb-5">
        {/* Term + day row */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {data?.termName ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
              <CalendarDays className="w-3 h-3" />
              {data.termName}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600">
              No Active Term
            </span>
          )}
          <div>
            <span className="text-base font-bold text-gray-900">{dayName}</span>
            <span className="ml-2 text-sm text-gray-500">{dateFormatted}</span>
          </div>
          {className && (
            <div className="ml-auto px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-700">
              <Users className="w-3 h-3 inline mr-1" />
              {className}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-100 rounded-lg py-2.5 px-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Students</p>
            <p className="text-lg font-bold text-gray-800">{totalStudents}</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-lg py-2.5 px-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Present</p>
            <p className="text-lg font-bold text-green-700">{presentCount}</p>
            {lateCount > 0 && (
              <p className="text-[10px] text-yellow-600">({lateCount} late)</p>
            )}
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg py-2.5 px-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Absent</p>
            <p className="text-lg font-bold text-red-600">{absentCount}</p>
          </div>
          <div className={`border rounded-lg py-2.5 px-3 text-center ${
            attendancePct >= 80
              ? 'bg-green-50 border-green-100'
              : attendancePct >= 60
              ? 'bg-yellow-50 border-yellow-100'
              : 'bg-red-50 border-red-100'
          }`}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Attendance</p>
            <p className={`text-lg font-bold ${
              attendancePct >= 80
                ? 'text-green-700'
                : attendancePct >= 60
                ? 'text-yellow-600'
                : 'text-red-600'
            }`}>
              {markedCount > 0 ? `${attendancePct}%` : '—'}
            </p>
            {markedCount < totalStudents && totalStudents > 0 && (
              <p className="text-[10px] text-gray-400">{totalStudents - markedCount} unmarked</p>
            )}
          </div>
        </div>
      </div>

      {/* Student table */}
      {!data || totalStudents === 0 ? (
        <div className="text-center py-12 text-gray-400">No students found for this class.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase w-10">#</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Student</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">ID</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.records.map((row, idx) => {
                const status = row.attendance?.status ?? null;
                return (
                  <tr key={row.student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {row.student.firstName} {row.student.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.student.studentId}</td>
                    <td className="px-4 py-3">
                      {status === 'PRESENT' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                          Present
                        </span>
                      )}
                      {status === 'LATE' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                          Late
                        </span>
                      )}
                      {status === 'ABSENT' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          Absent
                        </span>
                      )}
                      {status === null && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">
                          Not Marked
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
