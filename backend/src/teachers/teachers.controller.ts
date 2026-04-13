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
import { TeachersService } from './teachers.service';
import {
  CreateTeacherDto,
  UpdateTeacherDto,
  ArchiveTeacherDto,
} from './dto/teacher.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Post()
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  create(@Body() dto: CreateTeacherDto) {
    return this.teachersService.create(dto);
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('q') q?: string,
  ) {
    return this.teachersService.findAll(page, limit, q);
  }

  @Get('archived')
  findAllArchived(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.teachersService.findAllArchived(page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teachersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    return this.teachersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  archive(
    @Param('id') id: string,
    @Body() dto: ArchiveTeacherDto,
    @CurrentUser() user: any,
  ) {
    return this.teachersService.archive(id, dto.archiveReason, user.id);
  }

  @Post(':id/photo')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage() }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.teachersService.uploadPhoto(id, file);
  }

  @Post(':id/restore')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  restore(@Param('id') id: string) {
    return this.teachersService.restore(id);
  }
}
