import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsPositive,
  IsArray,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum FeeOrderType {
  CLASS = 'CLASS',
  INDIVIDUAL = 'INDIVIDUAL',
  ALL = 'ALL',
}

enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  MOBILE_MONEY = 'MOBILE_MONEY',
}

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

  @IsEnum(FeeOrderType)
  @IsOptional()
  type?: FeeOrderType;

  @IsString()
  @IsOptional()
  classId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  studentIds?: string[];
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

export class BulkPaymentDto {
  @IsString()
  studentId: string;

  @IsArray()
  @IsString({ each: true })
  invoiceIds: string[];

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsEnum(PaymentMethod)
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
