import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';
import { CloudinaryService } from '../common/services/cloudinary.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  private async generateEmployeeId(): Promise<string> {
    const last = await this.prisma.teacher.findFirst({
      where: { employeeId: { startsWith: 'BST-' } },
      orderBy: { employeeId: 'desc' },
    });

    let next = 1;
    if (last) {
      const num = parseInt(last.employeeId.split('-')[1], 10);
      next = num + 1;
    }
    return `BST-${String(next).padStart(3, '0')}`;
  }

  async create(dto: CreateTeacherDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const employeeId = await this.generateEmployeeId();
    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashed,
        role: 'TEACHER',
      },
    });

    const teacher = await this.prisma.teacher.create({
      data: {
        userId: user.id,
        employeeId,
        classId: dto.classId || null,
        phone: dto.phone,
        address: dto.address,
        qualification: dto.qualification,
        joinDate: new Date(dto.joinDate),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            photoUrl: true,
            isActive: true,
          },
        },
        class: true,
      },
    });

    return teacher;
  }

  async findAll(page = 1, limit = 10, q?: string) {
    const skip = (page - 1) * limit;
    const where: any = { isArchived: false };

    if (q) {
      where.OR = [
        { employeeId: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.teacher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              photoUrl: true,
              isActive: true,
            },
          },
          class: { select: { id: true, name: true } },
        },
      }),
      this.prisma.teacher.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            photoUrl: true,
            isActive: true,
            createdAt: true,
          },
        },
        class: true,
      },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    return teacher;
  }

  async update(id: string, dto: UpdateTeacherDto) {
    const teacher = await this.findOne(id);

    const teacherData: any = {};
    const userData: any = {};

    if (dto.classId !== undefined) teacherData.classId = dto.classId;
    if (dto.phone !== undefined) teacherData.phone = dto.phone;
    if (dto.address !== undefined) teacherData.address = dto.address;
    if (dto.qualification !== undefined) teacherData.qualification = dto.qualification;
    if (dto.joinDate !== undefined) teacherData.joinDate = new Date(dto.joinDate);

    if (dto.name !== undefined) userData.name = dto.name;
    if (dto.email !== undefined) userData.email = dto.email;
    if (dto.password !== undefined) userData.password = await bcrypt.hash(dto.password, 10);

    if (Object.keys(userData).length > 0) {
      await this.prisma.user.update({
        where: { id: teacher.userId },
        data: userData,
      });
    }

    return this.prisma.teacher.update({
      where: { id },
      data: teacherData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            photoUrl: true,
            isActive: true,
          },
        },
        class: true,
      },
    });
  }

  async archive(id: string, archiveReason: string, archivedBy: string) {
    await this.findOne(id);
    return this.prisma.teacher.update({
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
    const teacher = await this.findOne(id);
    const result = await this.cloudinary.uploadBuffer(file.buffer, 'teachers');
    const photoUrl = result.secure_url;

    await Promise.all([
      this.prisma.teacher.update({ where: { id }, data: { photoUrl } }),
      this.prisma.user.update({
        where: { id: teacher.userId },
        data: { photoUrl },
      }),
    ]);

    return { id, photoUrl };
  }
}
