import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('archive')
@Roles(Role.HEADMISTRESS, Role.ADMIN)
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  @Get('students')
  getArchivedStudents(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.archiveService.getArchivedStudents(page, limit);
  }

  @Get('teachers')
  getArchivedTeachers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.archiveService.getArchivedTeachers(page, limit);
  }

  @Post('students/:id/restore')
  restoreStudent(@Param('id') id: string) {
    return this.archiveService.restoreStudent(id);
  }

  @Post('teachers/:id/restore')
  restoreTeacher(@Param('id') id: string) {
    return this.archiveService.restoreTeacher(id);
  }
}
