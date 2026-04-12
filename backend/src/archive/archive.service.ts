import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}
