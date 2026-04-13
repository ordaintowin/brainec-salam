'use client';
import { useRef } from 'react';
import { X, Printer } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Payment {
  id: string;
  paidAt: string;
  amount: number;
  method: string;
  reference?: string;
  paidBy: string;
  notes?: string;
}

interface FeeOrder {
  title: string;
  description?: string;
}

interface Invoice {
  id: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: string;
  dueDate: string;
  feeOrder?: FeeOrder;
  payments?: Payment[];
  student?: {
    studentId: string;
    firstName: string;
    lastName: string;
    class?: { name: string };
    guardianName?: string;
    guardianPhone?: string;
  };
}

interface PrintInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  /** If provided, print a single payment receipt instead of the full invoice */
  payment?: Payment;
}

export default function PrintInvoiceModal({ isOpen, onClose, invoice, payment }: PrintInvoiceModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${payment ? 'Payment Receipt' : 'Fee Invoice'}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #16a34a; padding-bottom: 16px; }
            .school-name { font-size: 20px; font-weight: 700; color: #16a34a; }
            .school-sub { font-size: 12px; color: #555; margin-top: 2px; }
            .doc-title { font-size: 18px; font-weight: 600; color: #111; text-align: right; }
            .doc-id { font-size: 11px; color: #888; text-align: right; margin-top: 2px; }
            .section { margin-bottom: 20px; }
            .section-title { font-size: 11px; text-transform: uppercase; color: #888; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 8px; }
            .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            .field { margin-bottom: 6px; }
            .field label { font-size: 11px; color: #666; display: block; }
            .field span { font-weight: 500; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th { background: #f3f4f6; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #666; }
            td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
            .amount-row { display: flex; justify-content: space-between; padding: 6px 0; }
            .amount-label { color: #555; }
            .amount-value { font-weight: 600; }
            .total-row { border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 4px; }
            .status-paid { color: #16a34a; font-weight: 700; }
            .status-partial { color: #d97706; font-weight: 700; }
            .status-pending { color: #6b7280; font-weight: 700; }
            .status-overdue { color: #dc2626; font-weight: 700; }
            .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #888; }
            @media print { body { padding: 16px; } }
          </style>
        </head>
        <body>
          ${content.innerHTML}
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

  const statusClass = (status: string) => {
    const map: Record<string, string> = { PAID: 'status-paid', PARTIAL: 'status-partial', PENDING: 'status-pending', OVERDUE: 'status-overdue' };
    return map[status] || '';
  };

  const student = invoice.student;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Modal toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {payment ? 'Payment Receipt' : 'Fee Invoice'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable area */}
        <div className="overflow-y-auto p-6">
          <div ref={printRef}>
            {/* Header */}
            <div className="header">
              <div>
                <div className="school-name">Brainec Salam School</div>
                <div className="school-sub">School Management System</div>
              </div>
              <div>
                <div className="doc-title">{payment ? 'Payment Receipt' : 'Fee Invoice'}</div>
                <div className="doc-id">{payment ? `Receipt #${payment.id.slice(-8).toUpperCase()}` : `Invoice #${invoice.id.slice(-8).toUpperCase()}`}</div>
              </div>
            </div>

            {/* Student Info */}
            {student && (
              <div className="section">
                <div className="section-title">Student Information</div>
                <div className="grid2">
                  <div>
                    <div className="field"><label>Name</label><span>{student.firstName} {student.lastName}</span></div>
                    <div className="field"><label>Student ID</label><span>{student.studentId}</span></div>
                  </div>
                  <div>
                    <div className="field"><label>Class</label><span>{student.class?.name || '—'}</span></div>
                    <div className="field"><label>Guardian</label><span>{student.guardianName || '—'}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Fee Order Info */}
            <div className="section">
              <div className="section-title">Fee Details</div>
              <div className="field"><label>Fee Order</label><span>{invoice.feeOrder?.title || '—'}</span></div>
              {invoice.feeOrder?.description && <div className="field"><label>Description</label><span>{invoice.feeOrder.description}</span></div>}
              <div className="field"><label>Due Date</label><span>{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</span></div>
            </div>

            {/* Payment Summary */}
            <div className="section">
              <div className="section-title">{payment ? 'Payment Details' : 'Amount Summary'}</div>

              {payment ? (
                <div>
                  <div className="amount-row"><span className="amount-label">Payment Date</span><span className="amount-value">{formatDate(payment.paidAt)}</span></div>
                  <div className="amount-row"><span className="amount-label">Amount Paid</span><span className="amount-value">{formatCurrency(payment.amount)}</span></div>
                  <div className="amount-row"><span className="amount-label">Method</span><span className="amount-value">{payment.method.replace('_', ' ')}</span></div>
                  {payment.reference && <div className="amount-row"><span className="amount-label">Reference</span><span className="amount-value">{payment.reference}</span></div>}
                  <div className="amount-row"><span className="amount-label">Paid By</span><span className="amount-value">{payment.paidBy}</span></div>
                  {payment.notes && <div className="amount-row"><span className="amount-label">Notes</span><span className="amount-value">{payment.notes}</span></div>}
                  <div className="amount-row total-row">
                    <span className="amount-label">Remaining Balance</span>
                    <span className="amount-value">{formatCurrency(invoice.balance)}</span>
                  </div>
                  <div className="amount-row">
                    <span className="amount-label">Invoice Status</span>
                    <span className={`amount-value ${statusClass(invoice.status)}`}>{invoice.status}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="amount-row"><span className="amount-label">Amount Due</span><span className="amount-value">{formatCurrency(invoice.amountDue)}</span></div>
                  <div className="amount-row"><span className="amount-label">Amount Paid</span><span className="amount-value">{formatCurrency(invoice.amountPaid)}</span></div>
                  <div className="amount-row total-row">
                    <span className="amount-label">Balance</span>
                    <span className="amount-value">{formatCurrency(invoice.balance)}</span>
                  </div>
                  <div className="amount-row">
                    <span className="amount-label">Status</span>
                    <span className={`amount-value ${statusClass(invoice.status)}`}>{invoice.status}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment History (invoice view only) */}
            {!payment && invoice.payments && invoice.payments.length > 0 && (
              <div className="section">
                <div className="section-title">Payment History</div>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Paid By</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map(p => (
                      <tr key={p.id}>
                        <td>{formatDate(p.paidAt)}</td>
                        <td>{formatCurrency(p.amount)}</td>
                        <td>{p.method.replace('_', ' ')}</td>
                        <td>{p.paidBy}</td>
                        <td>{p.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            <div className="footer">
              <span>Brainec Salam School Management System</span>
              <span>Printed: {new Date().toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
