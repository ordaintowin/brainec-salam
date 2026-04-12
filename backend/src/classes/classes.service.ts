import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto, UpdateClassDto } from './dto/class.dto';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateClassDto) {
    const existing = await this.prisma.class.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Class name already exists');

    return this.prisma.class.create({
      data: dto,
    });
  }

  async findAll() {
    const classes = await this.prisma.class.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            students: { where: { isArchived: false } },
            teachers: { where: { isArchived: false } },
          },
        },
      },
    });

    return classes.map((c) => ({
      ...c,
      studentCount: c._count.students,
      teacherCount: c._count.teachers,
    }));
  }

  async findOne(id: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id },
      include: {
        teachers: {
          where: { isArchived: false },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                photoUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            students: { where: { isArchived: false } },
          },
        },
      },
    });
    if (!cls) throw new NotFoundException('Class not found');
    return { ...cls, studentCount: cls._count.students };
  }

  async getClassStudents(id: string, page = 1, limit = 10) {
    await this.findOne(id);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where: { classId: id, isArchived: false },
        skip,
        take: limit,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.student.count({ where: { classId: id, isArchived: false } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: string, dto: UpdateClassDto) {
    await this.findOne(id);
    return this.prisma.class.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Check no active students
    const studentCount = await this.prisma.student.count({
      where: { classId: id, isArchived: false },
    });
    if (studentCount > 0) {
      throw new ConflictException('Cannot delete a class with active students');
    }
    return this.prisma.class.delete({ where: { id } });
  }
}
