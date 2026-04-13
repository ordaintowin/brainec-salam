import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import {
  MarkAttendanceDto,
  BulkAttendanceDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  mark(@Body() dto: MarkAttendanceDto, @CurrentUser() user: any) {
    return this.attendanceService.markAttendance(dto, user.id, user.role);
  }

  @Post('bulk')
  markBulk(@Body() dto: BulkAttendanceDto, @CurrentUser() user: any) {
    return this.attendanceService.markBulk(dto, user.id, user);
  }

  @Get()
  getClassAttendance(
    @Query('classId') classId: string,
    @Query('date') date: string,
  ) {
    return this.attendanceService.getClassAttendance(classId, date);
  }

  @Get('dashboard')
  getDashboard(@Query('classId') classId?: string) {
    return this.attendanceService.getDashboard(classId);
  }

  @Get('dashboard/details')
  getDashboardDetails(
    @Query('scope') scope: 'day' | 'week' | 'term',
    @Query('status') status: 'PRESENT' | 'ABSENT' | 'LATE',
    @Query('classId') classId?: string,
  ) {
    return this.attendanceService.getDashboardDetails(scope, status, classId);
  }

  @Get('report/class/:classId')
  getClassReport(
    @Param('classId') classId: string,
    @Query('termId') termId?: string,
  ) {
    return this.attendanceService.getClassReport(classId, termId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() user: any,
  ) {
    return this.attendanceService.update(id, dto, user.id, user.role);
  }
}
