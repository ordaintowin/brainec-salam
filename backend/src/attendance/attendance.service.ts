import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MarkAttendanceDto,
  BulkAttendanceDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  private static readonly MS_PER_DAY = 86_400_000;
  /** Find the active term that covers the given date, if any */
  private async getTermForDate(date: Date) {
    return this.prisma.term.findFirst({
      where: {
        status: 'ACTIVE',
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
  }

  /** Ensure attendance for a closed term cannot be modified */
  private async ensureTermNotClosed(termId: string | null | undefined) {
    if (!termId) return;
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (term && term.status === 'CLOSED') {
      throw new ForbiddenException(
        `Attendance cannot be modified — term "${term.name}" is closed`,
      );
    }
  }

  /** Check if the given date is today (UTC). Only HEADMISTRESS can edit past days. */
  private ensureSameDay(date: Date, userRole: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setUTCHours(0, 0, 0, 0);
    if (target.getTime() < today.getTime() && userRole !== 'HEADMISTRESS') {
      throw new ForbiddenException(
        'Past attendance records cannot be modified',
      );
    }
  }

  /**
   * Check if a previous school day's attendance is unclosed for the given class.
   * Returns the unclosed date if found.
   */
  async getUnclosedPreviousDay(classId: string): Promise<{ date: Date; dateStr: string } | null> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Find the active term
    const activeTerm = await this.prisma.term.findFirst({
      where: { status: 'ACTIVE' },
      include: {
        termDays: {
          where: { isHoliday: false, date: { lt: today } },
          orderBy: { date: 'desc' },
          take: 5,
        },
      },
    });

    if (!activeTerm || activeTerm.termDays.length === 0) return null;

    // Check each past school day (most recent first) for unclosed attendance
    for (const termDay of activeTerm.termDays) {
      const d = new Date(termDay.date);
      d.setUTCHours(0, 0, 0, 0);

      // Check if attendance was marked for this day
      const hasRecords = await this.prisma.attendance.count({
        where: { classId, date: d, termId: activeTerm.id },
      });

      if (hasRecords === 0) continue; // No attendance was marked, skip

      // Check if it was closed
      const closure = await this.prisma.dailyAttendanceClosure.findUnique({
        where: { classId_date: { classId, date: d } },
      });

      if (!closure) {
        return {
          date: d,
          dateStr: d.toISOString().split('T')[0],
        };
      }
    }

    return null;
  }

  async markAttendance(dto: MarkAttendanceDto, markedById: string, userRole = 'ADMIN') {
    const date = new Date(dto.date);
    date.setUTCHours(0, 0, 0, 0);

    this.ensureSameDay(date, userRole);

    const term = await this.getTermForDate(date);
    if (!term) {
      throw new ForbiddenException(
        'Attendance cannot be marked — no active term covers this date. Please open a term first.',
      );
    }
    if (term.status === 'CLOSED') {
      throw new ForbiddenException(
        `Attendance cannot be modified — term "${term.name}" is closed`,
      );
    }

    return this.prisma.attendance.upsert({
      where: {
        studentId_date: {
          studentId: dto.studentId,
          date,
        },
      },
      create: {
        studentId: dto.studentId,
        classId: dto.classId,
        date,
        status: dto.status,
        markedBy: markedById,
        notes: dto.notes,
        termId: term.id,
      },
      update: {
        status: dto.status,
        markedBy: markedById,
        notes: dto.notes,
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, studentId: true },
        },
      },
    });
  }

  async markBulk(dto: BulkAttendanceDto, markedById: string, user: any) {
    // Teachers can only mark attendance for their own class
    if (user.role === 'TEACHER') {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId: user.id },
      });
      if (!teacher || teacher.classId !== dto.classId) {
        throw new ForbiddenException('You can only mark attendance for your own class');
      }
    }

    const date = new Date(dto.date);
    date.setUTCHours(0, 0, 0, 0);

    // Block editing for past days (only same-day allowed for non-head)
    this.ensureSameDay(date, user.role);

    const term = await this.getTermForDate(date);
    if (!term) {
      throw new ForbiddenException(
        'Attendance cannot be marked — no active term covers this date. Please open a term first.',
      );
    }
    if (term.status === 'CLOSED') {
      throw new ForbiddenException(
        `Attendance cannot be modified — term "${term.name}" is closed`,
      );
    }

    // Check if this day's attendance is already closed for this class
    const closure = await this.prisma.dailyAttendanceClosure.findUnique({
      where: { classId_date: { classId: dto.classId, date } },
    });
    if (closure && user.role !== 'HEADMISTRESS') {
      throw new ForbiddenException(
        'Attendance for this day has been closed. Only the headmistress can modify it.',
      );
    }

    const results = await Promise.all(
      dto.records.map((r) =>
        this.prisma.attendance.upsert({
          where: {
            studentId_date: { studentId: r.studentId, date },
          },
          create: {
            studentId: r.studentId,
            classId: dto.classId,
            date,
            status: r.status,
            markedBy: markedById,
            notes: r.notes,
            termId: term.id,
          },
          update: {
            status: r.status,
            markedBy: markedById,
            notes: r.notes,
          },
        }),
      ),
    );

    return { marked: results.length, classId: dto.classId, date: dto.date };
  }

  /**
   * Close attendance for a class on a specific date.
   * Only available after 3 PM.
   */
  async closeAttendanceForDay(classId: string, dateStr: string, closedById: string, userRole: string) {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Allow closing for today only after 3 PM
    // Ghana timezone is GMT (UTC+0), so UTC hours match local time
    if (date.getTime() === today.getTime()) {
      const now = new Date();
      const currentHour = now.getUTCHours();
      // Headmistress can close at any time
      if (currentHour < 15 && userRole !== 'HEADMISTRESS') {
        throw new BadRequestException(
          'Attendance can only be closed after 3:00 PM',
        );
      }
    }

    // Check already closed
    const existing = await this.prisma.dailyAttendanceClosure.findUnique({
      where: { classId_date: { classId, date } },
    });
    if (existing) {
      throw new BadRequestException('Attendance for this day is already closed');
    }

    return this.prisma.dailyAttendanceClosure.create({
      data: { classId, date, closedBy: closedById },
    });
  }

  /**
   * Check closure status for a specific class and date
   */
  async getClosureStatus(classId: string, dateStr: string) {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);

    const closure = await this.prisma.dailyAttendanceClosure.findUnique({
      where: { classId_date: { classId, date } },
    });

    return { isClosed: !!closure, closure };
  }

  async getClassAttendance(classId: string, date: string) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);

    const students = await this.prisma.student.findMany({
      where: { classId, isArchived: false },
      select: { id: true, studentId: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const records = await this.prisma.attendance.findMany({
      where: { classId, date: d },
    });

    const recordMap = new Map(records.map((r) => [r.studentId, r]));

    // Check if the date falls in a closed term
    const term = await this.getTermForDate(d);
    const isTermClosed = term?.status === 'CLOSED';

    // Check if the date is in the past (day is over)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const isDayOver = d.getTime() < today.getTime();

    // Check daily closure
    const closure = await this.prisma.dailyAttendanceClosure.findUnique({
      where: { classId_date: { classId, date: d } },
    });
    const isDayClosed = !!closure;

    // Check for unclosed previous day
    const unclosedPrev = await this.getUnclosedPreviousDay(classId);

    return {
      records: students.map((s) => ({
        student: s,
        attendance: recordMap.get(s.id) || null,
      })),
      termId: term?.id || null,
      termName: term?.name || null,
      isTermClosed,
      isDayOver,
      isDayClosed,
      unclosedPreviousDay: unclosedPrev,
    };
  }

  async update(id: string, dto: UpdateAttendanceDto, updatedById: string, userRole = 'ADMIN') {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Attendance record not found');

    // Block editing if term is closed
    await this.ensureTermNotClosed(record.termId);

    // Block editing for past days
    this.ensureSameDay(record.date, userRole);

    return this.prisma.attendance.update({
      where: { id },
      data: {
        ...dto,
        markedBy: updatedById,
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, studentId: true },
        },
      },
    });
  }

  /**
   * Attendance dashboard — counts for day, week, and term
   * Optionally filtered by classId
   */
  async getDashboard(classId?: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Week start (Monday)
    const weekStart = new Date(today);
    const dayOfWeek = today.getUTCDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday=0
    weekStart.setUTCDate(today.getUTCDate() - diff);

    // Active term
    const activeTerm = await this.prisma.term.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      include: {
        termDays: { orderBy: { date: 'asc' } },
      },
    });

    const baseWhere: any = {};
    if (classId) baseWhere.classId = classId;

    // Day counts
    const dayRecords = await this.prisma.attendance.findMany({
      where: { ...baseWhere, date: today },
      select: { status: true },
    });

    // Week counts
    const weekRecords = await this.prisma.attendance.findMany({
      where: {
        ...baseWhere,
        date: { gte: weekStart, lte: today },
      },
      select: { status: true },
    });

    // Term counts
    const termRecords = activeTerm
      ? await this.prisma.attendance.findMany({
          where: {
            ...baseWhere,
            termId: activeTerm.id,
          },
          select: { status: true },
        })
      : [];

    const countStatuses = (records: { status: string }[]) => ({
      present: records.filter((r) => r.status === 'PRESENT').length,
      absent: records.filter((r) => r.status === 'ABSENT').length,
      late: records.filter((r) => r.status === 'LATE').length,
      total: records.length,
    });

    // Total students for the context
    const studentWhere: any = { isArchived: false };
    if (classId) studentWhere.classId = classId;
    const totalStudents = await this.prisma.student.count({ where: studentWhere });

    // Term calendar/progress info
    let termProgress = null;
    if (activeTerm) {
      const schoolDays = activeTerm.termDays.filter((d) => !d.isHoliday);
      const daysCrossed = schoolDays.filter((d) => new Date(d.date) <= today);
      const daysRemaining = schoolDays.filter((d) => new Date(d.date) > today);
      const holidays = activeTerm.termDays.filter((d) => d.isHoliday);

      const durationMs = new Date(activeTerm.endDate).getTime() - new Date(activeTerm.startDate).getTime();
      const durationDays = Math.ceil(durationMs / AttendanceService.MS_PER_DAY) + 1;

      const termStatusCounts = countStatuses(termRecords);
      const presentAndLate = termStatusCounts.present + termStatusCounts.late;
      const overallPercent = termStatusCounts.total > 0 ? Math.round((presentAndLate / termStatusCounts.total) * 100) : 0;

      termProgress = {
        durationDays,
        totalSchoolDays: schoolDays.length,
        totalHolidays: holidays.length,
        daysCrossed: daysCrossed.length,
        daysRemaining: daysRemaining.length,
        overallAttendancePercent: overallPercent,
      };
    }

    return {
      today: countStatuses(dayRecords),
      week: countStatuses(weekRecords),
      term: countStatuses(termRecords),
      totalStudents,
      activeTerm: activeTerm
        ? {
            id: activeTerm.id,
            name: activeTerm.name,
            startDate: activeTerm.startDate,
            endDate: activeTerm.endDate,
          }
        : null,
      termProgress,
    };
  }

  /**
   * Get student detail lists filtered by scope (day/week/term) and status
   */
  async getDashboardDetails(
    scope: 'day' | 'week' | 'term',
    status: 'PRESENT' | 'ABSENT' | 'LATE',
    classId?: string,
  ) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const where: any = { status };
    if (classId) where.classId = classId;

    if (scope === 'day') {
      where.date = today;
    } else if (scope === 'week') {
      const weekStart = new Date(today);
      const dayOfWeek = today.getUTCDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStart.setUTCDate(today.getUTCDate() - diff);
      where.date = { gte: weekStart, lte: today };
    } else if (scope === 'term') {
      const activeTerm = await this.prisma.term.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
      });
      if (activeTerm) {
        where.termId = activeTerm.id;
      } else {
        return { students: [], scope, status };
      }
    }

    const records = await this.prisma.attendance.findMany({
      where,
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
      },
      orderBy: { date: 'desc' },
    });

    // Group by student for week/term scopes (may have multiple entries)
    if (scope === 'day') {
      return {
        scope,
        status,
        students: records.map((r) => ({
          id: r.student.id,
          studentId: r.student.studentId,
          firstName: r.student.firstName,
          lastName: r.student.lastName,
          className: r.student.class?.name || '—',
          date: r.date,
          notes: r.notes,
        })),
      };
    }

    // For week/term, group by student and count occurrences
    const studentMap: Record<
      string,
      {
        id: string;
        studentId: string;
        firstName: string;
        lastName: string;
        className: string;
        count: number;
        dates: Date[];
      }
    > = {};

    for (const r of records) {
      const sid = r.student.id;
      if (!studentMap[sid]) {
        studentMap[sid] = {
          id: r.student.id,
          studentId: r.student.studentId,
          firstName: r.student.firstName,
          lastName: r.student.lastName,
          className: r.student.class?.name || '—',
          count: 0,
          dates: [],
        };
      }
      studentMap[sid].count += 1;
      studentMap[sid].dates.push(r.date);
    }

    return {
      scope,
      status,
      students: Object.values(studentMap).sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Generate attendance report for a specific class within the active term
   */
  async getClassReport(classId: string, termId?: string) {
    // Resolve term
    let term;
    if (termId) {
      term = await this.prisma.term.findUnique({
        where: { id: termId },
        include: { termDays: true },
      });
    } else {
      term = await this.prisma.term.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
        include: { termDays: true },
      });
    }

    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const students = await this.prisma.student.findMany({
      where: { classId, isArchived: false },
      select: { id: true, studentId: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const attWhere: any = { classId };
    if (term) attWhere.termId = term.id;

    const records = await this.prisma.attendance.findMany({
      where: attWhere,
      select: { studentId: true, status: true, date: true },
    });

    const totalSchoolDays = term ? term.termDays.filter((d) => !d.isHoliday).length : 0;

    // Build per-student stats
    const studentStats = students.map((s) => {
      const studentRecords = records.filter((r) => r.studentId === s.id);
      const present = studentRecords.filter((r) => r.status === 'PRESENT').length;
      const absent = studentRecords.filter((r) => r.status === 'ABSENT').length;
      const late = studentRecords.filter((r) => r.status === 'LATE').length;
      const total = studentRecords.length;

      return {
        student: {
          id: s.id,
          studentId: s.studentId,
          firstName: s.firstName,
          lastName: s.lastName,
        },
        present,
        absent,
        late,
        total,
        attendancePercent: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      };
    });

    return {
      class: cls,
      term: term
        ? {
            id: term.id,
            name: term.name,
            startDate: term.startDate,
            endDate: term.endDate,
            status: term.status,
          }
        : null,
      totalSchoolDays,
      totalRecords: records.length,
      students: studentStats,
    };
  }
}
