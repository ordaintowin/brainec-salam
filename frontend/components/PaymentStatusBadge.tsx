'use client';

type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE';

const statusConfig: Record<PaymentStatus, { label: string; classes: string }> = {
  PAID: { label: 'Paid', classes: 'bg-green-100 text-green-700' },
  PARTIAL: { label: 'Partial', classes: 'bg-yellow-100 text-yellow-700' },
  PENDING: { label: 'Pending', classes: 'bg-gray-100 text-gray-600' },
  OVERDUE: { label: 'Overdue', classes: 'bg-red-100 text-red-700' },
};

export default function PaymentStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as PaymentStatus] ?? { label: status, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes}`}>
      {config.label}
    </span>
  );
}
