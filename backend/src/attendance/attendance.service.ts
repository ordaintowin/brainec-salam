import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MarkAttendanceDto,
  BulkAttendanceDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

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

  async markAttendance(dto: MarkAttendanceDto, markedById: string) {
    const date = new Date(dto.date);
    date.setUTCHours(0, 0, 0, 0);

    const term = await this.getTermForDate(date);
    if (term && term.status === 'CLOSED') {
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
        termId: term?.id || null,
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

    const term = await this.getTermForDate(date);
    if (term && term.status === 'CLOSED') {
      throw new ForbiddenException(
        `Attendance cannot be modified — term "${term.name}" is closed`,
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
            termId: term?.id || null,
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

    return {
      records: students.map((s) => ({
        student: s,
        attendance: recordMap.get(s.id) || null,
      })),
      termId: term?.id || null,
      termName: term?.name || null,
      isTermClosed,
    };
  }

  async update(id: string, dto: UpdateAttendanceDto, updatedById: string) {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Attendance record not found');

    // Block editing if term is closed
    await this.ensureTermNotClosed(record.termId);

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
}
