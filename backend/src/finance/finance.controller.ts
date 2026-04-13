import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { CreateFeeOrderDto, RecordPaymentDto } from './dto/finance.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post('fee-orders')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  createFeeOrder(@Body() dto: CreateFeeOrderDto, @CurrentUser() user: any) {
    return this.financeService.createFeeOrder(dto, user.id);
  }

  @Get('fee-orders')
  getFeeOrders(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('q') q?: string,
  ) {
    return this.financeService.getFeeOrders(page, limit, q);
  }

  @Get('invoices')
  getInvoices(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('q') q?: string,
  ) {
    return this.financeService.getInvoices(page, limit, q);
  }

  @Get('invoices/student/:studentId')
  getStudentInvoices(@Param('studentId') studentId: string) {
    return this.financeService.getStudentInvoices(studentId);
  }

  @Post('payments')
  @Roles(Role.HEADMISTRESS, Role.ADMIN)
  recordPayment(@Body() dto: RecordPaymentDto, @CurrentUser() user: any) {
    return this.financeService.recordPayment(dto, user.id);
  }

  @Get('payments')
  getPayments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.financeService.getPayments(page, limit);
  }

  @Get('fee-orders/:id/summary')
  getFeeOrderSummary(@Param('id') id: string) {
    return this.financeService.getFeeOrderSummary(id);
  }

  @Get('summary')
  getSummary() {
    return this.financeService.getSummary();
  }
}
