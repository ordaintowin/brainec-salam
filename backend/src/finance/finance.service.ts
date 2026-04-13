import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeeOrderDto, RecordPaymentDto } from './dto/finance.dto';
import { PaymentStatus } from '@prisma/client';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async createFeeOrder(dto: CreateFeeOrderDto, createdById: string) {
    const feeOrder = await this.prisma.feeOrder.create({
      data: {
        title: dto.title,
        description: dto.description,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        classId: dto.classId || null,
        createdById,
      },
      include: { class: true },
    });

    // Find all active students in class (or all classes)
    const studentWhere: any = { isArchived: false };
    if (dto.classId) studentWhere.classId = dto.classId;

    const students = await this.prisma.student.findMany({
      where: studentWhere,
      select: { id: true },
    });

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
    }

    return { ...feeOrder, invoicesCreated: students.length };
  }

  async getFeeOrders(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.feeOrder.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          class: { select: { id: true, name: true } },
          _count: { select: { invoices: true } },
        },
      }),
      this.prisma.feeOrder.count(),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getInvoices(page = 1, limit = 10, q?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (q) {
      where.OR = [
        { student: { firstName: { contains: q, mode: 'insensitive' } } },
        { student: { lastName: { contains: q, mode: 'insensitive' } } },
        { student: { studentId: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.feeInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              studentId: true,
              firstName: true,
              lastName: true,
              class: { select: { id: true, name: true } },
            },
          },
          feeOrder: {
            select: { id: true, title: true, amount: true, dueDate: true },
          },
        },
      }),
      this.prisma.feeInvoice.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStudentInvoices(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('Student not found');

    const invoices = await this.prisma.feeInvoice.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        feeOrder: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });

    return invoices.map((inv) => ({
      ...inv,
      creditBalance: this.computeCreditBalance(
        Number(inv.amountPaid),
        Number(inv.amountDue),
      ),
    }));
  }

  async recordPayment(dto: RecordPaymentDto, recordedById: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id: dto.invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.studentId !== dto.studentId) {
      throw new BadRequestException('Invoice does not belong to this student');
    }

    const amountNum = Number(dto.amount);
    const currentPaid = Number(invoice.amountPaid);
    const amountDue = Number(invoice.amountDue);

    if (amountNum <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const newPaid = currentPaid + amountNum;
    const rawBalance = amountDue - newPaid;
    // Clamp balance at 0 — any excess is carried forward to the next invoice
    const newBalance = rawBalance < 0 ? 0 : rawBalance;
    const creditAmount = rawBalance < 0 ? Math.abs(rawBalance) : 0;

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
          amountPaid: newPaid > amountDue ? amountDue : newPaid,
          balance: newBalance,
          status,
        },
      }),
    ]);

    // Carry forward any credit to the student's next pending invoice
    if (creditAmount > 0) {
      const nextInvoice = await this.prisma.feeInvoice.findFirst({
        where: {
          studentId: dto.studentId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.OVERDUE] },
          id: { not: dto.invoiceId },
        },
        orderBy: { dueDate: 'asc' },
      });

      if (nextInvoice) {
        const nextDue = Number(nextInvoice.amountDue);
        const nextAlreadyPaid = Number(nextInvoice.amountPaid);
        const nextRemaining = Math.max(0, nextDue - nextAlreadyPaid);
        // Only apply credit up to what is actually owed on the next invoice
        const appliedCredit = Math.min(creditAmount, nextRemaining);
        if (appliedCredit > 0) {
          const nextPaid = nextAlreadyPaid + appliedCredit;
          const nextBalance = Math.max(0, nextDue - nextPaid);
          const nextStatus: PaymentStatus =
            nextBalance <= 0 ? PaymentStatus.PAID : nextPaid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.PENDING;

          await this.prisma.$transaction([
            this.prisma.payment.create({
              data: {
                studentId: dto.studentId,
                invoiceId: nextInvoice.id,
                amount: appliedCredit,
                method: dto.method,
                reference: dto.reference,
                paidBy: dto.paidBy,
                recordedBy: recordedById,
                notes: `Credit carried forward from invoice ${dto.invoiceId}`,
              },
            }),
            this.prisma.feeInvoice.update({
              where: { id: nextInvoice.id },
              data: {
                amountPaid: nextPaid,
                balance: nextBalance,
                status: nextStatus,
              },
            }),
          ]);
        }
      }
    }

    return { ...payment, creditCarriedForward: creditAmount };
  }

  /** Compute how much overpayment credit a student has on a specific invoice */
  private computeCreditBalance(amountPaid: number, amountDue: number): number {
    const excess = amountPaid - amountDue;
    return excess > 0 ? excess : 0;
  }

  async getPayments(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
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
            },
          },
          invoice: {
            select: {
              id: true,
              feeOrder: { select: { title: true } },
            },
          },
        },
      }),
      this.prisma.payment.count(),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getFeeOrderSummary(feeOrderId: string) {
    const feeOrder = await this.prisma.feeOrder.findUnique({
      where: { id: feeOrderId },
      include: {
        class: { select: { id: true, name: true } },
        _count: { select: { invoices: true } },
      },
    });
    if (!feeOrder) throw new NotFoundException('Fee order not found');

    const invoices = await this.prisma.feeInvoice.findMany({
      where: { feeOrderId },
      include: {
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

    for (const inv of invoices) {
      const due = Number(inv.amountDue);
      const paid = Number(inv.amountPaid);
      const bal = Number(inv.balance);

      totalToCollect += due;
      totalCollected += paid;
      totalOutstanding += bal;

      const studentInfo = {
        id: inv.student.id,
        studentId: inv.student.studentId,
        name: `${inv.student.firstName} ${inv.student.lastName}`,
        className: inv.student.class?.name || '—',
      };

      if (inv.status === PaymentStatus.PAID || (bal <= 0 && paid > 0)) {
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
        class: feeOrder.class,
        invoiceCount: feeOrder._count.invoices,
      },
      totalToCollect,
      totalCollected,
      totalOutstanding,
      paidStudents,
      owingStudents,
    };
  }

  async getSummary() {
    const [invoices, classes, feeOrders] = await Promise.all([
      this.prisma.feeInvoice.findMany({
        select: {
          amountDue: true,
          amountPaid: true,
          balance: true,
          status: true,
          feeOrderId: true,
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
        select: { id: true, title: true, amount: true, dueDate: true },
        orderBy: { createdAt: 'desc' },
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
      const paid = Number(inv.amountPaid);
      const bal = Number(inv.balance);
      const due = Number(inv.amountDue);

      totalCollected += paid;
      totalOutstanding += bal;
      if (inv.status === PaymentStatus.OVERDUE) totalOverdue += bal;

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
        foEntry.invoiceCount += 1;

        const studentInfo = {
          studentId: inv.student.studentId,
          name: `${inv.student.firstName} ${inv.student.lastName}`,
          className: inv.student.class?.name || '—',
        };

        if (inv.status === PaymentStatus.PAID || (bal <= 0 && paid > 0)) {
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
}
