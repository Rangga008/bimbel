import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(3, { message: 'Nama kelompok minimal 3 karakter.' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsUUID('4', { message: 'programId tidak valid.' })
  programId: string;

  @IsOptional()
  @IsUUID('4', { message: 'levelId tidak valid.' })
  levelId?: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Kapasitas minimal 1.' })
  capacity?: number;

  /** Tutor lead yang langsung ditugaskan ke kelompok & jadwal awal. */
  @IsOptional()
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId?: string | null;

  // ----- Jadwal mingguan awal (opsional).
  // Jika ketiganya terisi, sistem membuat Schedule + membuat sesi via generate
  // di halaman Jadwal. validFrom default = hari ini.
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'dayOfWeek harus 0 (Minggu) sampai 6 (Sabtu).' })
  @Max(6, { message: 'dayOfWeek harus 0 (Minggu) sampai 6 (Sabtu).' })
  dayOfWeek?: number;

  /** Menit sejak 00:00, mis. 16:00 = 960. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60 - 1)
  startMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  endMin?: number;

  @IsOptional()
  @IsUUID('4', { message: 'roomId tidak valid.' })
  roomId?: string | null;

  /** Mapel yang diajar di jadwal awal ini — untuk jenjang multi-mapel (kelas reguler). */
  @IsOptional()
  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId?: string | null;

  /** Tanggal mulai berlaku jadwal (YYYY-MM-DD). Default: hari ini. */
  @IsOptional()
  @IsDateString({}, { message: 'validFrom harus tanggal (YYYY-MM-DD).' })
  validFrom?: string;

  /** Tanggal akhir berlaku jadwal (opsional). */
  @IsOptional()
  @IsDateString({}, { message: 'validTo harus tanggal (YYYY-MM-DD).' })
  validTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
