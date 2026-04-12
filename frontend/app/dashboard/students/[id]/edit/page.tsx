'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['MALE', 'FEMALE']),
  classId: z.string().min(1, 'Class is required'),
  guardianName: z.string().min(1, 'Guardian name is required'),
  guardianPhone: z.string().min(1, 'Guardian phone is required'),
  guardianEmail: z.string().email('Invalid email').optional().or(z.literal('')), 
  guardianAddress: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
interface ClassOption { id: string; name: string }

export default function EditStudentPage() {
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
      const [sRes, cRes] = await Promise.all([
        api.get(`/students/${id}`),
        api.get('/classes'),
      ]);
      setClasses(cRes.data?.classes || cRes.data || []);
      const s = sRes.data;
      reset({
        firstName: s.firstName,
        lastName: s.lastName,
        dateOfBirth: s.dateOfBirth?.split('T')[0],
        gender: s.gender,
        classId: s.classId || s.class?.id || '',
        guardianName: s.guardianName,
        guardianPhone: s.guardianPhone,
        guardianEmail: s.guardianEmail || '',
        guardianAddress: s.guardianAddress || '',
      });
    } catch {
      setError('Failed to load student data');
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
      // Step 1: Update student with JSON
      const payload = {
        ...data,
        guardianEmail: data.guardianEmail || undefined,
        guardianAddress: data.guardianAddress || undefined,
      };
      await api.patch(`/students/${id}`, payload);

      // Step 2: Upload photo separately if provided
      if (photoFile) {
        const formData = new FormData();
        formData.append('photo', photoFile);
        await api.post(`/students/${id}/photo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      router.push(`/dashboard/students/${id}`);
    } catch (err: unknown) {
      const msgRaw = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const message = Array.isArray(msgRaw) ? msgRaw.join(', ') : msgRaw || 'Failed to update student';
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
        <h1 className="text-xl font-bold text-gray-900">Edit Student</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
            <input {...register('firstName')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
            {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
            <input {...register('lastName')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
            {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
            <input type="date" {...register('dateOfBirth')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
            {errors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{errors.dateOfBirth.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
            <select {...register('gender')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
            {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender.message}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
          <select {...register('classId')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
            <option value="">Select class…</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {errors.classId && <p className="text-red-500 text-xs mt-1">{errors.classId.message}</p>}
        </div>

        <hr className="border-gray-100" />
        <h3 className="text-sm font-semibold text-gray-700">Guardian Information</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Name *</label>
            <input {...register('guardianName')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
            {errors.guardianName && <p className="text-red-500 text-xs mt-1">{errors.guardianName.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Phone *</label>
            <input {...register('guardianPhone')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
            {errors.guardianPhone && <p className="text-red-500 text-xs mt-1">{errors.guardianPhone.message}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Email</label>
          <input type="email" {...register('guardianEmail')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
          {errors.guardianEmail && <p className="text-red-500 text-xs mt-1">{errors.guardianEmail.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Address</label>
          <textarea {...register('guardianAddress')} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-none" />
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