'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import InitialsAvatar from '@/components/InitialsAvatar';

interface Admin {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  createdBy?: { name: string };
}

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['ADMIN', 'HEADMISTRESS']),
});
type FormData = z.infer<typeof schema>;

export default function AdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { role: 'ADMIN' } });

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admins');
      setAdmins(res.data?.admins || res.data || []);
    } catch {
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'HEADMISTRESS') fetchAdmins();
  }, [fetchAdmins, user]);

  if (user?.role !== 'HEADMISTRESS') {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-gray-400">You do not have permission to view this page.</p>
      </div>
    );
  }

  const onSubmit = async (data: FormData) => {
    setFormError('');
    try {
      await api.post('/admins', data);
      setShowModal(false);
      reset();
      fetchAdmins();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create admin';
      setFormError(message);
    }
  };

  const toggleActive = async (adminId: string, currentlyActive: boolean) => {
    setToggleLoading(adminId);
    try {
      await api.patch(`/admins/${adminId}/toggle`, { isActive: !currentlyActive });
      setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, isActive: !currentlyActive } : a));
    } catch {
      // silent
    } finally {
      setToggleLoading(null);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admins</h1>
          <p className="text-gray-500 text-sm mt-1">Manage system administrators</p>
        </div>
        <button
          onClick={() => { reset(); setFormError(''); setShowModal(true); }}
          className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Create Admin
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Admin</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Created By</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Created</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No admins found.</td></tr>
              ) : (
                admins.map(admin => (
                  <tr key={admin.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <InitialsAvatar name={admin.name} size="sm" />
                        <span className="font-medium text-gray-800">{admin.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{admin.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        admin.role === 'HEADMISTRESS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {admin.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{admin.createdBy?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(admin.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        admin.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {admin.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {admin.id !== user?.id && (
                        <button
                          onClick={() => toggleActive(admin.id, admin.isActive)}
                          disabled={toggleLoading === admin.id}
                          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
                          title={admin.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {toggleLoading === admin.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : admin.isActive ? (
                            <ToggleRight className="w-5 h-5 text-[#16a34a]" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-gray-400" />
                          )}
                          {admin.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Admin Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Create Admin Account</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {formError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{formError}</div>}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input {...register('name')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" {...register('email')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input type="password" {...register('password')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select {...register('role')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                  <option value="ADMIN">Admin</option>
                  <option value="HEADMISTRESS">Headmistress</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2">
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
