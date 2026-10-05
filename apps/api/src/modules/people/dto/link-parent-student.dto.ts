import { IsUUID } from 'class-validator';

export class LinkParentStudentDto {
  @IsUUID('4', { message: 'parentId tidak valid.' })
  parentId: string;

  @IsUUID('4', { message: 'studentId tidak valid.' })
  studentId: string;
}
