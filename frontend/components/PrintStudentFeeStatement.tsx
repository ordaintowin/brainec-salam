'use client';

import { useRef } from 'react';
import { Printer, X } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Student {
  studentId: string;
  firstName: string;
  lastName: string;
  class?: { name: string };
  guardianName?: string;
  guardianPhone?: string;
}

interface Invoice {
  id: string;
  feeOrder?: { title: string };
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: string;
  dueDate: string;
}

interface PrintStudentFeeStatementProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  invoices: Invoice[];
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export default function PrintStudentFeeStatement({
  isOpen,
  onClose,
  student,
  invoices,
}: PrintStudentFeeStatementProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const totalDue = invoices.reduce((sum, invoice) => sum + Number(invoice.amountDue), 0);
  const totalPaid = invoices.reduce((sum, invoice) => sum + Number(invoice.amountPaid), 0);
  const totalOutstanding = invoices.reduce((sum, invoice) => sum + Number(invoice.balance), 0);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Student Fee Statement</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 0; padding: 28px; font-size: 12px; }
            header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #16a34a; padding-bottom: 14px; margin-bottom: 20px; }
            h1 { color: #16a34a; margin: 0; font-size: 21px; }
            h2 { margin: 0; font-size: 17px; }
            .muted { color: #6b7280; margin-top: 4px; }
            .student { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; margin-bottom: 20px; }
            .label { color: #6b7280; font-size: 10px; text-transform: uppercase; }
            .value { font-weight: 600; margin-top: 3px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th { background: #f3f4f6; color: #4b5563; text-align: left; font-size: 10px; text-transform: uppercase; padding: 8px; }
            td { border-bottom: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
            .right { text-align: right; }
            .owing { color: #dc2626; font-weight: 600; }
            .totals { margin: 20px 0 0 auto; width: 300px; }
            .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
            .total-row.final { border-top: 2px solid #111827; border-bottom: 0; font-size: 14px; font-weight: 700; padding-top: 9px; }
            footer { border-top: 1px solid #d1d5db; margin-top: 28px; padding-top: 10px; color: #6b7280; display: flex; justify-content: space-between; }
            @media print { body { padding: 12px; } }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Student Fee Statement</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-6">
          <div ref={printRef}>
            <div className="flex items-start justify-between border-b-2 border-green-600 pb-4 mb-5">
              <div>
                <h1 className="text-xl font-bold text-[#16a34a]">Brainec Salam School</h1>
                <p className="text-sm text-gray-500 mt-1">Student Fee Statement</p>
              </div>
              <p className="text-xs text-gray-500">Printed: {formatDate(new Date())}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4 mb-5">
              <div>
                <p className="text-[10px] uppercase text-gray-500">Student Name</p>
                <p className="font-semibold text-gray-900">{student.firstName} {student.lastName}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-500">Student ID</p>
                <p className="font-semibold text-gray-900">{student.studentId}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-500">Class</p>
                <p className="font-semibold text-gray-900">{student.class?.name || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-500">Guardian</p>
                <p className="font-semibold text-gray-900">{student.guardianName || '—'}</p>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-gray-800">Outstanding Invoices</h3>
            {invoices.length > 0 ? (
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Invoice</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Fee Name</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Due Date</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">Total</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">Paid</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map(invoice => (
                    <tr key={invoice.id}>
                      <td className="px-3 py-2 font-mono text-xs">INV-{invoice.id.slice(-6).toUpperCase()}</td>
                      <td className="px-3 py-2">{invoice.feeOrder?.title || '—'}</td>
                      <td className="px-3 py-2">{formatDate(invoice.dueDate)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(invoice.amountDue)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{formatCurrency(invoice.amountPaid)}</td>
                      <td className="px-3 py-2 text-right text-red-600 font-medium">{formatCurrency(invoice.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500 py-5">There are no outstanding invoices for this student.</p>
            )}

            <div className="mt-5 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Total invoice cost</span><span className="font-medium">{formatCurrency(totalDue)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="font-medium text-green-700">{formatCurrency(totalPaid)}</span></div>
              <div className="flex justify-between border-t border-gray-300 pt-2 text-base font-bold"><span>Current total owed</span><span className="text-red-600">{formatCurrency(totalOutstanding)}</span></div>
            </div>

            <div className="mt-8 border-t border-gray-200 pt-3 flex justify-between text-xs text-gray-500">
              <span>Brainec Salam School Management System</span>
              <span>Student Fee Statement</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}