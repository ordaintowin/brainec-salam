'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Eye, EyeOff, Pencil, Trash2, Download, KeyRound, X, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import DataTable from '@/components/DataTable';
import LiveSearch from '@/components/LiveSearch';
import InitialsAvatar from '@/components/InitialsAvatar';
import ConfirmModal from '@/components/ConfirmModal';
import { formatDate, exportToCSV } from '@/lib/utils';

interface Teacher {
  id: string;
  employeeId?: string;
  photoUrl?: string;
  user: { name: string; email: string; photoUrl?: string };
  class?: { name: string };
  qualification?: string;
  phone?: string;
  joinDate?: string;
}

const resetSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
type ResetFormData = z.infer<typeof resetSchema>;

export default function TeachersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState(searchParams.get('created') === '1' ? 'Teacher created successfully!' : '');
  const [archiveModal, setArchiveModal] = useState<{ open: boolean; teacher: Teacher | null }>({ open: false, teacher: null });
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [resetModal, setResetModal] = useState<{ open: boolean; teacher: Teacher | null }>({ open: false, teacher: null });
  const [resetError, setResetError] = useState('');
  const [showResetPwd, setShowResetPwd] = useState(false);

  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    reset: resetResetForm,
    formState: { errors: resetErrors, isSubmitting: resetSubmitting },
  } = useForm<ResetFormData>({ resolver: zodResolver(resetSchema) });

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/teachers', { params: { q: search, page, limit: 20 } });
      const data = res.data;
      if (Array.isArray(data)) {
        setTeachers(data);
        setTotalPages(1);
      } else {
        setTeachers(Array.isArray(data.data) ? data.data : []);
        setTotalPages(data.meta?.totalPages || 1);
      }
    } catch {
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const canManage = user?.role === 'HEADMISTRESS' || user?.role === 'ADMIN';

  const handleExport = async () => {
    try {
      const res = await api.get('/teachers', { params: { q: search, page: 1, limit: 10000 } });
      const rows = (res.data?.data || res.data || []) as Teacher[];
      exportToCSV(
        rows.map(t => ({
          'Employee ID': t.employeeId || '',
          'Name': t.user.name,
          'Email': t.user.email,
          'Class': t.class?.name || '',
          'Qualification': t.qualification || '',
          'Phone': t.phone || '',
          'Join Date': t.joinDate ? formatDate(t.joinDate) : '',
        })),
        'teachers',
      );
    } catch {
      // silent
    }
  };

  const handleArchive = async () => {
    if (!archiveModal.teacher) return;
    setArchiveLoading(true);
    try {
      await api.delete(`/teachers/${archiveModal.teacher.id}`, { data: { archiveReason } });
      setArchiveModal({ open: false, teacher: null });
      setArchiveReason('');
      setSuccessMessage('Teacher archived successfully.');
      fetchTeachers();
    } catch {
      // silent
    } finally {
      setArchiveLoading(false);
    }
  };

  const onResetSubmit = async (data: ResetFormData) => {
    if (!resetModal.teacher) return;
    setResetError('');
    try {
      await api.patch(`/teachers/${resetModal.teacher.id}`, { password: data.password });
      const teacherName = resetModal.teacher.user.name;
      setResetModal({ open: false, teacher: null });
      resetResetForm();
      setSuccessMessage(`Password updated for ${teacherName}.`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update password';
      setResetError(message);
    }
  };

  const columns = [
    {
      header: 'Teacher',
      cell: (row: Teacher) => (
        <div className="flex items-center gap-3">
          {(row.photoUrl || row.user.photoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photoUrl || row.user.photoUrl} alt={row.user.name} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <InitialsAvatar name={row.user.name} size="sm" />
          )}
          <span className="font-medium text-gray-800">{row.user.name}</span>
        </div>
      ),
    },
    {
      header: 'Employee ID',
      cell: (row: Teacher) => (
        <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{row.employeeId || '—'}</span>
      ),
    },
    { header: 'Email', cell: (row: Teacher) => row.user.email },
    { header: 'Class', cell: (row: Teacher) => row.class?.name || '—' },
    { header: 'Qualification', cell: (row: Teacher) => row.qualification || '—' },
    { header: 'Phone', cell: (row: Teacher) => row.phone || '—' },
    { header: 'Join Date', cell: (row: Teacher) => row.joinDate ? formatDate(row.joinDate) : '—' },
    {
      header: 'Actions',
      cell: (row: Teacher) => (
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => { setResetModal({ open: true, teacher: row }); setResetError(''); resetResetForm(); setShowResetPwd(false); }}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="Reset password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => router.push(`/dashboard/teachers/${row.id}`)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
          >
            <Eye className="w-4 h-4" />
          </button>
          {canManage && (
            <>
              <button
                onClick={() => router.push(`/dashboard/teachers/${row.id}/edit`)}
                className="p-1.5 text-gray-600 hover:bg-gray-50 rounded"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setArchiveModal({ open: true, teacher: row })}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                title="Archive teacher"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teachers</h1>
          <p className="text-gray-500 text-sm mt-1">Manage school staff</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={() => router.push('/dashboard/teachers/new')}
              className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Teacher
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 max-w-sm">
        <LiveSearch value={search} onChange={setSearch} placeholder="Search teachers…" />
      </div>

      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center justify-between">
          {successMessage}
          <button onClick={() => setSuccessMessage('')} className="ml-2 text-green-500 hover:text-green-700">✕</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={teachers}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          emptyMessage="No teachers found."
        />
      )}

      <ConfirmModal
        isOpen={archiveModal.open}
        onCancel={() => { setArchiveModal({ open: false, teacher: null }); setArchiveReason(''); }}
        onConfirm={handleArchive}
        title="Archive Teacher"
        message={`Are you sure you want to archive ${archiveModal.teacher?.user.name}? They will no longer appear in the active teachers list.`}
        confirmLabel="Archive"
        showReasonInput
        reason={archiveReason}
        onReasonChange={setArchiveReason}
        isLoading={archiveLoading}
      />

      {/* Reset Password Modal */}
      {resetModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setResetModal({ open: false, teacher: null })} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Reset Password</h2>
              <button onClick={() => setResetModal({ open: false, teacher: null })} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Set a new password for <span className="font-medium text-gray-800">{resetModal.teacher?.user.name}</span>.</p>
            {resetError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{resetError}</div>}
            <form onSubmit={handleResetSubmit(onResetSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
                <div className="relative">
                  <input
                    type={showResetPwd ? 'text' : 'password'}
                    {...registerReset('password')}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                    placeholder="Min 6 characters"
                  />
                  <button type="button" onClick={() => setShowResetPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Toggle password visibility">
                    {showResetPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {resetErrors.password && <p className="text-red-500 text-xs mt-1">{resetErrors.password.message}</p>}
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setResetModal({ open: false, teacher: null })} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={resetSubmitting} className="px-4 py-2 text-sm text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2">
                  {resetSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}