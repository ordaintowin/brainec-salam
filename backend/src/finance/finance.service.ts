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

    return this.prisma.feeInvoice.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        feeOrder: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
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
    if (currentPaid + amountNum > amountDue) {
      throw new BadRequestException('Payment exceeds invoice amount due');
    }

    const newPaid = currentPaid + amountNum;
    const newBalance = amountDue - newPaid;

    let status: PaymentStatus;
    if (newBalance <= 0) {
      status = PaymentStatus.PAID;
    } else if (newPaid > 0) {
      status = PaymentStatus.PARTIAL;
    } else {
      const dueDate = new Date(invoice.dueDate);
      status = dueDate < new Date() ? PaymentStatus.OVERDUE : PaymentStatus.PENDING;
    }

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

    return payment;
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

  async getSummary() {
    const [invoices, classes] = await Promise.all([
      this.prisma.feeInvoice.findMany({
        select: {
          amountDue: true,
          amountPaid: true,
          balance: true,
          status: true,
          student: { select: { classId: true, class: { select: { name: true } } } },
        },
      }),
      this.prisma.class.findMany({ select: { id: true, name: true } }),
    ]);

    let totalCollected = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;

    const classMap: Record<string, { name: string; collected: number; outstanding: number }> = {};
    classes.forEach((c) => {
      classMap[c.id] = { name: c.name, collected: 0, outstanding: 0 };
    });

    for (const inv of invoices) {
      totalCollected += Number(inv.amountPaid);
      totalOutstanding += Number(inv.balance);
      if (inv.status === PaymentStatus.OVERDUE) totalOverdue += Number(inv.balance);

      const cid = inv.student.classId;
      if (classMap[cid]) {
        classMap[cid].collected += Number(inv.amountPaid);
        classMap[cid].outstanding += Number(inv.balance);
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
    };
  }
}
