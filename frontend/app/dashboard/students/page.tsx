'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import DataTable from '@/components/DataTable';
import LiveSearch from '@/components/LiveSearch';
import ConfirmModal from '@/components/ConfirmModal';
import InitialsAvatar from '@/components/InitialsAvatar';
import { formatDate } from '@/lib/utils';

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
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/students', { params: { search, page, limit: 20 } });
      setStudents(res.data.students || res.data);
      setTotalPages(res.data.totalPages || 1);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

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
      await api.delete(`/students/${deleteTarget.id}`, { data: { reason: archiveReason } });
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
          <p className="text-gray-500 text-sm mt-1">Manage all enrolled students</p>
        </div>
        {canManage && (
          <button
            onClick={() => router.push('/dashboard/students/new')}
            className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Student
          </button>
        )}
      </div>

      <div className="mb-4 max-w-sm">
        <LiveSearch value={search} onChange={setSearch} placeholder="Search students…" />
      </div>

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
