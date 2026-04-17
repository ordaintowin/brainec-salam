import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { TermsService } from './terms.service';
import { CreateTermDto, UpdateTermDto } from './dto/terms.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('terms')
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Post()
  @Roles(Role.HEADMISTRESS)
  create(@Body() dto: CreateTermDto, @CurrentUser() user: any) {
    return this.termsService.create(dto, user.id);
  }

  @Get()
  findAll() {
    return this.termsService.findAll();
  }

  @Get('active')
  findActive() {
    return this.termsService.findActive();
  }

  @Get('closed-summary')
  getClosedTermsSummary() {
    return this.termsService.getClosedTermsSummary();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.termsService.findOne(id);
  }

  @Get(':id/dashboard')
  getTermDashboard(@Param('id') id: string) {
    return this.termsService.getTermDashboard(id);
  }

  @Patch(':id')
  @Roles(Role.HEADMISTRESS)
  update(@Param('id') id: string, @Body() dto: UpdateTermDto) {
    return this.termsService.update(id, dto);
  }

  @Post(':id/close')
  @Roles(Role.HEADMISTRESS)
  close(@Param('id') id: string, @CurrentUser() user: any) {
    return this.termsService.close(id, user.id);
  }

  @Get(':id/report')
  getReport(@Param('id') id: string) {
    return this.termsService.getTermReport(id);
  }

  @Patch('days/:dayId/holiday')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  toggleHoliday(
    @Param('dayId') dayId: string,
    @Body() body: { isHoliday: boolean; label?: string },
  ) {
    return this.termsService.toggleHoliday(dayId, body.isHoliday, body.label);
  }
}
