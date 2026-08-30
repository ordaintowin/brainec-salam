import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { FinanceReconciliationService } from './finance-reconciliation.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceReconciliationService],
  exports: [FinanceService, FinanceReconciliationService],
})
export class FinanceModule {}
