import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getInvoiceLedger } from '../finance/invoice-ledger';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      financeInvoices,
      attendanceToday,
      studentsToday,
    ] = await Promise.all([
      this.prisma.student.count({ where: { isArchived: false } }),
      this.prisma.teacher.count({ where: { isArchived: false } }),
      this.prisma.class.count(),
      this.prisma.feeInvoice.findMany({
        where: {
          student: { isArchived: false },
          feeOrder: { isArchived: false } as any,
          isArchivedDebt: false,
          debtCancelledAt: null,
        },
        select: {
          amountDue: true,
          amountPaid: true,
          balance: true,
          dueDate: true,
          payments: { select: { amount: true } },
        },
      }),
      this.prisma.attendance.count({
        where: { date: today, status: 'PRESENT' },
      }),
      this.prisma.attendance.count({
        where: { date: today },
      }),
    ]);

    const ledgers = financeInvoices.map((invoice) => getInvoiceLedger(invoice));

    const totalCollected = ledgers.reduce((sum, invoice) => sum + invoice.amountPaid, 0);
    const totalOutstanding = ledgers.reduce((sum, invoice) => sum + invoice.balance, 0);
    const paymentBreakdown = Array.from(new Set(ledgers.map((invoice) => invoice.status))).map((status) => ({
      status,
      count: ledgers.filter((invoice) => invoice.status === status).length,
    }));
    const todayAttendancePercent =
      studentsToday > 0 ? (attendanceToday / studentsToday) * 100 : 0;

    return {
      totalStudents,
      totalTeachers,
      totalClasses,
      totalCollected,
      totalOutstanding,
      todayAttendancePercent,
      paymentBreakdown: paymentBreakdown.map((p) => ({
        status: p.status,
        count: p.count,
      })),
    };
  }

  async getTeacherDashboard(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId },
      include: { class: true },
    });

    if (!teacher || !teacher.classId) {
      return null;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [studentCount, presentCount, absentCount, lateCount] =
      await Promise.all([
        this.prisma.student.count({
          where: { classId: teacher.classId, isArchived: false },
        }),
        this.prisma.attendance.count({
          where: { classId: teacher.classId, date: today, status: 'PRESENT' },
        }),
        this.prisma.attendance.count({
          where: { classId: teacher.classId, date: today, status: 'ABSENT' },
        }),
        this.prisma.attendance.count({
          where: { classId: teacher.classId, date: today, status: 'LATE' },
        }),
      ]);

    return {
      className: teacher.class?.name ?? '',
      studentCount,
      todayPresent: presentCount,
      todayAbsent: absentCount,
      todayLate: lateCount,
    };
  }
}
