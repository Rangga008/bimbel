import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalSessions?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
