'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Pencil } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import DataTable from '@/components/DataTable';
import LiveSearch from '@/components/LiveSearch';
import InitialsAvatar from '@/components/InitialsAvatar';
import { formatDate } from '@/lib/utils';

interface Teacher {
  id: string;
  employeeId?: string;
  user: { name: string; email: string; photoUrl?: string };
  class?: { name: string };
  qualification?: string;
  phone?: string;
  joinDate?: string;
}

export default function TeachersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/teachers', { params: { search, page, limit: 20 } });
      setTeachers(res.data?.teachers || res.data || []);
      setTotalPages(res.data?.totalPages || 1);
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

  const columns = [
    {
      header: 'Teacher',
      cell: (row: Teacher) => (
        <div className="flex items-center gap-3">
          {row.user.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.user.photoUrl} alt={row.user.name} className="w-8 h-8 rounded-full object-cover" />
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
          <button
            onClick={() => router.push(`/dashboard/teachers/${row.id}`)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
          >
            <Eye className="w-4 h-4" />
          </button>
          {canManage && (
            <button
              onClick={() => router.push(`/dashboard/teachers/${row.id}/edit`)}
              className="p-1.5 text-gray-600 hover:bg-gray-50 rounded"
            >
              <Pencil className="w-4 h-4" />
            </button>
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
          <button
            onClick={() => router.push('/dashboard/teachers/new')}
            className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Teacher
          </button>
        )}
      </div>

      <div className="mb-4 max-w-sm">
        <LiveSearch value={search} onChange={setSearch} placeholder="Search teachers…" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <DataTable
          columns={columns as Parameters<typeof DataTable>[0]['columns']}
          data={teachers as Record<string, unknown>[]}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          emptyMessage="No teachers found."
        />
      )}
    </div>
  );
}
