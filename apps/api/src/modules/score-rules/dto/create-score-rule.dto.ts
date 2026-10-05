import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class CreateScoreRuleDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  entityType: string; // EXAM, LATSOL, QUESTION_TYPE

  @IsOptional()
  @IsString()
  entityValue?: string; // ID spesifik atau tipe soal

  @IsOptional()
  @IsInt()
  pointsPerUnit?: number;

  @IsOptional()
  @IsInt()
  bonusThreshold?: number;

  @IsOptional()
  @IsInt()
  bonusPoints?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}
