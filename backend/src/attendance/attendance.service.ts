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

  async markAttendance(dto: MarkAttendanceDto, markedById: string) {
    const date = new Date(dto.date);
    date.setUTCHours(0, 0, 0, 0);

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

    return students.map((s) => ({
      student: s,
      attendance: recordMap.get(s.id) || null,
    }));
  }

  async update(id: string, dto: UpdateAttendanceDto, updatedById: string) {
    const record = await this.prisma.attendance.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Attendance record not found');

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
