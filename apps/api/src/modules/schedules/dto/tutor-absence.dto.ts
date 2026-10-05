import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TutorAbsenceDto {
  @IsString()
  @IsNotEmpty({ message: 'Alasan berhalangan wajib diisi (mis. sakit, urusan keluarga).' })
  @MaxLength(300)
  reason: string;
}
