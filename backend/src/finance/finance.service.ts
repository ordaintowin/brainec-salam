import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeeOrderDto, UpdateFeeOrderDto, RecordPaymentDto, BulkPaymentDto, FeeOrderType } from './dto/finance.dto';
import { PaymentStatus } from '@prisma/client';
import {
  FLOAT_EPSILON,
  getInvoiceLedger,
  InvoiceLedger,
  InvoiceLedgerInput,
} from './invoice-ledger';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private getInvoiceLedger(invoice: InvoiceLedgerInput, now = new Date()): InvoiceLedger {
    return getInvoiceLedger(invoice, now);
  }

  /**
   * Reconcile finance state from the source tables, not from denormalized
   * invoice flags. Student archive state comes from students.isArchived and
   * payment state comes from payments (with stored amountPaid retained only
   * for legacy invoices that have no payment rows).
   *
   * Empty orders are deleted. Orders with historical invoices are retained,
   * but archived when they have no active outstanding invoice.
   */
  private async reconcileFinanceState(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Empty orders are not useful history and must never be represented as
      // archived orders.
      await tx.feeOrder.deleteMany({
        where: { invoices: { none: {} } },
      } as any);

      const orders = await tx.feeOrder.findMany({
        select: {
          id: true,
          isArchived: true,
          archivedAt: true,
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

      for (const order of orders) {
        const hasActiveOutstandingInvoice = order.invoices.some((invoice) => (
          !invoice.student.isArchived &&
          !invoice.debtCancelledAt &&
          this.getInvoiceLedger(invoice).balance > FLOAT_EPSILON
        ));
        const shouldArchive = !hasActiveOutstandingInvoice;

        if (shouldArchive && (!order.isArchived || !order.archivedAt)) {
          await tx.feeOrder.update({
            where: { id: order.id },
            data: { isArchived: true, archivedAt: new Date() } as any,
          });
        } else if (!shouldArchive && (order.isArchived || order.archivedAt)) {
          await tx.feeOrder.update({
            where: { id: order.id },
            data: { isArchived: false, archivedAt: null } as any,
          });
        }
      }
    });
  }

  async createFeeOrder(dto: CreateFeeOrderDto, createdById: string) {
    const selectedClassIds = Array.from(new Set(
      dto.classIds?.filter(Boolean) ?? (dto.classId ? [dto.classId] : []),
    ));

    // Derive the fee order type from provided data when not explicitly supplied
    let orderType: FeeOrderType;
    if (dto.type) {
      orderType = dto.type;
    } else if (dto.studentIds && dto.studentIds.length > 0) {
      orderType = FeeOrderType.INDIVIDUAL;
    } else if (selectedClassIds.length > 0) {
      orderType = FeeOrderType.CLASS;
    } else {
      orderType = FeeOrderType.ALL;
    }

    if (orderType === FeeOrderType.CLASS && selectedClassIds.length === 0) {
      throw new BadRequestException('Select at least one class');
    }

    if (orderType === FeeOrderType.CLASS) {
      const matchingClasses = await this.prisma.class.findMany({
        where: { id: { in: selectedClassIds } },
        select: { id: true },
      });
      if (matchingClasses.length !== selectedClassIds.length) {
        throw new BadRequestException('One or more selected classes were not found');
      }
    }

    const feeOrder = await this.prisma.feeOrder.create({
      data: {
        title: dto.title,
        description: dto.description,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        type: orderType as any,
        // Keep the legacy column populated for single-class orders so older
        // records and integrations continue to work.
        classId: selectedClassIds.length === 1 ? selectedClassIds[0] : null,
        createdById,
        feeOrderClasses: orderType === FeeOrderType.CLASS
          ? { create: selectedClassIds.map((classId) => ({ classId })) }
          : undefined,
      },
      include: {
        class: true,
        feeOrderClasses: { include: { class: true } },
      },
    });

    let students: { id: string }[];

    if (dto.studentIds && dto.studentIds.length > 0) {
      // Create invoices only for the specified students
      students = await this.prisma.student.findMany({
        where: {
          id: { in: dto.studentIds },
          isArchived: false,
        },
        select: { id: true },
      });
    } else {
      // Find all active students in class (or all classes)
      const studentWhere: any = { isArchived: false };
      if (selectedClassIds.length > 0) {
        studentWhere.classId = { in: selectedClassIds };
      }

      students = await this.prisma.student.findMany({
        where: studentWhere,
        select: { id: true },
      });
    }

    if (students.length > 0) {
      await this.prisma.feeInvoice.createMany({
        data: students.map((s) => ({
          studentId: s.id,
          feeOrderId: feeOrder.id,
          amountDue: dto.amount,
          amountPaid: 0,
          balance: dto.amount,
          status: PaymentStatus.PENDING,
          dueDate: new Date(dto.dueDate),
        })),
      });
    } else {
      // A fee order with no matching active students must not remain as an
      // empty order or be moved to Archives.
      await this.prisma.feeOrder.delete({ where: { id: feeOrder.id } });
    }

    return {
      ...feeOrder,
      invoicesCreated: students.length,
      ...(students.length === 0 ? { deleted: true } : {}),
    };
  }

  async getFeeOrders(page = 1, limit = 10, q?: string) {
    await this.reconcileFinanceState();
    const skip = (page - 1) * limit;
    const where: any = { isArchived: false };

    if (q) {
      where.AND = [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [rawData, total] = await Promise.all([
      this.prisma.feeOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          class: { select: { id: true, name: true } },
          feeOrderClasses: {
            include: { class: { select: { id: true, name: true } } },
          },
          invoices: {
            where: {
              student: { isArchived: false },
              debtCancelledAt: null,
            },
            select: {
              amountDue: true,
              amountPaid: true,
              balance: true,
              dueDate: true,
              payments: { select: { amount: true } },
            },
          },
          _count: { select: { invoices: true } },
        },
      }),
      this.prisma.feeOrder.count({ where }),
    ]);

    const data = rawData.map(({ invoices, feeOrderClasses, ...feeOrder }) => {
      const ledgers = invoices.map((invoice) => this.getInvoiceLedger({
        ...invoice,
        payments: invoice.payments,
      }));

      return {
        ...feeOrder,
        classes: feeOrderClasses.map((entry) => entry.class),
        // The fee-order list shows invoices that are still outstanding.
        // Paid invoices remain available through the payment report/history.
        _count: { invoices: ledgers.filter((invoice) => invoice.balance > FLOAT_EPSILON).length },
        totalPaid: ledgers.reduce((sum, invoice) => sum + invoice.amountPaid, 0),
        canDelete: ledgers.every((invoice) => invoice.amountPaid <= FLOAT_EPSILON),
      };
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateFeeOrder(feeOrderId: string, dto: UpdateFeeOrderDto) {
    const feeOrder = await this.prisma.feeOrder.findUnique({
      where: { id: feeOrderId },
      include: {
        invoices: {
          select: {
            studentId: true,
            amountDue: true,
            amountPaid: true,
            balance: true,
            dueDate: true,
            payments: { select: { amount: true } },
          },
        },
      },
    });

    if (!feeOrder) throw new NotFoundException('Fee order not found');
    if (feeOrder.isArchived) {
      throw new BadRequestException('Fully paid fee orders are archived and cannot be edited');
    }

    const amount = dto.amount ?? Number(feeOrder.amount);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : feeOrder.dueDate;

    for (const invoice of feeOrder.invoices) {
      if (amount + FLOAT_EPSILON < this.getInvoiceLedger(invoice).amountPaid) {
        throw new BadRequestException('The order amount cannot be less than an amount already paid');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.feeOrder.update({
        where: { id: feeOrderId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          amount,
          dueDate,
        },
        include: {
          class: { select: { id: true, name: true } },
          feeOrderClasses: {
            include: { class: { select: { id: true, name: true } } },
          },
        },
      });

      for (const invoice of feeOrder.invoices) {
        const amountPaid = this.getInvoiceLedger(invoice).amountPaid;
        const balance = Math.max(0, amount - amountPaid);
        await tx.feeInvoice.updateMany({
          where: { feeOrderId, studentId: invoice.studentId },
          data: {
            amountDue: amount,
            balance,
            dueDate,
            status: balance <= FLOAT_EPSILON
              ? PaymentStatus.PAID
              : amountPaid > FLOAT_EPSILON
                ? PaymentStatus.PARTIAL
                : PaymentStatus.PENDING,
          },
        });
      }

      return updatedOrder;
    });

    await this.checkAndArchiveFeeOrderById(feeOrderId);
    return updated;
  }

  async deleteFeeOrder(feeOrderId: string) {
    const feeOrder = await this.prisma.feeOrder.findUnique({
      where: { id: feeOrderId },
      include: {
        invoices: {
          select: {
            amountPaid: true,
            payments: { select: { id: true } },
          },
        },
      },
    });

    if (!feeOrder) throw new NotFoundException('Fee order not found');
    if (feeOrder.isArchived) {
      throw new BadRequestException('Fully paid fee orders are archived and cannot be deleted');
    }

    const hasPayment = feeOrder.invoices.some(
      (invoice) => Number(invoice.amountPaid) > FLOAT_EPSILON || invoice.payments.length > 0,
    );
    if (hasPayment) {
      throw new BadRequestException('Fee orders with payments cannot be deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.feeInvoice.deleteMany({ where: { feeOrderId } });
      await tx.feeOrder.delete({ where: { id: feeOrderId } });
    });

    return { id: feeOrderId, deleted: true };
  }

  async getInvoices(page = 1, limit = 10, q?: string) {
    // Repair legacy archived-student invoices before loading the active list.
    // This also archives fee orders that no longer have active outstanding
    // invoices.
    await this.reconcileFinanceState();

    const skip = (page - 1) * limit;
    const where: any = {
      student: { isArchived: false },
      feeOrder: { isArchived: false },
      debtCancelledAt: null,
    };

    if (q) {
      where.OR = [
        { student: { firstName: { contains: q, mode: 'insensitive' } } },
        { student: { lastName: { contains: q, mode: 'insensitive' } } },
        { student: { studentId: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const invoices = await this.prisma.feeInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            studentId: true,
            firstName: true,
            lastName: true,
             guardianName: true,
            class: { select: { id: true, name: true } },
          },
        },
        feeOrder: {
          select: { id: true, title: true, amount: true, dueDate: true },
        },
        payments: {
          orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            paidAt: true,
            amount: true,
            method: true,
            reference: true,
            paidBy: true,
            notes: true,
          },
        },
      },
    });

    const outstandingInvoices = invoices
      .map((invoice) => {
        const ledger = this.getInvoiceLedger(invoice);
        return {
          ...invoice,
          amountPaid: ledger.amountPaid,
          balance: ledger.balance,
          status: ledger.status,
        };
      })
      .filter((invoice) => invoice.balance > FLOAT_EPSILON);

    return {
      data: outstandingInvoices.slice(skip, skip + limit),
      meta: {
        total: outstandingInvoices.length,
        page,
        limit,
        totalPages: Math.ceil(outstandingInvoices.length / limit),
      },
    };
  }

  async getStudentInvoices(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('Student not found');

    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        studentId,
        debtCancelledAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        feeOrder: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });

    return invoices
      .map((inv) => {
        const ledger = this.getInvoiceLedger(inv);
        return {
          ...inv,
          amountPaid: ledger.amountPaid,
          balance: ledger.balance,
          status: ledger.status,
          creditBalance: this.computeCreditBalance(ledger.amountPaid, ledger.amountDue),
        };
      })
      .filter((invoice) => invoice.balance > FLOAT_EPSILON);
  }

  async recordPayment(dto: RecordPaymentDto, recordedById: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id: dto.invoiceId },
      include: { payments: { select: { amount: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.studentId !== dto.studentId) {
      throw new BadRequestException('Invoice does not belong to this student');
    }

    const amountNum = Number(dto.amount);
    const amountDue = Number(invoice.amountDue);
    const currentPaid = this.getInvoiceLedger(invoice).amountPaid;
    const currentBalance = Math.max(0, amountDue - currentPaid);

    if (amountNum <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    if (amountNum > currentBalance + FLOAT_EPSILON) {
      throw new BadRequestException(
        `Payment amount (${amountNum.toFixed(2)}) exceeds the outstanding balance (${currentBalance.toFixed(2)})`,
      );
    }

    const newPaid = currentPaid + amountNum;
    const newBalance = Math.max(0, amountDue - newPaid);

    const status: PaymentStatus =
      newBalance <= 0 ? PaymentStatus.PAID : newPaid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.PENDING;

    const [payment] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          studentId: dto.studentId,
          invoiceId: dto.invoiceId,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          paidBy: dto.paidBy,
          recordedBy: recordedById,
          notes: dto.notes,
        },
      }),
      this.prisma.feeInvoice.update({
        where: { id: dto.invoiceId },
        data: {
          amountPaid: newPaid,
          balance: newBalance,
          status,
        },
      }),
    ]);

    // Auto-archive fee order if all its invoices are now fully paid
    await this.checkAndArchiveFeeOrder(dto.invoiceId);

    return payment;
  }

  /** After a payment, check if all invoices for the fee order are paid, and archive the order if so */
  private async checkAndArchiveFeeOrder(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      select: { feeOrderId: true },
    });
    if (!invoice) return;

    const allInvoices = await this.prisma.feeInvoice.findMany({
      where: {
        feeOrderId: invoice.feeOrderId,
        student: { isArchived: false },
        debtCancelledAt: null,
      },
      select: {
        amountDue: true,
        amountPaid: true,
        balance: true,
        dueDate: true,
        payments: { select: { amount: true } },
      },
    });

    // Archived students' invoices are no longer linked to the order. If no
    // active invoices remain, the order is complete from the school's view.
    if (allInvoices.length === 0) {
      const historicalInvoice = await this.prisma.feeInvoice.findFirst({
        where: { feeOrderId: invoice.feeOrderId },
        select: { id: true },
      });
      if (historicalInvoice) {
        await this.prisma.feeOrder.update({
          where: { id: invoice.feeOrderId },
          data: { isArchived: true, archivedAt: new Date() } as any,
        });
      }
      return;
    }

    const allPaid = allInvoices.every((inv) => this.getInvoiceLedger(inv).balance <= FLOAT_EPSILON);

    if (allPaid) await this.checkAndArchiveFeeOrderById(invoice.feeOrderId);
  }

  private async checkAndArchiveFeeOrderById(feeOrderId: string): Promise<void> {
    const allInvoices = await this.prisma.feeInvoice.findMany({
      where: {
        feeOrderId,
        student: { isArchived: false },
        debtCancelledAt: null,
      },
      select: {
        amountDue: true,
        amountPaid: true,
        balance: true,
        dueDate: true,
        payments: { select: { amount: true } },
      },
    });

    // A removed student's invoice is intentionally no longer part of this
    // order. An order with no remaining linked invoices can be archived.
    if (allInvoices.length === 0) {
      const historicalInvoice = await this.prisma.feeInvoice.findFirst({
        where: { feeOrderId },
        select: { id: true },
      });
      if (historicalInvoice) {
        await this.prisma.feeOrder.update({
          where: { id: feeOrderId },
          data: { isArchived: true, archivedAt: new Date() } as any,
        });
      }
      return;
    }

    const allPaid = allInvoices.every((inv) => this.getInvoiceLedger(inv).balance <= FLOAT_EPSILON);

    if (allPaid) {
      await this.prisma.feeOrder.update({
        where: { id: feeOrderId },
        data: { isArchived: true, archivedAt: new Date() } as any,
      });
    }
  }

  async bulkPayment(dto: BulkPaymentDto, recordedById: string) {
    if (!dto.invoiceIds || dto.invoiceIds.length === 0) {
      throw new BadRequestException('At least one invoice must be selected');
    }

    // Load all selected invoices and validate they belong to the student
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { id: { in: dto.invoiceIds }, studentId: dto.studentId },
      orderBy: { dueDate: 'asc' },
      include: { payments: { select: { amount: true } } },
    });

    if (invoices.length !== dto.invoiceIds.length) {
      throw new BadRequestException('One or more invoices not found or do not belong to this student');
    }

    // Compute total outstanding across all selected invoices
    const totalOutstanding = invoices.reduce(
      (sum, inv) => sum + this.getInvoiceLedger(inv).balance,
      0,
    );

    if (dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    if (dto.amount > totalOutstanding + FLOAT_EPSILON) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) exceeds total outstanding balance (${totalOutstanding.toFixed(2)}) for the selected invoices`,
      );
    }

    // Distribute the payment across invoices in due-date order
    let remaining = dto.amount;
    const createdPayments: any[] = [];

    for (const inv of invoices) {
      if (remaining <= 0) break;

      const ledger = this.getInvoiceLedger(inv);
      const balance = ledger.balance;
      if (balance <= 0) continue;

      const applyAmount = Math.min(remaining, balance);
      // Round to 2 decimal places to prevent floating-point precision drift when distributing across invoices
      remaining = Math.round((remaining - applyAmount) * 100) / 100;

      const amountDue = Number(inv.amountDue);
      const newPaid = ledger.amountPaid + applyAmount;
      const newBalance = Math.max(0, amountDue - newPaid);

      const status: PaymentStatus =
        newBalance <= 0 ? PaymentStatus.PAID : newPaid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.PENDING;

      const [payment] = await this.prisma.$transaction([
        this.prisma.payment.create({
          data: {
            studentId: dto.studentId,
            invoiceId: inv.id,
            amount: applyAmount,
            method: dto.method,
            reference: dto.reference,
            paidBy: dto.paidBy,
            recordedBy: recordedById,
            notes: dto.notes,
          },
        }),
        this.prisma.feeInvoice.update({
          where: { id: inv.id },
          data: { amountPaid: newPaid, balance: newBalance, status },
        }),
      ]);

      createdPayments.push(payment);

      // Check and archive fee order if fully paid
      await this.checkAndArchiveFeeOrder(inv.id);
    }

    return { payments: createdPayments, totalApplied: dto.amount };
  }

  /** Compute how much overpayment credit a student has on a specific invoice */
  private computeCreditBalance(amountPaid: number, amountDue: number): number {
    const excess = amountPaid - amountDue;
    return excess > 0 ? excess : 0;
  }

  /** Whether the calculated invoice ledger is fully paid. */
  private isEffectivelyPaid(_status: string, balance: number, _amountPaid: number): boolean {
    return balance <= FLOAT_EPSILON;
  }

  async getPayments(page = 1, limit = 10, q?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (q) {
      where.OR = [
        { student: { firstName: { contains: q, mode: 'insensitive' } } },
        { student: { lastName: { contains: q, mode: 'insensitive' } } },
        { reference: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paidAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              studentId: true,
              firstName: true,
              lastName: true,
              guardianName: true,
              class: { select: { id: true, name: true } },
            },
          },
          invoice: {
            select: {
              id: true,
              amountDue: true,
              amountPaid: true,
              balance: true,
              status: true,
              dueDate: true,
              feeOrder: { select: { title: true, description: true } },
              payments: {
                orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
                select: {
                  id: true,
                  paidAt: true,
                  amount: true,
                  method: true,
                  reference: true,
                  paidBy: true,
                  notes: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    const enrichedData = data.map((payment) => {
      const invoice = payment.invoice;
      if (!invoice) return payment;

      const paymentHistory = invoice.payments.map((entry) => ({
        ...entry,
        amount: Number(entry.amount),
      }));
      const currentIndex = paymentHistory.findIndex((entry) => entry.id === payment.id);
      const previousPayments = currentIndex >= 0 ? paymentHistory.slice(0, currentIndex) : [];
      const previousPaid = previousPayments.reduce((sum, entry) => sum + entry.amount, 0);
      const paymentAmount = Number(payment.amount);
      const ledger = this.getInvoiceLedger(invoice);

      return {
        ...payment,
        amount: paymentAmount,
        previousPayments,
        amountPaidBefore: previousPaid,
        balanceAtPayment: Math.max(0, Number(invoice.amountDue) - previousPaid - paymentAmount),
        invoice: {
          ...invoice,
          amountDue: Number(invoice.amountDue),
          amountPaid: ledger.amountPaid,
          balance: ledger.balance,
          status: ledger.status,
          payments: paymentHistory,
        },
      };
    });

    return {
      data: enrichedData,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getFeeOrderSummary(feeOrderId: string) {
    const feeOrder = await this.prisma.feeOrder.findUnique({
      where: { id: feeOrderId },
      include: {
        class: { select: { id: true, name: true } },
        feeOrderClasses: {
          include: { class: { select: { id: true, name: true } } },
        },
        _count: { select: { invoices: true } },
      },
    });
    if (!feeOrder) throw new NotFoundException('Fee order not found');

    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        feeOrderId,
        // Finance views are school-wide views. Archived students keep their
        // invoice history on their own profile, but must not contribute to
        // fee-order details or debtor totals.
        student: { isArchived: false },
        debtCancelledAt: null,
      },
      include: {
        student: {
          select: {
            id: true,
            studentId: true,
            firstName: true,
            lastName: true,
            classId: true,
            isArchived: true,
            class: { select: { name: true } },
          },
        },
        payments: { select: { amount: true } },
      },
    });

    let totalToCollect = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    const paidStudents: {
      id: string;
      studentId: string;
      name: string;
      className: string;
      amountPaid: number;
      amountDue: number;
    }[] = [];
    const owingStudents: {
      id: string;
      studentId: string;
      name: string;
      className: string;
      balance: number;
      amountDue: number;
      amountPaid: number;
    }[] = [];

    const visibleInvoices = invoices;

    for (const inv of visibleInvoices) {
      const ledger = this.getInvoiceLedger(inv);
      const due = ledger.amountDue;
      const paid = ledger.amountPaid;
      const bal = ledger.balance;

      totalToCollect += due;
      totalCollected += paid;
      totalOutstanding += bal;

      const studentInfo = {
        id: inv.student.id,
        studentId: inv.student.studentId,
        name: `${inv.student.firstName} ${inv.student.lastName}`,
        className: inv.student.class?.name || '—',
        isArchived: inv.student.isArchived,
      };

      if (this.isEffectivelyPaid(ledger.status, bal, paid)) {
        paidStudents.push({ ...studentInfo, amountPaid: paid, amountDue: due });
      } else if (bal > 0) {
        owingStudents.push({
          ...studentInfo,
          balance: bal,
          amountDue: due,
          amountPaid: paid,
        });
      }
    }

    return {
      feeOrder: {
        id: feeOrder.id,
        title: feeOrder.title,
        description: feeOrder.description,
        amount: Number(feeOrder.amount),
        dueDate: feeOrder.dueDate,
        type: (feeOrder as any).type,
        class: feeOrder.class,
        classes: feeOrder.feeOrderClasses.map((entry) => entry.class),
        invoiceCount: visibleInvoices.filter((inv) => this.getInvoiceLedger(inv).balance > FLOAT_EPSILON).length,
        isArchived: (feeOrder as any).isArchived,
        archivedAt: (feeOrder as any).archivedAt,
      },
      totalToCollect,
      totalCollected,
      totalOutstanding,
      paidStudents,
      owingStudents,
    };
  }

  async getSummary() {
    await this.reconcileFinanceState();
    const [invoices, classes, feeOrders] = await Promise.all([
      this.prisma.feeInvoice.findMany({
        where: {
          feeOrder: { isArchived: false } as any,
          student: { isArchived: false },
          debtCancelledAt: null,
        },
        select: {
          amountDue: true,
          amountPaid: true,
          balance: true,
          status: true,
          feeOrderId: true,
          dueDate: true,
          payments: { select: { amount: true } },
          student: {
            select: {
              id: true,
              studentId: true,
              firstName: true,
              lastName: true,
              classId: true,
              class: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.class.findMany({ select: { id: true, name: true } }),
      this.prisma.feeOrder.findMany({
        where: { isArchived: false } as any,
        select: { id: true, title: true, amount: true, dueDate: true },
      }),
    ]);

    let totalCollected = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;

    const classMap: Record<
      string,
      { name: string; collected: number; outstanding: number }
    > = {};
    classes.forEach((c) => {
      classMap[c.id] = { name: c.name, collected: 0, outstanding: 0 };
    });

    // Per-fee-order breakdown
    const feeOrderMap: Record<
      string,
      {
        title: string;
        amount: number;
        dueDate: Date;
        totalToCollect: number;
        totalCollected: number;
        totalOutstanding: number;
        invoiceCount: number;
        paidStudents: {
          studentId: string;
          name: string;
          className: string;
          amountPaid: number;
        }[];
        owingStudents: {
          studentId: string;
          name: string;
          className: string;
          balance: number;
        }[];
      }
    > = {};
    feeOrders.forEach((fo) => {
      feeOrderMap[fo.id] = {
        title: fo.title,
        amount: Number(fo.amount),
        dueDate: fo.dueDate,
        totalToCollect: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        invoiceCount: 0,
        paidStudents: [],
        owingStudents: [],
      };
    });

    for (const inv of invoices) {
      const ledger = this.getInvoiceLedger(inv);
      const paid = ledger.amountPaid;
      const bal = ledger.balance;
      const due = ledger.amountDue;

      totalCollected += paid;
      totalOutstanding += bal;
      if (ledger.status === PaymentStatus.OVERDUE) totalOverdue += bal;

      const cid = inv.student.classId;
      if (classMap[cid]) {
        classMap[cid].collected += paid;
        classMap[cid].outstanding += bal;
      }

      // Fee order breakdown
      const foEntry = feeOrderMap[inv.feeOrderId];
      if (foEntry) {
        foEntry.totalToCollect += due;
        foEntry.totalCollected += paid;
        foEntry.totalOutstanding += bal;
        if (bal > FLOAT_EPSILON) {
          foEntry.invoiceCount += 1;
        }

        const studentInfo = {
          studentId: inv.student.studentId,
          name: `${inv.student.firstName} ${inv.student.lastName}`,
          className: inv.student.class?.name || '—',
        };

        if (this.isEffectivelyPaid(ledger.status, bal, paid)) {
          foEntry.paidStudents.push({ ...studentInfo, amountPaid: paid });
        } else if (bal > 0) {
          foEntry.owingStudents.push({ ...studentInfo, balance: bal });
        }
      }
    }

    return {
      totalCollected,
      totalOutstanding,
      totalOverdue,
      perClassBreakdown: Object.entries(classMap).map(([id, v]) => ({
        classId: id,
        className: v.name,
        collected: v.collected,
        outstanding: v.outstanding,
      })),
      feeOrderBreakdown: Object.entries(feeOrderMap).map(([id, v]) => ({
        feeOrderId: id,
        title: v.title,
        amount: v.amount,
        dueDate: v.dueDate,
        totalToCollect: v.totalToCollect,
        totalCollected: v.totalCollected,
        totalOutstanding: v.totalOutstanding,
        invoiceCount: v.invoiceCount,
        paidStudents: v.paidStudents,
        owingStudents: v.owingStudents,
      })),
    };
  }

  async cancelDebt(invoiceId: string, cancelledById: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        amountDue: true,
        amountPaid: true,
        balance: true,
        dueDate: true,
        payments: { select: { amount: true } },
        debtCancelledAt: true,
        student: { select: { isArchived: true } },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.debtCancelledAt) {
      throw new BadRequestException('This debt has already been cancelled');
    }
    if (!invoice.student.isArchived) {
      throw new BadRequestException('Only archived student debt can be cancelled');
    }
    if (this.getInvoiceLedger(invoice).balance <= FLOAT_EPSILON) {
      throw new BadRequestException('This invoice is already fully paid');
    }

    return this.prisma.feeInvoice.update({
      where: { id: invoiceId },
      data: {
        debtCancelledAt: new Date(),
        debtCancelledBy: cancelledById,
      },
    });
  }

  async getArchivedFeeOrders(page = 1, limit = 10, q?: string) {
    // Reconcile first so stale open orders and empty archived orders cannot
    // leak into the Archives tab.
    await this.reconcileFinanceState();

    const skip = (page - 1) * limit;
    const where: any = { isArchived: true };

    if (q) {
      where.AND = [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [rawData, total] = await Promise.all([
      this.prisma.feeOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { archivedAt: 'desc' } as any,
        include: {
          class: { select: { id: true, name: true } },
          feeOrderClasses: {
            include: { class: { select: { id: true, name: true } } },
          },
          _count: { select: { invoices: true } },
        },
      }),
      this.prisma.feeOrder.count({ where }),
    ]);

    const data = rawData.map(({ feeOrderClasses, ...feeOrder }) => ({
      ...feeOrder,
      classes: feeOrderClasses.map((entry) => entry.class),
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
