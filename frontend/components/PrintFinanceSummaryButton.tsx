'use client';

import { Printer } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface FinanceSummary {
  totalCollected: number;
  totalOutstanding: number;
  totalOverdue: number;
  perClassBreakdown: {
    classId: string;
    className: string;
    collected: number;
    outstanding: number;
  }[];
  feeOrderBreakdown?: {
    feeOrderId: string;
    title: string;
    amount: number;
    dueDate: string;
    totalToCollect: number;
    totalCollected: number;
    totalOutstanding: number;
    invoiceCount: number;
    owingStudents: { name: string; studentId?: string; className?: string; balance: number }[];
  }[];
}

interface FeeOrderSummary {
  feeOrderId: string;
  title: string;
  amount: number;
  dueDate: string;
  totalToCollect: number;
  totalCollected: number;
  totalOutstanding: number;
  invoiceCount: number;
  owingStudents?: { name: string; studentId?: string; className?: string; balance: number }[];
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export default function PrintFinanceSummaryButton({
  summary,
  feeOrders = [],
  reportTitle = 'Finance Summary Report',
  includeClassBreakdown = true,
  buttonLabel = 'Print Summary Report',
}: {
  summary: FinanceSummary;
  feeOrders?: FeeOrderSummary[];
  reportTitle?: string;
  includeClassBreakdown?: boolean;
  buttonLabel?: string;
}) {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) return;

    const classRows = summary.perClassBreakdown.map(item => `
      <tr>
        <td>${escapeHtml(item.className)}</td>
        <td>${escapeHtml(formatCurrency(item.collected))}</td>
        <td>${escapeHtml(formatCurrency(item.outstanding))}</td>
      </tr>
    `).join('');

    const ordersToPrint = feeOrders.length > 0 ? feeOrders : (summary.feeOrderBreakdown || []);
    const feeOrderRows = ordersToPrint.map(order => `
      <tr>
        <td>${escapeHtml(order.title)}</td>
        <td>${escapeHtml(formatDate(order.dueDate))}</td>
        <td>${order.invoiceCount}</td>
        <td>${escapeHtml(formatCurrency(order.totalToCollect))}</td>
        <td class="paid">${escapeHtml(formatCurrency(order.totalCollected))}</td>
        <td class="owing">${escapeHtml(formatCurrency(order.totalOutstanding))}</td>
      </tr>
    `).join('');

    const owingStudentRows = ordersToPrint.flatMap(order =>
      (order.owingStudents || []).map(student => `
        <tr>
          <td>${escapeHtml(order.title)}</td>
          <td>${escapeHtml(student.name)}</td>
          <td>${escapeHtml(student.studentId || '—')}</td>
          <td>${escapeHtml(student.className || '—')}</td>
          <td class="owing">${escapeHtml(formatCurrency(student.balance))}</td>
        </tr>
      `),
    ).join('');

    const printedAt = new Date().toLocaleDateString('en-GH', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(reportTitle)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 0; padding: 28px; font-size: 12px; }
            header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #16a34a; padding-bottom: 14px; margin-bottom: 22px; }
            h1 { color: #16a34a; margin: 0; font-size: 21px; }
            h2 { margin: 22px 0 8px; font-size: 14px; }
            .subtitle, .printed { color: #6b7280; margin-top: 4px; }
            .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
            .card { border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; }
            .label { color: #6b7280; text-transform: uppercase; font-size: 10px; }
            .value { font-size: 18px; font-weight: 700; margin-top: 5px; }
            .green { color: #15803d; }
            .red, .owing { color: #dc2626; }
            .orange { color: #c2410c; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th { background: #f3f4f6; color: #4b5563; text-align: left; font-size: 10px; text-transform: uppercase; padding: 8px; }
            td { border-bottom: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
            .paid { color: #15803d; }
            footer { border-top: 1px solid #d1d5db; margin-top: 28px; padding-top: 10px; color: #6b7280; display: flex; justify-content: space-between; }
             @media (max-width: 640px) {
               body { padding: 16px; font-size: 11px; }
               header { display: block; }
               .printed { margin-top: 8px; }
               .cards { grid-template-columns: 1fr; }
               table { display: block; overflow-x: auto; white-space: nowrap; }
               th, td { padding: 6px; }
               footer { display: block; }
               footer span { display: block; margin-bottom: 4px; }
             }
            @media print { body { padding: 12px; } }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>Brainec Salam School</h1>
             <div class="subtitle">${escapeHtml(reportTitle)}</div>
            </div>
            <div class="printed">Printed: ${escapeHtml(printedAt)}</div>
          </header>

          <div class="cards">
            <div class="card"><div class="label">Total Collected</div><div class="value green">${escapeHtml(formatCurrency(summary.totalCollected))}</div></div>
            <div class="card"><div class="label">Outstanding</div><div class="value red">${escapeHtml(formatCurrency(summary.totalOutstanding))}</div></div>
            <div class="card"><div class="label">Overdue</div><div class="value orange">${escapeHtml(formatCurrency(summary.totalOverdue))}</div></div>
          </div>

           ${includeClassBreakdown ? `
             <h2>Class Breakdown</h2>
             <table>
               <thead><tr><th>Class</th><th>Collected</th><th>Outstanding</th></tr></thead>
               <tbody>${classRows || '<tr><td colspan="3">No class data available.</td></tr>'}</tbody>
             </table>
           ` : ''}

           ${ordersToPrint.length > 0 ? `
             <h2>Fee Order Breakdown</h2>
             <table>
               <thead><tr><th>Fee Order</th><th>Due Date</th><th>Invoices</th><th>To Collect</th><th>Collected</th><th>Outstanding</th></tr></thead>
               <tbody>${feeOrderRows}</tbody>
             </table>
           ` : ''}

           ${owingStudentRows ? `
             <h2>Students Owing</h2>
             <table>
               <thead><tr><th>Fee Order</th><th>Student</th><th>Student ID</th><th>Class</th><th>Amount Owing</th></tr></thead>
               <tbody>${owingStudentRows}</tbody>
             </table>
           ` : ''}

          <footer>
            <span>Brainec Salam School Management System</span>
            <span>Finance Summary</span>
          </footer>
        </body>
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
    <button
      type="button"
      onClick={handlePrint}
      className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
    >
      <Printer className="w-4 h-4" />
      {buttonLabel}
    </button>
  );
}