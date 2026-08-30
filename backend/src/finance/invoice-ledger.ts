import { PaymentStatus } from '@prisma/client';

export const FLOAT_EPSILON = 0.001;

export type InvoiceLedgerInput = {
  amountDue: unknown;
  amountPaid?: unknown;
  balance?: unknown;
  dueDate?: Date | string;
  payments?: { amount: unknown }[];
};

export type InvoiceLedger = {
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: PaymentStatus;
};

/**
 * Payment rows are authoritative whenever an invoice has payment history.
 * Legacy invoices without payment rows retain their stored amountPaid value.
 */
export function getInvoiceLedger(
  invoice: InvoiceLedgerInput,
  now = new Date(),
): InvoiceLedger {
  const amountDue = Math.max(0, Number(invoice.amountDue) || 0);
  const storedAmountPaid = Math.max(0, Number(invoice.amountPaid) || 0);
  const payments = invoice.payments ?? [];
  const paymentTotal = payments.reduce(
    (sum, payment) => sum + Math.max(0, Number(payment.amount) || 0),
    0,
  );
  const amountPaid = payments.length > 0 ? paymentTotal : storedAmountPaid;
  const balance = Math.max(0, amountDue - amountPaid);
  const isOverdue =
    balance > FLOAT_EPSILON &&
    !!invoice.dueDate &&
    new Date(invoice.dueDate).getTime() < now.getTime();

  return {
    amountDue,
    amountPaid,
    balance,
    status:
      balance <= FLOAT_EPSILON
        ? PaymentStatus.PAID
        : isOverdue
          ? PaymentStatus.OVERDUE
          : amountPaid > FLOAT_EPSILON
            ? PaymentStatus.PARTIAL
            : PaymentStatus.PENDING,
  };
}

export function isEffectivelyPaid(balance: number): boolean {
  return balance <= FLOAT_EPSILON;
}