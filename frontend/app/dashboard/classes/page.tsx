'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Pencil, Trash2, Loader2, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import ConfirmModal from '@/components/ConfirmModal';

interface SchoolClass {
  id: string;
  name: string;
  description?: string;
  _count?: { students: number };
  teacher?: { user: { name: string } };
}

const schema = z.object({
  name: z.string().min(1, 'Class name is required'),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function ClassesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<SchoolClass | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchoolClass | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/classes');
      setClasses(res.data?.classes || res.data || []);
    } catch {
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const openCreate = () => {
    setEditTarget(null);
    reset({ name: '', description: '' });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (cls: SchoolClass) => {
    setEditTarget(cls);
    reset({ name: cls.name, description: cls.description || '' });
    setFormError('');
    setShowModal(true);
  };

  const onSubmit = async (data: FormData) => {
    setFormError('');
    try {
      if (editTarget) {
        await api.put(`/classes/${editTarget.id}`, data);
      } else {
        await api.post('/classes', data);
      }
      setShowModal(false);
      fetchClasses();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save class';
      setFormError(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/classes/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchClasses();
    } catch {
      // silent
    } finally {
      setDeleteLoading(false);
    }
  };

  const canManage = user?.role === 'HEADMISTRESS' || user?.role === 'ADMIN';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Classes</h1>
          <p className="text-gray-500 text-sm mt-1">Manage school classes</p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Class
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Class Name</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Students</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Teacher</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Description</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {classes.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No classes found.</td></tr>
              ) : (
                classes.map(cls => (
                  <tr key={cls.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{cls.name}</td>
                    <td className="px-4 py-3 text-gray-600">{cls._count?.students ?? 0}</td>
                    <td className="px-4 py-3 text-gray-600">{cls.teacher?.user.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{cls.description || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => router.push(`/dashboard/classes/${cls.id}`)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                          <Eye className="w-4 h-4" />
                        </button>
                        {canManage && (
                          <>
                            <button onClick={() => openEdit(cls)} className="p-1.5 text-gray-600 hover:bg-gray-50 rounded">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteTarget(cls)} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">{editTarget ? 'Edit Class' : 'Create Class'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {formError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{formError}</div>}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Class Name *</label>
                <input {...register('name')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea {...register('description')} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-none" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2">
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editTarget ? 'Save Changes' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Class"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isLoading={deleteLoading}
      />
    </div>
  );
}
