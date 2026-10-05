import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PERMISSION_CODES } from '../rbac/permissions.constants';
import { AuditService } from '../../common/audit/audit.service';
import { PeopleService } from './people.service';
import { ParentStudentService } from './parent-student.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

/** CRUD Student + daftar anak milik orang tua login. */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StudentsController {
  constructor(
    private readonly people: PeopleService,
    private readonly links: ParentStudentService,
    private readonly audit: AuditService,
  ) {}

  @Get('students')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  list(@Query('search') search?: string, @Query('isActive') isActive?: string) {
    return this.people.listStudents({ search, isActive });
  }

  @Get('students/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  get(@Param('id') id: string) {
    return this.people.getStudent(id);
  }

  @Post('students')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_STUDENT_MANAGE)
  async create(
    @Body() dto: CreateStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const created = await this.people.createStudent(dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'STUDENT_CREATED',
      entity: 'Student',
      entityId: created.id,
      newData: { email: dto.email, parentIds: dto.parentIds ?? [] },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch('students/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_STUDENT_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.people.getStudent(id);
    const updated = await this.people.updateStudent(id, dto);
    await this.audit.log({
      actorId: actor.id,
      action: 'STUDENT_UPDATED',
      entity: 'Student',
      entityId: id,
      oldData: { isActive: before.isActive },
      newData: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  /** Log aktivitas siswa — absensi, ujian, latsol (halaman detail admin). */
  @Get('students/:id/activity')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_VIEW)
  activity(@Param('id') id: string) {
    return this.people.studentActivity(id);
  }

  /**
   * Hapus permanen — hanya siswa tanpa jejak akademik/finance.
   * Yang sudah punya histori ditolak (pakai nonaktifkan).
   */
  @Delete('students/:id')
  @RequirePermissions(PERMISSION_CODES.PEOPLE_STUDENT_MANAGE)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.people.getStudent(id);
    const result = await this.people.deleteStudent(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'STUDENT_DELETED',
      entity: 'Student',
      entityId: id,
      oldData: { name: before.user.name, email: before.user.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  /** Halaman "Anak" milik Orang Tua — hanya anak sendiri. */
  @Get('me/children')
  @RequirePermissions(PERMISSION_CODES.DASHBOARD_ORANG_TUA_VIEW)
  myChildren(@CurrentUser() actor: AuthenticatedUser) {
    return this.links.myChildren(actor.id);
  }
}
