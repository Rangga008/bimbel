import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class AssignTutorDto {
  @IsUUID('4', { message: 'tutorId tidak valid.' })
  tutorId: string;

  @IsOptional()
  @IsBoolean()
  isLead?: boolean;
}
