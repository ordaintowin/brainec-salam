'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2, CreditCard, CheckCircle, Printer } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface SelectedInvoice {
  id: string;
  feeOrderTitle: string;
  balance: number;
}

interface ReceiptData {
  invoices: { title: string; amount: number }[];
  totalPaid: number;
  method: string;
  paidBy: string;
  reference?: string;
  notes?: string;
  receiptNo: string;
  paidAt: string;
}

const schema = z.object({
  amount: z.string().min(1, 'Amount is required').refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Payment amount must be greater than zero'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY']),
  reference: z.string().optional(),
  paidBy: z.string().min(1, 'Paid by is required'),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface BulkPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName?: string;
  studentCode?: string;
  selectedInvoices: SelectedInvoice[];
  onSuccess?: () => void;
}

interface SuccessReceiptViewProps {
  receiptData: ReceiptData;
  studentName?: string;
  studentCode?: string;
  onClose: () => void;
}

function SuccessReceiptView({ receiptData, studentName, studentCode, onClose }: SuccessReceiptViewProps) {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=700');
    if (!printWindow) return;

    const invoiceRows = receiptData.invoices
      .map(inv => `<tr><td>${inv.title}</td><td style="text-align:right">GH₵ ${Number(inv.amount).toFixed(2)}</td></tr>`)
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bulk Payment Receipt - ${receiptData.receiptNo}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #16a34a; padding-bottom: 16px; }
            .school-name { font-size: 20px; font-weight: 700; color: #16a34a; }
            .school-sub { font-size: 12px; color: #555; margin-top: 2px; }
            .doc-title { font-size: 18px; font-weight: 600; color: #111; text-align: right; }
            .doc-id { font-size: 11px; color: #888; text-align: right; margin-top: 2px; }
            .section { margin-bottom: 20px; }
            .section-title { font-size: 11px; text-transform: uppercase; color: #888; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
            .field { margin-bottom: 6px; }
            .field label { font-size: 11px; color: #666; display: block; }
            .field span { font-weight: 500; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th { background: #f3f4f6; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #666; }
            td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
            .total-row td { font-weight: 700; border-top: 2px solid #16a34a; border-bottom: none; color: #16a34a; font-size: 13px; }
            .amount-row { display: flex; justify-content: space-between; padding: 6px 0; }
            .amount-label { color: #555; }
            .amount-value { font-weight: 600; }
            .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #888; }
            @media print { body { padding: 16px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="school-name">Brainec Salam School</div>
              <div class="school-sub">School Management System</div>
            </div>
            <div>
              <div class="doc-title">Bulk Payment Receipt</div>
              <div class="doc-id">Receipt No: ${receiptData.receiptNo}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Student Information</div>
            ${studentName ? `<div class="field"><label>Student Name</label><span>${studentName}</span></div>` : ''}
            ${studentCode ? `<div class="field"><label>Student ID</label><span>${studentCode}</span></div>` : ''}
            <div class="field"><label>Payment Date</label><span>${receiptData.paidAt}</span></div>
          </div>

          <div class="section">
            <div class="section-title">Invoices Paid</div>
            <table>
              <thead>
                <tr>
                  <th>Fee Type</th>
                  <th style="text-align:right">Amount Applied</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceRows}
                <tr class="total-row">
                  <td>Total Paid</td>
                  <td style="text-align:right">GH₵ ${Number(receiptData.totalPaid).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Payment Details</div>
            <div class="amount-row"><span class="amount-label">Payment Method</span><span class="amount-value">${receiptData.method.replace(/_/g, ' ')}</span></div>
            <div class="amount-row"><span class="amount-label">Paid By</span><span class="amount-value">${receiptData.paidBy}</span></div>
            ${receiptData.reference ? `<div class="amount-row"><span class="amount-label">Reference</span><span class="amount-value">${receiptData.reference}</span></div>` : ''}
            ${receiptData.notes ? `<div class="amount-row"><span class="amount-label">Notes</span><span class="amount-value">${receiptData.notes}</span></div>` : ''}
            <div class="amount-row"><span class="amount-label">Date &amp; Time</span><span class="amount-value">${receiptData.paidAt}</span></div>
          </div>

          <div class="footer">
            <span>Brainec Salam School Management System</span>
            <span>Printed: ${receiptData.paidAt}</span>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      // Delay allows the print window's styles to fully load before printing
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  const methodLabel: Record<string, string> = {
    CASH: 'Cash',
    BANK_TRANSFER: 'Bank Transfer',
    MOBILE_MONEY: 'Mobile Money',
  };

  return (
    <div className="text-center">
      <div className="flex justify-center mb-3">
        <CheckCircle className="w-14 h-14 text-[#16a34a]" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-1">Payment Recorded Successfully!</h3>
      <p className="text-sm text-gray-500 mb-5">Receipt No: <span className="font-semibold text-gray-700">{receiptData.receiptNo}</span></p>

      <div className="text-left bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
        {(studentName || studentCode) && (
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Student</p>
            {studentName && <p className="text-sm font-semibold text-gray-800">{studentName}</p>}
            {studentCode && <p className="text-xs text-gray-500">{studentCode}</p>}
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">Invoices Paid</p>
          <div className="space-y-1">
            {receiptData.invoices.map((inv, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700 truncate mr-2">{inv.title}</span>
                <span className="text-gray-900 font-medium shrink-0">{formatCurrency(inv.amount)}</span>
              </div>
            ))}
            <div className="border-t border-gray-200 pt-1 mt-1 flex justify-between text-sm font-bold">
              <span className="text-gray-700">Total Paid</span>
              <span className="text-[#16a34a]">{formatCurrency(receiptData.totalPaid)}</span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">Payment Details</p>
          <div className="space-y-0.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Method</span><span className="font-medium text-gray-800">{methodLabel[receiptData.method] ?? receiptData.method}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Paid By</span><span className="font-medium text-gray-800">{receiptData.paidBy}</span></div>
            {receiptData.reference && <div className="flex justify-between"><span className="text-gray-500">Reference</span><span className="font-medium text-gray-800">{receiptData.reference}</span></div>}
            {receiptData.notes && <div className="flex justify-between"><span className="text-gray-500">Notes</span><span className="font-medium text-gray-800">{receiptData.notes}</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">Date &amp; Time</span><span className="font-medium text-gray-800">{receiptData.paidAt}</span></div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#16a34a] hover:bg-green-700 rounded-lg"
        >
          <Printer className="w-4 h-4" />
          Print Receipt
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function BulkPaymentModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  studentCode,
  selectedInvoices,
  onSuccess,
}: BulkPaymentModalProps) {
  const [error, setError] = useState('');
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const totalBalance = selectedInvoices.reduce((sum, inv) => sum + Number(inv.balance), 0);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { method: 'CASH' },
  });

  if (!isOpen) return null;

  const onSubmit = async (data: FormData) => {
    setError('');
    const amount = parseFloat(data.amount);
    if (amount > totalBalance + 0.001) { // 0.001 tolerance for floating-point precision
      setError(`Amount cannot exceed total outstanding balance of ${formatCurrency(totalBalance)}`);
      return;
    }
    try {
      await api.post('/finance/bulk-payments', {
        studentId,
        invoiceIds: selectedInvoices.map(inv => inv.id),
        amount,
        method: data.method,
        reference: data.reference,
        paidBy: data.paidBy,
        notes: data.notes,
      });
      setReceiptData({
        invoices: selectedInvoices.map(inv => ({ title: inv.feeOrderTitle, amount: Number(inv.balance) })),
        totalPaid: amount,
        method: data.method,
        paidBy: data.paidBy,
        reference: data.reference,
        notes: data.notes,
        receiptNo: `BULK-${Date.now().toString(36).toUpperCase()}`,
        paidAt: new Date().toLocaleString('en-GH'),
      });
      onSuccess?.();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to record bulk payment';
      setError(message);
    }
  };

  const handleClose = () => {
    reset();
    setError('');
    setReceiptData(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={receiptData ? undefined : handleClose} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {receiptData ? (
          <SuccessReceiptView
            receiptData={receiptData}
            studentName={studentName}
            studentCode={studentCode}
            onClose={handleClose}
          />
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#16a34a]" />
                <h2 className="text-lg font-semibold text-gray-900">Bulk Payment</h2>
              </div>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selected invoices summary */}
            <div className="mb-4 bg-gray-50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Selected Invoices ({selectedInvoices.length})</p>
              {selectedInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{inv.feeOrderTitle}</span>
                  <span className="text-red-600 font-medium ml-2 shrink-0">{formatCurrency(inv.balance)}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-2 mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Total Outstanding</span>
                <span className="text-base font-bold text-red-600">{formatCurrency(totalBalance)}</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₵) *</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={totalBalance}
                    {...register('amount')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                    placeholder={`Max: ${totalBalance.toFixed(2)}`}
                  />
                  <button
                    type="button"
                    onClick={() => setValue('amount', totalBalance.toFixed(2))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#16a34a] hover:underline font-medium"
                  >
                    Pay all
                  </button>
                </div>
                {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
                <p className="text-xs text-gray-400 mt-1">Payment will be distributed across invoices by due date</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                <select
                  {...register('method')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input
                  {...register('reference')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                  placeholder="Transaction reference…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paid By *</label>
                <input
                  {...register('paidBy')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
                  placeholder="Guardian / parent name…"
                />
                {errors.paidBy && <p className="text-red-500 text-xs mt-1">{errors.paidBy.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  {...register('notes')}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#16a34a] hover:bg-green-700 rounded-lg disabled:opacity-60 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Record Bulk Payment
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
