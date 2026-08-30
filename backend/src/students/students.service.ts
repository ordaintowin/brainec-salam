import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto, UpdateStudentDto } from './dto/student.dto';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { FLOAT_EPSILON, getInvoiceLedger } from '../finance/invoice-ledger';
import { FinanceReconciliationService } from '../finance/finance-reconciliation.service';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private reconciliation: FinanceReconciliationService,
  ) {}

  private async generateStudentId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BAC-${year}-`;

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
        secondaryGuardianName: dto.secondaryGuardianName,
        secondaryGuardianPhone: dto.secondaryGuardianPhone,
      },
      include: { class: true },
    });
  }

  async findAll(page = 1, limit = 10, q?: string, classId?: string) {
    const skip = (page - 1) * limit;
    const where: any = { isArchived: false };

    if (classId) {
      where.classId = classId;
    }

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

  async findOne(id: string, teacherClassId?: string) {
    await this.reconciliation.reconcile();
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        class: true,
        feeInvoices: {
          where: {
            debtCancelledAt: null,
          },
          include: { feeOrder: true, payments: true },
          orderBy: { createdAt: 'desc' },
        },
        attendances: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (teacherClassId && student.classId !== teacherClassId) {
      throw new ForbiddenException('You can only view students from your assigned class');
    }
    return {
      ...student,
      feeInvoices: student.feeInvoices
        .map((invoice) => {
          const ledger = getInvoiceLedger(invoice);
          return {
            ...invoice,
            amountPaid: ledger.amountPaid,
            balance: ledger.balance,
            status: ledger.status,
          };
        })
        .filter((invoice) => invoice.balance > FLOAT_EPSILON),
    };
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
    const result = await this.prisma.$transaction(async (tx) => {
      // Retain outstanding invoices for the student's profile, but mark them
      // as archived debt so they do not return to school-wide finance reports
      // if the student is restored.
      const outstandingInvoices = await tx.feeInvoice.findMany({
        where: {
          studentId: id,
          debtCancelledAt: null,
        },
        select: {
          id: true,
          amountDue: true,
          amountPaid: true,
          balance: true,
          dueDate: true,
          payments: { select: { amount: true } },
        },
      });

      const outstandingInvoiceIds = outstandingInvoices
        .filter((invoice) => getInvoiceLedger(invoice).balance > FLOAT_EPSILON)
        .map((invoice) => invoice.id);

      if (outstandingInvoiceIds.length > 0) {
        await tx.feeInvoice.updateMany({
          where: { id: { in: outstandingInvoiceIds } },
          data: { isArchivedDebt: true },
        });
      }

      const student = await tx.student.update({
        where: { id },
        data: {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy,
          archiveReason,
        },
      });

      return {
        ...student,
        archivedDebtInvoices: outstandingInvoiceIds.length,
      };
    });

    // Removing a student disconnects their invoices from fee-order progress.
    // Reconcile affected orders immediately so an order with no remaining
    // active invoices can move to the archive without waiting for another
    // payment.
    const affectedFeeOrders = await this.prisma.feeInvoice.findMany({
      where: { studentId: id },
      select: { feeOrderId: true },
      distinct: ['feeOrderId'],
    });

    for (const { feeOrderId } of affectedFeeOrders) {
      const activeInvoices = await this.prisma.feeInvoice.findMany({
        where: {
          feeOrderId,
          student: { isArchived: false },
          debtCancelledAt: null,
        },
        select: {
          amountDue: true,
          amountPaid: true,
          balance: true,
          dueDate: true,
          payments: { select: { amount: true } },
        },
      });

      const hasOutstandingActiveInvoice = activeInvoices.some(
        (invoice) => getInvoiceLedger(invoice).balance > FLOAT_EPSILON,
      );

      if (!hasOutstandingActiveInvoice) {
        await this.prisma.feeOrder.update({
          where: { id: feeOrderId },
          data: { isArchived: true, archivedAt: new Date() } as any,
        });
      }
    }

    return result;
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
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { studentId: id, debtCancelledAt: null },
      select: {
        id: true,
        amountDue: true,
        amountPaid: true,
        balance: true,
        dueDate: true,
        payments: { select: { amount: true } },
      },
    });
    const outstandingInvoiceIds = invoices
      .filter((invoice) => getInvoiceLedger(invoice).balance > FLOAT_EPSILON)
      .map((invoice) => invoice.id);

    if (outstandingInvoiceIds.length > 0) {
      await this.prisma.feeInvoice.updateMany({
        where: { id: { in: outstandingInvoiceIds } },
        data: { isArchivedDebt: true },
      });
    }
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
   * Uses millisecond-based day stepping to avoid any Date mutation edge cases.
   */
  private static readonly MS_PER_DAY = 86_400_000;

  private countWeekdays(start: Date, end: Date): number {
    let count = 0;
    const startMs = new Date(start).setUTCHours(0, 0, 0, 0);
    const endMs = new Date(end).setUTCHours(0, 0, 0, 0);

    for (let ms = startMs; ms <= endMs; ms += StudentsService.MS_PER_DAY) {
      const day = new Date(ms).getUTCDay();
      if (day >= 1 && day <= 5) count++;
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

    // Get all terms ordered by most recent first, with their TermDays (including date for crossed/remaining calc)
    const terms = await this.prisma.term.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        termDays: { select: { isHoliday: true, date: true } },
      },
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

      let totalSchoolDays: number;
      let daysCrossed: number;
      let daysRemaining: number;

      if (term.termDays && term.termDays.length > 0) {
        // Use TermDay records — respects manually configured holidays
        const schoolDayDates = term.termDays.filter((d) => !d.isHoliday);
        totalSchoolDays = schoolDayDates.length;
        daysCrossed = schoolDayDates.filter((d) => new Date(d.date) <= today).length;
        daysRemaining = schoolDayDates.filter((d) => new Date(d.date) > today).length;
      } else {
        // Fallback: count Mon–Fri weekdays across the FULL term (not just up to today)
        const termEnd = new Date(term.endDate);
        termEnd.setUTCHours(0, 0, 0, 0);
        const endForCrossed = today <= termEnd ? today : termEnd;
        const tomorrow = new Date(today.getTime() + StudentsService.MS_PER_DAY);
        totalSchoolDays = this.countWeekdays(term.startDate, term.endDate);
        daysCrossed = this.countWeekdays(term.startDate, endForCrossed);
        daysRemaining = today < termEnd ? this.countWeekdays(tomorrow, term.endDate) : 0;
      }

      const totalMarked = counts.present + counts.absent + counts.late;

      return {
        termId: term.id,
        termName: term.name,
        status: term.status,
        startDate: term.startDate,
        endDate: term.endDate,
        totalSchoolDays,
        daysCrossed,
        daysRemaining,
        present: counts.present,
        absent: counts.absent,
        late: counts.late,
        totalMarked,
        // Late counts toward attendance (same business rule used across the app)
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
