import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('teacher')
  @Roles(Role.TEACHER)
  getTeacherDashboard(@CurrentUser() user: any) {
    return this.dashboardService.getTeacherDashboard(user.id);
  }
}
