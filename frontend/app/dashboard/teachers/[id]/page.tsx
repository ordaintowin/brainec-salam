'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import ProfileCard from '@/components/ProfileCard';
import { formatDate } from '@/lib/utils';

interface Teacher {
  id: string;
  employeeId?: string;
  phone?: string;
  address?: string;
  qualification?: string;
  joinDate?: string;
  user: { name: string; email: string; photoUrl?: string };
  class?: { name: string };
}

export default function TeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTeacher = useCallback(async () => {
    try {
      const res = await api.get(`/teachers/${id}`);
      setTeacher(res.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTeacher();
  }, [fetchTeacher]);

  if (loading) {
    return (
      <div className="p-8 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-32" />
        <div className="h-40 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!teacher) return <div className="p-8 text-gray-500">Teacher not found.</div>;

  const canManage = user?.role === 'HEADMISTRESS' || user?.role === 'ADMIN';

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Teacher Profile</h1>
        {canManage && (
          <button
            onClick={() => router.push(`/dashboard/teachers/${id}/edit`)}
            className="ml-auto flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
        )}
      </div>

      <ProfileCard
        name={teacher.user.name}
        photoUrl={teacher.user.photoUrl}
        idBadge={teacher.employeeId ? `Employee ID: ${teacher.employeeId}` : undefined}
        subtitle={teacher.class ? `Class: ${teacher.class.name}` : undefined}
        details={[
          { label: 'Email', value: teacher.user.email },
          { label: 'Phone', value: teacher.phone || '—' },
          { label: 'Class', value: teacher.class?.name || 'Not assigned' },
          { label: 'Qualification', value: teacher.qualification || '—' },
          { label: 'Join Date', value: teacher.joinDate ? formatDate(teacher.joinDate) : '—' },
          { label: 'Address', value: teacher.address || '—' },
        ]}
      />
    </div>
  );
}
