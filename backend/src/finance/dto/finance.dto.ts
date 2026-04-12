import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFeeOrderDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsDateString()
  dueDate: string;

  @IsString()
  @IsOptional()
  classId?: string;
}

export class RecordPaymentDto {
  @IsString()
  studentId: string;

  @IsString()
  invoiceId: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsString()
  method: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  paidBy: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
