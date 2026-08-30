import { Module } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { ArchiveController } from './archive.controller';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [FinanceModule],
  controllers: [ArchiveController],
  providers: [ArchiveService],
})
export class ArchiveModule {}
