import { IsUUID } from 'class-validator';

export class AssignStudentDto {
  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId: string;
}

