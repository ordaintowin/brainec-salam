import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FLOAT_EPSILON, getInvoiceLedger } from './invoice-ledger';

/**
 * Keeps the denormalized invoice and fee-order fields in sync with the
 * relational source of truth:
 *   - Payment rows determine how much has been paid.
 *   - Student.isArchived determines whether a student is current.
 *   - An order is open only while it has a current unpaid invoice.
 *
 * This is intentionally safe to run before read operations. It repairs
 * records created before the archive/payment rules were introduced without
 * inventing payments or deleting financial history.
 */
@Injectable()
export class FinanceReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async reconcile(): Promise<void> {
    const invoices = await this.prisma.feeInvoice.findMany({
      select: {
        id: true,
        feeOrderId: true,
        amountDue: true,
        amountPaid: true,
        balance: true,
        status: true,
        dueDate: true,
        isArchivedDebt: true,
        debtCancelledAt: true,
        student: { select: { isArchived: true } },
        payments: { select: { amount: true } },
      },
    });

    const invoiceUpdates = invoices.flatMap((invoice) => {
      const ledger = getInvoiceLedger(invoice);
      const storedPaid = Number(invoice.amountPaid);
      const storedBalance = Number(invoice.balance);
      const needsLedgerRepair =
        Math.abs(storedPaid - ledger.amountPaid) > FLOAT_EPSILON ||
        Math.abs(storedBalance - ledger.balance) > FLOAT_EPSILON ||
        invoice.status !== ledger.status;

      const needsDebtClassificationRepair =
        invoice.debtCancelledAt === null &&
        invoice.isArchivedDebt !== (
          invoice.student.isArchived && ledger.balance > FLOAT_EPSILON
        );

      if (!needsLedgerRepair && !needsDebtClassificationRepair) return [];

      return [{
        id: invoice.id,
        amountPaid: ledger.amountPaid,
        balance: ledger.balance,
        status: ledger.status,
        isArchivedDebt: invoice.debtCancelledAt === null
          ? invoice.student.isArchived && ledger.balance > FLOAT_EPSILON
          : invoice.isArchivedDebt,
      }];
    });

    if (invoiceUpdates.length > 0) {
      await this.prisma.$transaction(
        invoiceUpdates.map((update) =>
          this.prisma.feeInvoice.update({
            where: { id: update.id },
            data: {
              amountPaid: update.amountPaid,
              balance: update.balance,
              status: update.status as PaymentStatus,
              isArchivedDebt: update.isArchivedDebt,
            },
          }),
        ),
      );
    }

    const orders = await this.prisma.feeOrder.findMany({
      select: {
        id: true,
        isArchived: true,
        invoices: {
          select: {
            amountDue: true,
            amountPaid: true,
            balance: true,
            dueDate: true,
            debtCancelledAt: true,
            student: { select: { isArchived: true } },
            payments: { select: { amount: true } },
          },
        },
      },
    });

    const orderUpdates = orders.flatMap((order) => {
      // Archived students and cancelled debts do not represent current
      // school receivables. Paid invoices remain historical records only.
      const currentInvoices = order.invoices.filter(
        (invoice) => !invoice.student.isArchived && invoice.debtCancelledAt === null,
      );
      const shouldBeArchived =
        currentInvoices.length === 0 ||
        currentInvoices.every((invoice) => getInvoiceLedger(invoice).balance <= FLOAT_EPSILON);

      return order.isArchived === shouldBeArchived
        ? []
        : [{ id: order.id, isArchived: shouldBeArchived }];
    });

    if (orderUpdates.length > 0) {
      await this.prisma.$transaction(
        orderUpdates.map((update) =>
          this.prisma.feeOrder.update({
            where: { id: update.id },
            data: {
              isArchived: update.isArchived,
              archivedAt: update.isArchived ? new Date() : null,
            } as any,
          }),
        ),
      );
    }
  }
}