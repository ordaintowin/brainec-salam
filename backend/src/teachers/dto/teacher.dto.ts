import {
  IsString,
  IsEmail,
  IsOptional,
  IsDateString,
  MinLength,
} from 'class-validator';

export class CreateTeacherDto {
  // User fields
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  // Teacher fields
  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  qualification?: string;

  @IsDateString()
  joinDate: string;
}

export class UpdateTeacherDto {
  // User fields
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  // Teacher fields
  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  qualification?: string;

  @IsDateString()
  @IsOptional()
  joinDate?: string;
}

export class ArchiveTeacherDto {
  @IsString()
  archiveReason: string;
}
