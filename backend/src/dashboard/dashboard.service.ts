import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
      invoices,
      attendanceToday,
      studentsToday,
      paymentBreakdown,
    ] = await Promise.all([
      this.prisma.student.count({ where: { isArchived: false } }),
      this.prisma.teacher.count({ where: { isArchived: false } }),
      this.prisma.class.count(),
      this.prisma.feeInvoice.aggregate({
        _sum: { amountPaid: true, balance: true },
      }),
      this.prisma.attendance.count({
        where: { date: today, status: 'PRESENT' },
      }),
      this.prisma.attendance.count({
        where: { date: today },
      }),
      this.prisma.feeInvoice.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ]);

    const totalCollected = Number(invoices._sum.amountPaid ?? 0);
    const totalOutstanding = Number(invoices._sum.balance ?? 0);
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
        count: p._count.status,
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
