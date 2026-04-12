'use client';
import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface ActivityLog {
  id: string;
  createdAt: string;
  admin?: { name: string; email: string };
  action: string;
  description: string;
  ipAddress?: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/logs', {
        params: {
          page,
          limit: 30,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        },
      });
      setLogs(res.data?.logs || res.data || []);
      setTotalPages(res.data?.totalPages || 1);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate]);

  const actionColors: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-700',
    UPDATE: 'bg-blue-100 text-blue-700',
    DELETE: 'bg-red-100 text-red-700',
    LOGIN: 'bg-purple-100 text-purple-700',
    LOGOUT: 'bg-gray-100 text-gray-600',
    PAYMENT: 'bg-yellow-100 text-yellow-700',
    RESTORE: 'bg-teal-100 text-teal-700',
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
        <p className="text-gray-500 text-sm mt-1">Read-only audit trail of all system activity</p>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
          />
        </div>
        {(fromDate || toDate) && (
          <div className="flex items-end">
            <button
              onClick={() => { setFromDate(''); setToDate(''); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase whitespace-nowrap">Date & Time</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">User</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Action</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Description</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No activity logs found.</td></tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-700">{log.admin?.name || '—'}</p>
                        {log.admin?.email && <p className="text-xs text-gray-400">{log.admin.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          actionColors[log.action] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-sm">{log.description}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{log.ipAddress || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
