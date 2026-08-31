import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FLOAT_EPSILON, getInvoiceLedger } from '../finance/invoice-ledger';

@Injectable()
export class ArchiveService {
  constructor(private prisma: PrismaService) {}

  async getArchivedStudents(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where: { isArchived: true },
        skip,
        take: limit,
        orderBy: { archivedAt: 'desc' },
        include: { class: { select: { id: true, name: true } } },
      }),
      this.prisma.student.count({ where: { isArchived: true } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getArchivedTeachers(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.teacher.findMany({
        where: { isArchived: true },
        skip,
        take: limit,
        orderBy: { archivedAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          class: { select: { id: true, name: true } },
        },
      }),
      this.prisma.teacher.count({ where: { isArchived: true } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async restoreStudent(id: string) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student || !student.isArchived) {
      throw new NotFoundException('Archived student not found');
    }
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { studentId: id, debtCancelledAt: null },
      select: {
        id: true,
        amountDue: true,
        amountPaid: true,
        balance: true,
        dueDate: true,
        payments: { select: { amount: true } },
      },
    });
    const outstandingInvoiceIds = invoices
      .filter((invoice) => getInvoiceLedger(invoice).balance > FLOAT_EPSILON)
      .map((invoice) => invoice.id);

    if (outstandingInvoiceIds.length > 0) {
      await this.prisma.feeInvoice.updateMany({
        where: { id: { in: outstandingInvoiceIds } },
        data: { isArchivedDebt: true },
      });
    }
    return this.prisma.student.update({
      where: { id },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
    });
  }

  async deleteStudent(id: string) {
    await this.prisma.$transaction(async (tx) => {
      // Recheck inside the transaction so a student restored while the
      // confirmation request was in flight cannot be deleted accidentally.
      const student = await tx.student.findUnique({
        where: { id },
        select: { id: true, isArchived: true },
      });
      if (!student || !student.isArchived) {
        throw new NotFoundException('Archived student not found');
      }

      const invoices = await tx.feeInvoice.findMany({
        where: { studentId: id },
        select: { id: true },
      });
      const invoiceIds = invoices.map((invoice) => invoice.id);

      // Payments have two foreign keys to the student data: studentId and
      // invoiceId. Remove both possible shapes before removing invoices.
      await tx.payment.deleteMany({
        where: {
          OR: [
            { studentId: id },
            { invoiceId: { in: invoiceIds } },
          ],
        },
      });
      await tx.feeInvoice.deleteMany({ where: { studentId: id } });
      await tx.attendance.deleteMany({ where: { studentId: id } });
      const deleted = await tx.student.deleteMany({
        where: { id, isArchived: true },
      });
      if (deleted.count !== 1) {
        throw new NotFoundException('Archived student was changed before deletion');
      }
    });

    return { id, deleted: true };
  }

  async restoreTeacher(id: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id } });
    if (!teacher || !teacher.isArchived) {
      throw new NotFoundException('Archived teacher not found');
    }
    return this.prisma.teacher.update({
      where: { id },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
    });
  }

  async deleteTeacher(id: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      select: { id: true, userId: true, isArchived: true },
    });
    if (!teacher || !teacher.isArchived) {
      throw new NotFoundException('Archived teacher not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.activityLog.deleteMany({ where: { userId: teacher.userId } });
      await tx.teacher.delete({ where: { id } });
      await tx.user.delete({ where: { id: teacher.userId } });
    });

    return { id, deleted: true };
  }
}
