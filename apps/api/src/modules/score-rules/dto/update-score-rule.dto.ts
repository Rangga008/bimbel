import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class UpdateScoreRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  entityType?: string; // EXAM, LATSOL, QUESTION_TYPE

  @IsOptional()
  @IsString()
  entityValue?: string;

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
