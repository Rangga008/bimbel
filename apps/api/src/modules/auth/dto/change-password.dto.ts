import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'Kata sandi baru minimal 8 karakter.' })
  newPassword: string;
}
