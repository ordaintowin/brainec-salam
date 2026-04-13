'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Loader2, Lock, FileText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

interface Term {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'CLOSED';
  closedAt?: string;
  createdAt: string;
}

interface TermReport {
  term: Term;
  totalRecords: number;
  students: {
    student: {
      id: string;
      studentId: string;
      firstName: string;
      lastName: string;
      className: string;
    };
    present: number;
    absent: number;
    late: number;
    total: number;
    attendancePercent: number;
  }[];
}

const termSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
});

type TermForm = z.infer<typeof termSchema>;

export default function TermsPage() {
  const { user } = useAuth();
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [createError, setCreateError] = useState('');
  const [closing, setClosing] = useState<string | null>(null);
  const [report, setReport] = useState<TermReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TermForm>({ resolver: zodResolver(termSchema) });

  const fetchTerms = useCallback(async () => {
    try {
      const res = await api.get('/terms');
      setTerms(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTerms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  const onCreate = async (data: TermForm) => {
    setCreateError('');
    try {
      await api.post('/terms', data);
      setShowModal(false);
      reset();
      fetchTerms();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create term';
      setCreateError(msg);
    }
  };

  const closeTerm = async (id: string) => {
    if (!confirm('Are you sure you want to close this term? Once closed, attendance records cannot be edited.')) return;
    setClosing(id);
    try {
      await api.post(`/terms/${id}/close`);
      fetchTerms();
      if (report?.term.id === id) setReport(null);
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to close term');
    } finally {
      setClosing(null);
    }
  };

  const viewReport = async (termId: string) => {
    setReportLoading(true);
    try {
      const res = await api.get(`/terms/${termId}/report`);
      setReport(res.data);
    } catch {
      alert('Failed to load report');
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Terms</h1>
          <p className="text-gray-500 text-sm mt-1">Manage school terms and generate attendance reports</p>
        </div>
        <button
          onClick={() => { reset(); setCreateError(''); setShowModal(true); }}
          className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Create Term
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : terms.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No terms created yet.</p>
          <p className="text-sm mt-1">Create your first term to start organizing attendance.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {terms.map((term) => (
            <div key={term.id} className={`bg-white rounded-xl border p-5 flex items-center justify-between ${term.status === 'ACTIVE' ? 'border-green-200' : 'border-gray-200'}`}>
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">{term.name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    term.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {term.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {formatDate(term.startDate)} — {formatDate(term.endDate)}
                  {term.closedAt && <span className="ml-2 text-xs text-gray-400">· Closed {formatDate(term.closedAt)}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => viewReport(term.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                  disabled={reportLoading}
                >
                  <FileText className="w-4 h-4" />
                  Report
                </button>
                {term.status === 'ACTIVE' && (
                  <button
                    onClick={() => closeTerm(term.id)}
                    disabled={closing === term.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg disabled:opacity-60"
                  >
                    {closing === term.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    Close Term
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Term Report */}
      {report && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Attendance Report: {report.term.name}
            </h2>
            <button
              onClick={() => setReport(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Close Report
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Total Records</p>
              <p className="text-xl font-bold text-gray-800">{report.totalRecords}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Students</p>
              <p className="text-xl font-bold text-gray-800">{report.students.length}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Period</p>
              <p className="text-sm font-bold text-gray-800">{formatDate(report.term.startDate)} — {formatDate(report.term.endDate)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Status</p>
              <p className={`text-xl font-bold ${report.term.status === 'ACTIVE' ? 'text-green-600' : 'text-gray-500'}`}>{report.term.status}</p>
            </div>
          </div>

          {report.students.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">ID</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Class</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Present</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Absent</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Late</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Total</th>
                    <th className="text-center px-4 py-3 text-xs text-gray-400 font-medium uppercase">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.students.map((row) => (
                    <tr key={row.student.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{row.student.firstName} {row.student.lastName}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.student.studentId}</td>
                      <td className="px-4 py-3 text-gray-600">{row.student.className}</td>
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
          ) : (
            <p className="text-gray-400 text-sm">No attendance records found for this term.</p>
          )}
        </div>
      )}

      {/* Create Term Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Create New Term</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{createError}</div>
            )}

            <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term Name *</label>
                <input
                  {...register('name')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                  placeholder="e.g. Term 1 2026"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input type="date" {...register('startDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                  {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                  <input type="date" {...register('endDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                  {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Term
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
