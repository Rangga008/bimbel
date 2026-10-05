import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Email atau nomor HP — backend memilih jalur lookup berdasarkan isinya. */
  @IsString()
  @MinLength(3)
  identifier: string;

  @IsString()
  @MinLength(6)
  password: string;
}
