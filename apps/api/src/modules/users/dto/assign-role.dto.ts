import { IsUUID } from 'class-validator';

export class AssignRoleDto {
  @IsUUID('4', { message: 'roleId tidak valid.' })
  roleId: string;
}

