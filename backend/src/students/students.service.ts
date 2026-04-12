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

  async uploadPhoto(id: string, file: Express.Multer.File) {
    await this.findOne(id);
    const result = await this.cloudinary.uploadBuffer(file.buffer, 'students');
    return this.prisma.student.update({
      where: { id },
      data: { photoUrl: result.secure_url },
      select: { id: true, photoUrl: true },
    });
  }
}
