'use client';
import { useEffect, useState, useCallback } from 'react';
import { Save, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface SchoolClass {
  id: string;
  name: string;
}

interface StudentRow {
  studentId: string;
  id: string;
  firstName: string;
  lastName: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
  notes: string;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [termName, setTermName] = useState<string | null>(null);
  const [isTermClosed, setIsTermClosed] = useState(false);

  const isTeacher = user?.role === 'TEACHER';

  const fetchClasses = useCallback(async () => {
    try {
      const res = await api.get('/classes');
      const allClasses: SchoolClass[] = res.data?.classes || res.data || [];
      setClasses(allClasses);

      if (isTeacher && user?.teacher?.classId) {
        setSelectedClassId(user.teacher.classId);
      } else if (allClasses.length > 0 && !selectedClassId) {
        setSelectedClassId(allClasses[0].id);
      }
    } catch {
      setClasses([]);
    }
  }, [isTeacher, user, selectedClassId]);

  useEffect(() => {
    fetchClasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStudentsForAttendance = useCallback(async () => {
    if (!selectedClassId || !selectedDate) return;
    setLoading(true);
    setError('');
    try {
      // Fetch class attendance (students + existing records for the date) in one call
      const attRes = await api.get(`/attendance`, { params: { classId: selectedClassId, date: selectedDate } });

      // Handle both old format (array) and new format (object with records/term info)
      let attRecords: Array<{
        student: { id: string; studentId: string; firstName: string; lastName: string };
        attendance: { status: string; notes?: string } | null;
      }>;

      if (Array.isArray(attRes.data)) {
        attRecords = attRes.data;
        setTermName(null);
        setIsTermClosed(false);
      } else {
        attRecords = attRes.data?.records || [];
        setTermName(attRes.data?.termName || null);
        setIsTermClosed(attRes.data?.isTermClosed || false);
      }

      setStudents(
        attRecords.map(r => ({
          id: r.student.id,
          studentId: r.student.studentId,
          firstName: r.student.firstName,
          lastName: r.student.lastName,
          status: (r.attendance?.status as 'PRESENT' | 'ABSENT' | 'LATE') || 'PRESENT',
          notes: r.attendance?.notes || '',
        }))
      );
    } catch {
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedDate]);

  useEffect(() => {
    if (selectedClassId) fetchStudentsForAttendance();
  }, [fetchStudentsForAttendance, selectedClassId]);

  const toggleStatus = (studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE') => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, status } : s));
    setSaved(false);
  };

  const updateNotes = (studentId: string, notes: string) => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, notes } : s));
    setSaved(false);
  };

  const saveAttendance = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/attendance/bulk', {
        classId: selectedClassId,
        date: selectedDate,
        records: students.map(s => ({
          studentId: s.id,
          status: s.status,
          notes: s.notes,
        })),
      });
      setSaved(true);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save attendance';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const statusConfig = {
    PRESENT: { label: 'Present', classes: 'bg-green-100 text-green-700 ring-green-500' },
    ABSENT: { label: 'Absent', classes: 'bg-red-100 text-red-700 ring-red-500' },
    LATE: { label: 'Late', classes: 'bg-yellow-100 text-yellow-700 ring-yellow-500' },
  };

  const presentCount = students.filter(s => s.status === 'PRESENT').length;
  const absentCount = students.filter(s => s.status === 'ABSENT').length;
  const lateCount = students.filter(s => s.status === 'LATE').length;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-gray-500 text-sm mt-1">Mark and view daily attendance</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 mb-6">
        {!isTeacher && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
            >
              <option value="">Select class…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {isTeacher && user?.teacher?.class && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-700">
              {user.teacher.class.name}
            </div>
          </div>
        )}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* Term Info Banner */}
      {termName && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between ${
          isTermClosed ? 'bg-gray-100 border border-gray-200 text-gray-600' : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          <span>
            <strong>Term:</strong> {termName}
            {isTermClosed && <span className="ml-2 text-xs font-medium bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">CLOSED — editing disabled</span>}
          </span>
        </div>
      )}

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          Attendance saved successfully!
        </div>
      )}

      {/* Summary strip */}
      {students.length > 0 && (
        <div className="flex gap-4 mb-4 text-sm">
          <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full font-medium">Present: {presentCount}</span>
          <span className="px-3 py-1 bg-red-50 text-red-700 rounded-full font-medium">Absent: {absentCount}</span>
          <span className="px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full font-medium">Late: {lateCount}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {selectedClassId ? 'No students in this class.' : 'Select a class to mark attendance.'}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">#</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Student</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((student, idx) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{student.firstName} {student.lastName}</p>
                      <p className="text-xs text-gray-400">{student.studentId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {(['PRESENT', 'ABSENT', 'LATE'] as const).map(status => (
                          <button
                            key={status}
                            onClick={() => toggleStatus(student.id, status)}
                            disabled={isTermClosed}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                              student.status === status
                                ? `${statusConfig[status].classes} ring-2`
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            } ${isTermClosed ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            {statusConfig[status].label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={student.notes}
                        onChange={e => updateNotes(student.id, e.target.value)}
                        placeholder="Optional note…"
                        disabled={isTermClosed}
                        className={`w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#16a34a] ${isTermClosed ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveAttendance}
              disabled={saving || isTermClosed}
              className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Attendance
            </button>
          </div>
        </>
      )}
    </div>
  );
}
