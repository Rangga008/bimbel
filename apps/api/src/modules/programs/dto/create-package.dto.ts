import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePackageDto {
  @IsUUID('4', { message: 'levelId tidak valid.' })
  levelId: string;

  @IsString()
  @MinLength(3, { message: 'Nama paket minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsInt({ message: 'Jumlah sesi harus bilangan bulat.' })
  @Min(1, { message: 'Jumlah sesi minimal 1.' })
  totalSessions: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Harga tidak valid.' })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
