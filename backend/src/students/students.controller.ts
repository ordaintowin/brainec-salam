import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StudentsService } from './students.service';
import {
  CreateStudentDto,
  UpdateStudentDto,
  ArchiveStudentDto,
} from './dto/student.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('q') q?: string,
  ) {
    return this.studentsService.findAll(page, limit, q);
  }

  @Get('archived')
  findAllArchived(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.studentsService.findAllArchived(page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  archive(
    @Param('id') id: string,
    @Body() dto: ArchiveStudentDto,
    @CurrentUser() user: any,
  ) {
    return this.studentsService.archive(id, dto.archiveReason, user.id);
  }

  @Post(':id/photo')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('photo', { storage: memoryStorage() }),
  )
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.studentsService.uploadPhoto(id, file);
  }

  @Post(':id/restore')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  restore(@Param('id') id: string) {
    return this.studentsService.restore(id);
  }
}
