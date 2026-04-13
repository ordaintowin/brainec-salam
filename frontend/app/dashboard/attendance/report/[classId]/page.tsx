'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, exportToCSV } from '@/lib/utils';

interface StudentReport {
  student: {
    id: string;
    studentId: string;
    firstName: string;
    lastName: string;
  };
  present: number;
  absent: number;
  late: number;
  total: number;
  attendancePercent: number;
}

interface ClassReport {
  class: { id: string; name: string };
  term: { id: string; name: string; startDate: string; endDate: string; status: string } | null;
  totalRecords: number;
  students: StudentReport[];
}

export default function ClassReportPage() {
  const params = useParams();
  const router = useRouter();
  const [report, setReport] = useState<ClassReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    try {
      const res = await api.get(`/attendance/report/class/${params.classId}`);
      setReport(res.data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [params.classId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = () => {
    if (!report) return;
    exportToCSV(
      report.students.map((row) => ({
        'Student Name': `${row.student.firstName} ${row.student.lastName}`,
        'Student ID': row.student.studentId,
        'Present': row.present,
        'Absent': row.absent,
        'Late': row.late,
        'Total Days': row.total,
        'Attendance %': `${row.attendancePercent}%`,
      })),
      `attendance-report-${report.class.name.replace(/\s+/g, '-').toLowerCase()}`,
    );
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-gray-400">Report not available.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Attendance
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Attendance Report: {report.class.name}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {report.term
              ? `${report.term.name} · ${formatDate(report.term.startDate)} — ${formatDate(report.term.endDate)}`
              : 'No active term'}
            {' · '}{report.totalRecords} total records · {report.students.length} students
          </p>
        </div>
        {report.students.length > 0 && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {report.students.length > 0 && (() => {
        const totP = report.students.reduce((s, r) => s + r.present, 0);
        const totA = report.students.reduce((s, r) => s + r.absent, 0);
        const totL = report.students.reduce((s, r) => s + r.late, 0);
        const avg = report.students.length > 0
          ? Math.round(report.students.reduce((s, r) => s + r.attendancePercent, 0) / report.students.length)
          : 0;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Total Present</p>
              <p className="text-xl font-bold text-green-700">{totP}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Total Absent</p>
              <p className="text-xl font-bold text-red-600">{totA}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Total Late</p>
              <p className="text-xl font-bold text-yellow-600">{totL}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Avg. Attendance</p>
              <p className={`text-xl font-bold ${avg >= 80 ? 'text-green-700' : avg >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{avg}%</p>
            </div>
          </div>
        );
      })()}

      {/* Student Table */}
      {report.students.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">No attendance records found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">#</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">ID</th>
                <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Present</th>
                <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Absent</th>
                <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Late</th>
                <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Total</th>
                <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Attendance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.students.map((row, idx) => (
                <tr key={row.student.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{row.student.firstName} {row.student.lastName}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.student.studentId}</td>
                  <td className="px-4 py-3 text-center text-green-700 font-medium">{row.present}</td>
                  <td className="px-4 py-3 text-center text-red-600 font-medium">{row.absent}</td>
                  <td className="px-4 py-3 text-center text-yellow-600 font-medium">{row.late}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{row.total}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      row.attendancePercent >= 80
                        ? 'bg-green-100 text-green-700'
                        : row.attendancePercent >= 60
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {row.attendancePercent}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
