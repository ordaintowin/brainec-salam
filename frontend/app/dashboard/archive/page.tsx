'use client';
import { useEffect, useState, useCallback } from 'react';
import { RotateCcw, Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import InitialsAvatar from '@/components/InitialsAvatar';

type ArchiveTab = 'students' | 'teachers' | 'attendance';

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

interface ClosedTerm {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  closedAt?: string;
  _count?: { termDays: number };
}

interface TermReportData {
  term: { id: string; name: string; startDate: string; endDate: string; status: string };
  totalSchoolDays: number;
  totalRecords: number;
  students: {
    student: { id: string; studentId: string; firstName: string; lastName: string; className: string };
    present: number;
    absent: number;
    late: number;
    total: number;
    attendancePercent: number;
  }[];
}

export default function ArchivePage() {
  const [activeTab, setActiveTab] = useState<ArchiveTab>('students');
  const [archivedStudents, setArchivedStudents] = useState<ArchivedStudent[]>([]);
  const [archivedTeachers, setArchivedTeachers] = useState<ArchivedTeacher[]>([]);
  const [closedTerms, setClosedTerms] = useState<ClosedTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [termReport, setTermReport] = useState<TermReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

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

  const fetchClosedTerms = useCallback(async () => {
    try {
      const res = await api.get('/terms');
      const all = Array.isArray(res.data) ? res.data : [];
      setClosedTerms(all.filter((t: ClosedTerm) => t.status === 'CLOSED'));
    } catch {
      setClosedTerms([]);
    }
  }, []);

  useEffect(() => {
    fetchArchive();
    fetchClosedTerms();
  }, [fetchArchive, fetchClosedTerms]);

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

  const toggleReport = async (termId: string) => {
    if (expandedReport === termId) {
      setExpandedReport(null);
      setTermReport(null);
      return;
    }
    setExpandedReport(termId);
    setReportLoading(true);
    try {
      const res = await api.get(`/terms/${termId}/report`);
      setTermReport(res.data);
    } catch {
      setTermReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Archive</h1>
        <p className="text-gray-500 text-sm mt-1">View archived records and closed term attendance</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-0">
          {([
            { key: 'students' as const, label: 'Archived Students' },
            { key: 'teachers' as const, label: 'Archived Teachers' },
            { key: 'attendance' as const, label: 'Attendance Archive' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[#16a34a] text-[#16a34a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && activeTab !== 'attendance' ? (
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

          {/* Attendance Archive — Closed Terms */}
          {activeTab === 'attendance' && (
            <div>
              {closedTerms.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-lg">No closed terms yet.</p>
                  <p className="text-sm mt-1">Closed terms with their attendance records will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {closedTerms.map(term => (
                    <div key={term.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div
                        className="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleReport(term.id)}
                      >
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-gray-900">{term.name}</h3>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              CLOSED
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {formatDate(term.startDate)} — {formatDate(term.endDate)}
                            {term._count?.termDays != null && (
                              <span className="ml-2 text-xs text-gray-400">· {term._count.termDays} days</span>
                            )}
                            {term.closedAt && (
                              <span className="ml-2 text-xs text-gray-400">· Closed {formatDate(term.closedAt)}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-gray-400" />
                          {expandedReport === term.id ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {expandedReport === term.id && (
                        <div className="border-t border-gray-200 p-5">
                          {reportLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                            </div>
                          ) : termReport && termReport.term.id === term.id ? (
                            <>
                              <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="bg-gray-50 rounded-lg p-3 text-center">
                                  <p className="text-xs text-gray-400 uppercase">School Days</p>
                                  <p className="text-lg font-bold text-gray-800">{termReport.totalSchoolDays}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3 text-center">
                                  <p className="text-xs text-gray-400 uppercase">Total Records</p>
                                  <p className="text-lg font-bold text-gray-800">{termReport.totalRecords}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3 text-center">
                                  <p className="text-xs text-gray-400 uppercase">Students</p>
                                  <p className="text-lg font-bold text-gray-800">{termReport.students.length}</p>
                                </div>
                              </div>

                              {termReport.students.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="bg-gray-50 border-b">
                                        <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">Student</th>
                                        <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">Class</th>
                                        <th className="text-center px-3 py-2 text-xs text-gray-400 font-medium">Present</th>
                                        <th className="text-center px-3 py-2 text-xs text-gray-400 font-medium">Absent</th>
                                        <th className="text-center px-3 py-2 text-xs text-gray-400 font-medium">Late</th>
                                        <th className="text-center px-3 py-2 text-xs text-gray-400 font-medium">%</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {termReport.students.map(row => (
                                        <tr key={row.student.id} className="hover:bg-gray-50">
                                          <td className="px-3 py-2 font-medium text-gray-800">{row.student.firstName} {row.student.lastName}</td>
                                          <td className="px-3 py-2 text-gray-600 text-xs">{row.student.className}</td>
                                          <td className="px-3 py-2 text-center text-green-700">{row.present}</td>
                                          <td className="px-3 py-2 text-center text-red-600">{row.absent}</td>
                                          <td className="px-3 py-2 text-center text-yellow-600">{row.late}</td>
                                          <td className="px-3 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                              row.attendancePercent >= 80 ? 'bg-green-100 text-green-700' :
                                              row.attendancePercent >= 60 ? 'bg-yellow-100 text-yellow-700' :
                                              'bg-red-100 text-red-700'
                                            }`}>{row.attendancePercent}%</span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-gray-400 text-sm">No attendance records for this term.</p>
                              )}
                            </>
                          ) : (
                            <p className="text-gray-400 text-sm">Failed to load report.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
