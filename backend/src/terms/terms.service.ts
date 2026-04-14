import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTermDto, UpdateTermDto } from './dto/terms.dto';

@Injectable()
export class TermsService {
  constructor(private prisma: PrismaService) {}

  private static readonly MS_PER_DAY = 86_400_000;

  /**
   * Compute weekday dates (Mon-Fri) between start and end (inclusive).
   */
  private getWeekdays(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    const startMs = new Date(start).setUTCHours(0, 0, 0, 0);
    const endMs = new Date(end).setUTCHours(0, 0, 0, 0);
    for (let ms = startMs; ms <= endMs; ms += TermsService.MS_PER_DAY) {
      const d = new Date(ms);
      const day = d.getUTCDay();
      if (day >= 1 && day <= 5) {
        days.push(d);
      }
    }
    return days;
  }

  async create(dto: CreateTermDto, createdById: string) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (end <= start) {
      throw new BadRequestException('End date must be after start date');
    }

    // Must close any existing ACTIVE terms before creating a new one
    const activeTerms = await this.prisma.term.findMany({
      where: { status: 'ACTIVE' },
    });

    if (activeTerms.length > 0) {
      throw new BadRequestException(
        `Please close the active term "${activeTerms[0].name}" before creating a new one`,
      );
    }

    // Check for overlapping active terms
    const overlap = await this.prisma.term.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ startDate: { lte: end }, endDate: { gte: start } }],
      },
    });

    if (overlap) {
      throw new BadRequestException(
        `Overlaps with existing active term "${overlap.name}"`,
      );
    }

    const term = await this.prisma.term.create({
      data: {
        name: dto.name,
        startDate: start,
        endDate: end,
        createdById,
      },
    });

    // Auto-generate TermDay records for all weekdays in the range
    const weekdays = this.getWeekdays(start, end);
    if (weekdays.length > 0) {
      await this.prisma.termDay.createMany({
        data: weekdays.map((date) => ({
          termId: term.id,
          date,
          isHoliday: false,
        })),
      });
    }

    return this.findOne(term.id);
  }

  async findAll() {
    return this.prisma.term.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        _count: { select: { termDays: true } },
      },
    });
  }

  async findActive() {
    return this.prisma.term.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      include: {
        termDays: { orderBy: { date: 'asc' } },
        _count: { select: { termDays: true, attendances: true } },
      },
    });
  }

  async findOne(id: string) {
    const term = await this.prisma.term.findUnique({
      where: { id },
      include: {
        termDays: { orderBy: { date: 'asc' } },
        _count: { select: { termDays: true, attendances: true } },
      },
    });
    if (!term) throw new NotFoundException('Term not found');
    return term;
  }

  async update(id: string, dto: UpdateTermDto) {
    const term = await this.prisma.term.findUnique({ where: { id } });
    if (!term) throw new NotFoundException('Term not found');
    if (term.status === 'CLOSED') {
      throw new BadRequestException('Cannot update a closed term');
    }

    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);

    return this.prisma.term.update({ where: { id }, data });
  }

  async close(id: string, closedById: string) {
    const term = await this.prisma.term.findUnique({ where: { id } });
    if (!term) throw new NotFoundException('Term not found');
    if (term.status === 'CLOSED') {
      throw new BadRequestException('Term is already closed');
    }

    // Prevent closing a term before its end date
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(term.endDate);
    endDate.setUTCHours(0, 0, 0, 0);
    if (endDate.getTime() > now.getTime()) {
      throw new BadRequestException(
        `Cannot close this term yet — the term end date (${endDate.toISOString().split('T')[0]}) has not passed`,
      );
    }

    return this.prisma.term.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedById,
        closedAt: new Date(),
      },
    });
  }

  /**
   * Toggle a term day as holiday or school day
   */
  async toggleHoliday(termDayId: string, isHoliday: boolean, label?: string) {
    const termDay = await this.prisma.termDay.findUnique({ where: { id: termDayId } });
    if (!termDay) throw new NotFoundException('Term day not found');

    // Ensure the term is still active
    const term = await this.prisma.term.findUnique({ where: { id: termDay.termId } });
    if (term && term.status === 'CLOSED') {
      throw new BadRequestException('Cannot modify a closed term');
    }

    return this.prisma.termDay.update({
      where: { id: termDayId },
      data: { isHoliday, label: label || null },
    });
  }

  /**
   * Get enhanced term info with calendar, progress, and per-class breakdown
   */
  async getTermDashboard(termId: string) {
    const term = await this.findOne(termId);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const schoolDays = term.termDays.filter((d) => !d.isHoliday);
    const holidays = term.termDays.filter((d) => d.isHoliday);
    const daysCrossed = schoolDays.filter((d) => new Date(d.date) <= today);
    const daysRemaining = schoolDays.filter((d) => new Date(d.date) > today);

    // Get total students
    const totalStudents = await this.prisma.student.count({ where: { isArchived: false } });

    // Get attendance records for this term
    const attendanceRecords = await this.prisma.attendance.findMany({
      where: { termId },
      select: { status: true, classId: true },
    });

    const presentCount = attendanceRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const totalRecords = attendanceRecords.length;
    const overallPercent = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

    // Per-class breakdown
    const classes = await this.prisma.class.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const classCounts = await Promise.all(
      classes.map(async (cls) => {
        const studentCount = await this.prisma.student.count({
          where: { classId: cls.id, isArchived: false },
        });
        const classRecords = attendanceRecords.filter((r) => r.classId === cls.id);
        const classPresent = classRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
        const classTotal = classRecords.length;
        return {
          classId: cls.id,
          className: cls.name,
          studentCount,
          totalRecords: classTotal,
          presentCount: classPresent,
          attendancePercent: classTotal > 0 ? Math.round((classPresent / classTotal) * 100) : 0,
        };
      }),
    );

    // Duration in days (calendar days)
    const durationMs = new Date(term.endDate).getTime() - new Date(term.startDate).getTime();
    const durationDays = Math.ceil(durationMs / TermsService.MS_PER_DAY) + 1;

    return {
      term: {
        id: term.id,
        name: term.name,
        startDate: term.startDate,
        endDate: term.endDate,
        status: term.status,
      },
      durationDays,
      totalSchoolDays: schoolDays.length,
      totalHolidays: holidays.length,
      daysCrossed: daysCrossed.length,
      daysRemaining: daysRemaining.length,
      overallAttendancePercent: overallPercent,
      totalStudents,
      calendar: term.termDays.map((d) => ({
        id: d.id,
        date: d.date,
        isHoliday: d.isHoliday,
        label: d.label,
        isCrossed: new Date(d.date) <= today,
      })),
      perClassBreakdown: classCounts,
    };
  }

  async getTermReport(termId: string) {
    const term = await this.findOne(termId);

    const attendances = await this.prisma.attendance.findMany({
      where: { termId },
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
    });

    // Group by student
    const studentMap: Record<
      string,
      {
        student: {
          id: string;
          studentId: string;
          firstName: string;
          lastName: string;
          className: string;
        };
        present: number;
        absent: number;
        late: number;
        total: number;
      }
    > = {};

    for (const att of attendances) {
      const sid = att.studentId;
      if (!studentMap[sid]) {
        studentMap[sid] = {
          student: {
            id: att.student.id,
            studentId: att.student.studentId,
            firstName: att.student.firstName,
            lastName: att.student.lastName,
            className: att.student.class?.name || '—',
          },
          present: 0,
          absent: 0,
          late: 0,
          total: 0,
        };
      }
      studentMap[sid].total += 1;
      if (att.status === 'PRESENT') studentMap[sid].present += 1;
      else if (att.status === 'ABSENT') studentMap[sid].absent += 1;
      else if (att.status === 'LATE') studentMap[sid].late += 1;
    }

    const schoolDays = term.termDays.filter((d) => !d.isHoliday).length;

    return {
      term: {
        id: term.id,
        name: term.name,
        startDate: term.startDate,
        endDate: term.endDate,
        status: term.status,
      },
      totalSchoolDays: schoolDays,
      totalRecords: attendances.length,
      students: Object.values(studentMap).map((s) => ({
        ...s,
        attendancePercent:
          s.total > 0
            ? Math.round(((s.present + s.late) / s.total) * 100)
            : 0,
      })),
    };
  }
}
