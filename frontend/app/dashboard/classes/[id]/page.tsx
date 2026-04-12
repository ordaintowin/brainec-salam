'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import InitialsAvatar from '@/components/InitialsAvatar';

interface Student {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
}

interface SchoolClass {
  id: string;
  name: string;
  description?: string;
  teacher?: { user: { name: string; email: string } };
  students?: Student[];
  _count?: { students: number };
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cls, setCls] = useState<SchoolClass | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchClass = useCallback(async () => {
    try {
      const res = await api.get(`/classes/${id}`);
      setCls(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchClass();
  }, [fetchClass]);

  if (loading) {
    return (
      <div className="p-8 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-32" />
        <div className="h-40 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!cls) return <div className="p-8 text-gray-500">Class not found.</div>;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{cls.name}</h1>
      </div>

      {/* Class Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Class Name</p>
            <p className="text-sm font-medium text-gray-800 mt-1">{cls.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Students</p>
            <p className="text-sm font-medium text-gray-800 mt-1">{cls._count?.students ?? cls.students?.length ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Assigned Teacher</p>
            <p className="text-sm font-medium text-gray-800 mt-1">{cls.teacher?.user.name || 'Not assigned'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Description</p>
            <p className="text-sm font-medium text-gray-800 mt-1">{cls.description || '—'}</p>
          </div>
        </div>
      </div>

      {/* Student Roster */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Student Roster</h2>
        {!cls.students || cls.students.length === 0 ? (
          <p className="text-gray-400 text-sm">No students enrolled in this class.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">#</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Student</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Student ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cls.students.map((s, idx) => (
                  <tr
                    key={s.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/dashboard/students/${s.id}`)}
                  >
                    <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {s.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.photoUrl} alt={s.firstName} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <InitialsAvatar name={`${s.firstName} ${s.lastName}`} size="sm" />
                        )}
                        <span className="font-medium text-gray-800">{s.firstName} {s.lastName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.studentId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
