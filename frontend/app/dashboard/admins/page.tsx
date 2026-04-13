'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Loader2, ToggleLeft, ToggleRight, Eye, EyeOff, KeyRound } from 'lucide-react';
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
}

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['ADMIN', 'HEADMISTRESS']),
});
type CreateFormData = z.infer<typeof createSchema>;

const resetSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
type ResetFormData = z.infer<typeof resetSchema>;

export default function AdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resetModal, setResetModal] = useState<{ open: boolean; admin: Admin | null }>({ open: false, admin: null });
  const [formError, setFormError] = useState('');
  const [resetError, setResetError] = useState('');
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [showCreatePwd, setShowCreatePwd] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormData>({ resolver: zodResolver(createSchema), defaultValues: { role: 'ADMIN' } });

  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    reset: resetResetForm,
    formState: { errors: resetErrors, isSubmitting: resetSubmitting },
  } = useForm<ResetFormData>({ resolver: zodResolver(resetSchema) });

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/users', { params: { excludeRole: 'TEACHER', limit: 100 } });
      setAdmins(res.data?.data || res.data || []);
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

  const onCreateSubmit = async (data: CreateFormData) => {
    setFormError('');
    try {
      await api.post('/users', data);
      setShowCreateModal(false);
      reset();
      setSuccessMsg('Admin account created successfully.');
      fetchAdmins();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create admin';
      setFormError(message);
    }
  };

  const onResetSubmit = async (data: ResetFormData) => {
    if (!resetModal.admin) return;
    setResetError('');
    try {
      await api.patch(`/users/${resetModal.admin.id}`, { password: data.password });
      setResetModal({ open: false, admin: null });
      resetResetForm();
      setSuccessMsg(`Password updated for ${resetModal.admin.name}.`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update password';
      setResetError(message);
    }
  };

  const toggleActive = async (adminId: string, currentlyActive: boolean) => {
    setToggleLoading(adminId);
    try {
      await api.patch(`/users/${adminId}/toggle`);
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
          onClick={() => { reset(); setFormError(''); setShowCreateModal(true); }}
          className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Create Admin
        </button>
      </div>

      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center justify-between">
          {successMsg}
          <button onClick={() => setSuccessMsg('')} className="ml-2 text-green-500 hover:text-green-700">✕</button>
        </div>
      )}

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
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Created</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No admins found.</td></tr>
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
                        {admin.role === 'HEADMISTRESS' ? 'Headmistress (L1)' : 'Admin (L2)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(admin.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        admin.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {admin.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setResetModal({ open: true, admin }); setResetError(''); resetResetForm(); setShowResetPwd(false); }}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Reset password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {admin.id !== user?.id && (
                          <button
                            onClick={() => toggleActive(admin.id, admin.isActive)}
                            disabled={toggleLoading === admin.id}
                            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                            title={admin.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {toggleLoading === admin.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : admin.isActive ? (
                              <ToggleRight className="w-5 h-5 text-[#16a34a]" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
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

      {/* Create Admin Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Create Admin Account</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {formError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{formError}</div>}
            <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
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
                <div className="relative">
                  <input
                    type={showCreatePwd ? 'text' : 'password'}
                    {...register('password')}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                  />
                  <button type="button" onClick={() => setShowCreatePwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showCreatePwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select {...register('role')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                  <option value="ADMIN">Admin (Level 2)</option>
                  <option value="HEADMISTRESS">Headmistress (Level 1)</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2">
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setResetModal({ open: false, admin: null })} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Reset Password</h2>
              <button onClick={() => setResetModal({ open: false, admin: null })} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Set a new password for <span className="font-medium text-gray-800">{resetModal.admin?.name}</span>.</p>
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
                  <button type="button" onClick={() => setShowResetPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showResetPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {resetErrors.password && <p className="text-red-500 text-xs mt-1">{resetErrors.password.message}</p>}
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setResetModal({ open: false, admin: null })} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
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
