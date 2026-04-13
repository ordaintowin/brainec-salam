import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto, UpdateStudentDto } from './dto/student.dto';
import { CloudinaryService } from '../common/services/cloudinary.service';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  private async generateStudentId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BS-${year}-`;

    const last = await this.prisma.student.findFirst({
      where: { studentId: { startsWith: prefix } },
      orderBy: { studentId: 'desc' },
    });

    let next = 1;
    if (last) {
      const parts = last.studentId.split('-');
      next = parseInt(parts[2], 10) + 1;
    }

    return `${prefix}${String(next).padStart(3, '0')}`;
  }

  async create(dto: CreateStudentDto) {
    const studentId = await this.generateStudentId();
    return this.prisma.student.create({
      data: {
        studentId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: new Date(dto.dateOfBirth),
        gender: dto.gender,
        classId: dto.classId,
        guardianName: dto.guardianName,
        guardianPhone: dto.guardianPhone,
        guardianEmail: dto.guardianEmail,
        guardianAddress: dto.guardianAddress,
      },
      include: { class: true },
    });
  }

  async findAll(page = 1, limit = 10, q?: string) {
    const skip = (page - 1) * limit;
    const where: any = { isArchived: false };

    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { studentId: { contains: q, mode: 'insensitive' } },
        { guardianName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          class: { select: { id: true, name: true } },
        },
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        class: true,
        feeInvoices: {
          include: { feeOrder: true },
          orderBy: { createdAt: 'desc' },
        },
        attendances: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.dateOfBirth) data.dateOfBirth = new Date(dto.dateOfBirth);
    return this.prisma.student.update({
      where: { id },
      data,
      include: { class: true },
    });
  }

  async archive(id: string, archiveReason: string, archivedBy: string) {
    await this.findOne(id);
    return this.prisma.student.update({
      where: { id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy,
        archiveReason,
      },
    });
  }

  async findAllArchived(page = 1, limit = 20) {
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

  async restore(id: string) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException('Student not found');
    return this.prisma.student.update({
      where: { id },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
      include: { class: { select: { id: true, name: true } } },
    });
  }

  async uploadPhoto(id: string, file: Express.Multer.File) {
    await this.findOne(id);
    const result = await this.cloudinary.uploadBuffer(file.buffer, 'students');
    return this.prisma.student.update({
      where: { id },
      data: { photoUrl: result.secure_url },
      select: { id: true, photoUrl: true },
    });
  }

  /**
   * Count weekdays (Mon-Fri) between two dates inclusive.
   */
  private countWeekdays(start: Date, end: Date): number {
    let count = 0;
    const current = new Date(start);
    current.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setUTCHours(0, 0, 0, 0);

    while (current <= endDate) {
      const day = current.getUTCDay();
      if (day >= 1 && day <= 5) count++;
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return count;
  }

  /**
   * Get attendance history summary per term for a student.
   * Returns each term with total school days and present/absent/late counts.
   */
  async getAttendanceHistory(studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');

    // Get all terms ordered by most recent first
    const terms = await this.prisma.term.findMany({
      orderBy: { startDate: 'desc' },
    });

    // Get all attendance records for this student
    const attendances = await this.prisma.attendance.findMany({
      where: { studentId },
      select: { termId: true, status: true },
    });

    // Build a map of termId -> counts
    const termCounts: Record<string, { present: number; absent: number; late: number }> = {};
    for (const att of attendances) {
      const tid = att.termId || '__no_term__';
      if (!termCounts[tid]) termCounts[tid] = { present: 0, absent: 0, late: 0 };
      if (att.status === 'PRESENT') termCounts[tid].present++;
      else if (att.status === 'ABSENT') termCounts[tid].absent++;
      else if (att.status === 'LATE') termCounts[tid].late++;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const result = terms.map((term) => {
      const counts = termCounts[term.id] || { present: 0, absent: 0, late: 0 };
      const endForCount = term.status === 'CLOSED' || term.endDate <= today ? term.endDate : today;
      const totalSchoolDays = this.countWeekdays(term.startDate, endForCount);
      const totalMarked = counts.present + counts.absent + counts.late;

      return {
        termId: term.id,
        termName: term.name,
        status: term.status,
        startDate: term.startDate,
        endDate: term.endDate,
        totalSchoolDays,
        present: counts.present,
        absent: counts.absent,
        late: counts.late,
        totalMarked,
        attendancePercent: totalMarked > 0 ? Math.round(((counts.present + counts.late) / totalMarked) * 100) : 0,
      };
    });

    return result;
  }

  /**
   * Get paginated attendance detail for a student in a specific term,
   * optionally filtered by status.
   */
  async getAttendanceDetail(
    studentId: string,
    termId: string,
    status?: string,
    page = 1,
    limit = 10,
  ) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');

    const where: any = { studentId, termId };
    if (status) where.status = status;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          status: true,
          notes: true,
        },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
