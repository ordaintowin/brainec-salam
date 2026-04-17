'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Eye, Pencil, Trash2, Download } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import DataTable from '@/components/DataTable';
import LiveSearch from '@/components/LiveSearch';
import ConfirmModal from '@/components/ConfirmModal';
import InitialsAvatar from '@/components/InitialsAvatar';
import { formatDate, exportToCSV } from '@/lib/utils';

interface Student {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class?: { name: string };
  guardianPhone: string;
  photoUrl?: string;
}

export default function StudentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState(searchParams.get('created') === '1' ? 'Student created successfully!' : '');
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { q: search, page, limit: 20 };
      if (user?.role === 'TEACHER' && user?.teacher?.classId) {
        params.classId = user.teacher.classId;
      }
      const res = await api.get('/students', { params });
      const data = res.data;
      if (Array.isArray(data)) {
        setStudents(data);
        setTotalPages(1);
      } else {
        setStudents(Array.isArray(data.data) ? data.data : []);
        setTotalPages(data.meta?.totalPages || 1);
      }
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [search, page, user]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/students/${deleteTarget.id}`, { data: { archiveReason } });
      setDeleteTarget(null);
      setArchiveReason('');
      fetchStudents();
    } catch {
      // TODO: show error toast
    } finally {
      setDeleteLoading(false);
    }
  };

  const canManage = user?.role === 'HEADMISTRESS' || user?.role === 'ADMIN';

  const handleExport = async () => {
    try {
      const res = await api.get('/students', { params: { q: search, page: 1, limit: 10000 } });
      const rows = (res.data?.data || res.data || []) as Student[];
      exportToCSV(
        rows.map(s => ({
          'Student ID': s.studentId,
          'First Name': s.firstName,
          'Last Name': s.lastName,
          'Class': s.class?.name || '',
          'Guardian Phone': s.guardianPhone,
        })),
        'students',
      );
    } catch {
      // silent
    }
  };

  const columns = [
    {
      header: 'Student',
      cell: (row: Student) => (
        <div className="flex items-center gap-3">
          {row.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photoUrl} alt={row.firstName} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <InitialsAvatar name={`${row.firstName} ${row.lastName}`} size="sm" />
          )}
          <span className="font-medium text-gray-800">{row.firstName} {row.lastName}</span>
        </div>
      ),
    },
    {
      header: 'Student ID',
      cell: (row: Student) => <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{row.studentId}</span>,
    },
    {
      header: 'Class',
      cell: (row: Student) => row.class?.name || '—',
    },
    {
      header: 'Guardian Phone',
      cell: (row: Student) => row.guardianPhone || '—',
    },
    {
      header: 'Actions',
      cell: (row: Student) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/dashboard/students/${row.id}`)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
            title="View"
          >
            <Eye className="w-4 h-4" />
          </button>
          {canManage && (
            <>
              <button
                onClick={() => router.push(`/dashboard/students/${row.id}/edit`)}
                className="p-1.5 text-gray-600 hover:bg-gray-50 rounded"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeleteTarget(row)}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                title="Archive"
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
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500 text-sm mt-1">
            {user?.role === 'TEACHER' && user?.teacher?.class?.name
              ? `Students in ${user.teacher.class.name}`
              : 'Manage all enrolled students'}
          </p>
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
              onClick={() => router.push('/dashboard/students/new')}
              className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Student
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 max-w-sm">
        <LiveSearch value={search} onChange={setSearch} placeholder="Search students…" />
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
          data={students}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          emptyMessage="No students found."
        />
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Archive Student"
        message={`Are you sure you want to archive ${deleteTarget?.firstName} ${deleteTarget?.lastName}? They can be restored later from the Archive page.`}
        showReasonInput
        reason={archiveReason}
        onReasonChange={setArchiveReason}
        onConfirm={handleDelete}
        onCancel={() => { setDeleteTarget(null); setArchiveReason(''); }}
        confirmLabel="Archive"
        isLoading={deleteLoading}
      />
    </div>
  );
}
