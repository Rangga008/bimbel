import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const DAY_NOTE_TYPES = ['LIBUR', 'RAPAT', 'DARURAT', 'INFO'] as const;
export type DayNoteType = (typeof DAY_NOTE_TYPES)[number];

export class CreateDayNoteDto {
  /** Tanggal (YYYY-MM-DD atau ISO) — disimpan sebagai DATE (tanggal saja). */
  @IsISO8601({}, { message: 'Format tanggal tidak valid.' })
  date: string;

  @IsOptional()
  @IsIn(DAY_NOTE_TYPES, {
    message: `Jenis catatan hanya boleh: ${DAY_NOTE_TYPES.join('/')}.`,
  })
  type?: DayNoteType;

  @IsString()
  @IsNotEmpty({ message: 'Judul catatan wajib diisi.' })
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
