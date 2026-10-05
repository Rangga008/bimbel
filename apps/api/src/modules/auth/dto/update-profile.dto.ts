import { IsOptional, IsString, Length, Matches } from 'class-validator';

/** Edit profil mandiri (semua role) — hanya nama & nomor HP yang boleh diubah sendiri. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 100, { message: 'Nama 2–100 karakter.' })
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s()]{0,20}$/, {
    message: 'Nomor HP tidak valid (maks 20 karakter).',
  })
  phone?: string;
}
