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

  async create(dto: CreateTermDto, createdById: string) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (end <= start) {
      throw new BadRequestException('End date must be after start date');
    }

    // Check for overlapping active terms
    const overlap = await this.prisma.term.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
    });

    if (overlap) {
      throw new BadRequestException(
        `Overlaps with existing active term "${overlap.name}"`,
      );
    }

    return this.prisma.term.create({
      data: {
        name: dto.name,
        startDate: start,
        endDate: end,
        createdById,
      },
    });
  }

  async findAll() {
    return this.prisma.term.findMany({
      orderBy: { startDate: 'desc' },
    });
  }

  async findActive() {
    return this.prisma.term.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const term = await this.prisma.term.findUnique({ where: { id } });
    if (!term) throw new NotFoundException('Term not found');
    return term;
  }

  async update(id: string, dto: UpdateTermDto) {
    const term = await this.findOne(id);
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
    const term = await this.findOne(id);
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

    return {
      term,
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
