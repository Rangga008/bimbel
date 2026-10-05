import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Ortu/siswa mengisi feedback mingguan — 1 sel per siswa per mapel per minggu. */
export class SubmitFeedbackDto {
  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId: string;

  @IsUUID('4', { message: 'groupId tidak valid.' })
  groupId: string;

  @IsUUID('4', { message: 'subjectId tidak valid.' })
  subjectId: string;

  @IsString()
  @IsNotEmpty({ message: 'Isi feedback tidak boleh kosong.' })
  @MaxLength(2000)
  content: string;

  /**
   * Senin minggu yang diisi (ISO date). Kosong = minggu berjalan.
   * Tanggal lain dalam minggu yang sama dinormalisasi ke Seninnya.
   */
  @IsOptional()
  @IsString()
  weekStart?: string;
}

/** Filter minggu untuk query feedback (`week` = tanggal apa pun dalam minggu itu). */
export class FeedbackWeekQueryDto {
  @IsOptional()
  @IsString()
  week?: string;
}

export const GROUP_REMINDER_TYPES = [
  'payment-due',
  'weekly-schedule',
  'monthly-performance',
  'feedback',
] as const;
export type GroupReminderType = (typeof GROUP_REMINDER_TYPES)[number];
