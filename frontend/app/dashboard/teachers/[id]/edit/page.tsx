'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  address: z.string().optional(),
  qualification: z.string().optional(),
  joinDate: z.string().optional(),
  classId: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
interface ClassOption { id: string; name: string }

export default function EditTeacherPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const fetchData = useCallback(async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        api.get(`/teachers/${id}`),
        api.get('/classes'),
      ]);
      setClasses(cRes.data?.classes || cRes.data || []);
      const t = tRes.data;
      reset({
        name: t.user?.name || '',
        email: t.user?.email || '',
        phone: t.phone || '',
        address: t.address || '',
        qualification: t.qualification || '',
        joinDate: t.joinDate?.split('T')[0] || '',
        classId: t.classId || t.class?.id || '',
      });
    } catch {
      setError('Failed to load teacher data');
    } finally {
      setDataLoaded(true);
    }
  }, [id, reset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      // Step 1: Update teacher info as JSON (PATCH)
      const payload: Record<string, unknown> = {};
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== '') payload[key] = value;
      });
      await api.patch(`/teachers/${id}`, payload);

      // Step 2: Upload photo separately if provided — failure does not block success
      if (photoFile) {
        try {
          const formData = new FormData();
          formData.append('photo', photoFile);
          await api.post(`/teachers/${id}/photo`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          // photo upload failed (e.g. Cloudinary not configured) — teacher still updated
        }
      }

      router.push(`/dashboard/teachers/${id}`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update teacher';
      setError(message);
    }
  };

  if (!dataLoaded) {
    return (
      <div className="p-8 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-96 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Edit Teacher</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input {...register('name')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" {...register('email')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input {...register('phone')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qualification</label>
            <input {...register('qualification')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Join Date</label>
            <input type="date" {...register('joinDate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assign Class</label>
          <select {...register('classId')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
            <option value="">No class assigned</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea {...register('address')} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Update Photo</label>
          <input
            type="file"
            accept="image/*"
            onChange={e => setPhotoFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:bg-[#16a34a] file:text-white file:text-sm cursor-pointer"
          />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
