'use client';
import { useEffect, useState, useCallback } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import InitialsAvatar from '@/components/InitialsAvatar';

type ArchiveTab = 'students' | 'teachers';

interface ArchivedStudent {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class?: { name: string };
  archiveReason?: string;
  archivedAt?: string;
}

interface ArchivedTeacher {
  id: string;
  employeeId?: string;
  user: { name: string; email: string };
  class?: { name: string };
  archiveReason?: string;
  archivedAt?: string;
}

export default function ArchivePage() {
  const [activeTab, setActiveTab] = useState<ArchiveTab>('students');
  const [archivedStudents, setArchivedStudents] = useState<ArchivedStudent[]>([]);
  const [archivedTeachers, setArchivedTeachers] = useState<ArchivedTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchArchive = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        api.get('/students/archived'),
        api.get('/teachers/archived'),
      ]);
      const studentsData = sRes.data?.data;
      const teachersData = tRes.data?.data;
      setArchivedStudents(Array.isArray(studentsData) ? studentsData : (Array.isArray(sRes.data) ? sRes.data : []));
      setArchivedTeachers(Array.isArray(teachersData) ? teachersData : (Array.isArray(tRes.data) ? tRes.data : []));
    } catch {
      setArchivedStudents([]);
      setArchivedTeachers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchive();
  }, [fetchArchive]);

  const restoreStudent = async (id: string) => {
    setRestoringId(id);
    try {
      await api.post(`/students/${id}/restore`);
      setArchivedStudents(prev => prev.filter(s => s.id !== id));
    } catch {
      // silent
    } finally {
      setRestoringId(null);
    }
  };

  const restoreTeacher = async (id: string) => {
    setRestoringId(id);
    try {
      await api.post(`/teachers/${id}/restore`);
      setArchivedTeachers(prev => prev.filter(t => t.id !== id));
    } catch {
      // silent
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Archive</h1>
        <p className="text-gray-500 text-sm mt-1">View and restore archived records</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-0">
          {(['students', 'teachers'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-[#16a34a] text-[#16a34a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Archived {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Archived Students */}
          {activeTab === 'students' && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student ID</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Class</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Archived</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Reason</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {archivedStudents.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No archived students.</td></tr>
                  ) : (
                    archivedStudents.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <InitialsAvatar name={`${s.firstName} ${s.lastName}`} size="sm" />
                            <span className="font-medium text-gray-800">{s.firstName} {s.lastName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.studentId}</td>
                        <td className="px-4 py-3 text-gray-600">{s.class?.name || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{s.archivedAt ? formatDate(s.archivedAt) : '—'}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{s.archiveReason || '—'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => restoreStudent(s.id)}
                            disabled={restoringId === s.id}
                            className="flex items-center gap-1.5 text-xs text-[#16a34a] hover:text-green-700 font-medium"
                          >
                            {restoringId === s.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Archived Teachers */}
          {activeTab === 'teachers' && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Teacher</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Email</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Class</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Archived</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Reason</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {archivedTeachers.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No archived teachers.</td></tr>
                  ) : (
                    archivedTeachers.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <InitialsAvatar name={t.user.name} size="sm" />
                            <span className="font-medium text-gray-800">{t.user.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{t.user.email}</td>
                        <td className="px-4 py-3 text-gray-600">{t.class?.name || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{t.archivedAt ? formatDate(t.archivedAt) : '—'}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{t.archiveReason || '—'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => restoreTeacher(t.id)}
                            disabled={restoringId === t.id}
                            className="flex items-center gap-1.5 text-xs text-[#16a34a] hover:text-green-700 font-medium"
                          >
                            {restoringId === t.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
