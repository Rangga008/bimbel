import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateContentCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama kategori wajib diisi.' })
  @MaxLength(100, { message: 'Nama kategori maksimal 100 karakter.' })
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateContentCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Nama kategori tidak boleh kosong.' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
