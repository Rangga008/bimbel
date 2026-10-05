import { IsString, IsInt, IsOptional, IsEnum } from 'class-validator';
import { PointEventType } from '@prisma/client';

export class CreatePointTransactionDto {
  @IsString()
  studentId: string;

  @IsOptional()
  @IsString()
  scoreRuleId?: string;

  @IsEnum(PointEventType)
  eventType: PointEventType;

  @IsInt()
  points: number;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  period?: string; // Format "YYYY-MM"
}
