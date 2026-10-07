import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { RegisterParentDto } from './dto/register-parent.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthService, IssuedTokens } from './auth.service';
import { AuditService } from '../../common/audit/audit.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './types/authenticated-user.type';

const REFRESH_COOKIE_NAME = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private refreshCookieOptions(expiresAt: Date): CookieOptions {
    // SameSite: 'lax' (default) cukup bila web & API satu domain/site (mis.
    // app.domain.com → web, app.domain.com/api → API via reverse proxy).
    // Bila web dan API beda origin (mis. app.domain.com + api.domain.com),
    // cookie XHR butuh SameSite=None+Secure — set COOKIE_SAMESITE=none.
    const sameSiteEnv = this.config
      .get<string>('COOKIE_SAMESITE', '')
      .toLowerCase();
    const sameSite: CookieOptions['sameSite'] =
      sameSiteEnv === 'none' || sameSiteEnv === 'strict' ? sameSiteEnv : 'lax';
    const secureFlag =
      sameSite === 'none' || // None wajib Secure menurut spesifikasi browser.
      this.config.get<string>('COOKIE_SECURE', '') === 'true' ||
      (this.config.get<string>('NODE_ENV') === 'production' &&
        (this.config.get<string>('COOKIE_SECURE', 'auto') === 'auto'
          ? this.config.get<string>('CORS_ORIGIN', '').startsWith('https://')
          : false));
    return {
      httpOnly: true,
      // Jangan paksa Secure di http://localhost — browser tidak akan pernah
      // mengirim cookie Secure lewat http sehingga refresh selalu gagal (401).
      secure: secureFlag,
      sameSite,
      // Path '/' supaya cookie terkirim ke seluruh /api/* (refresh, logout,
      // dan endpoint lain bila kelak butuh baca cookie). Path lama '/auth'
      // tidak cocok dengan prefix global '/api' sehingga cookie tidak terkirim.
      path: '/',
      expires: expiresAt,
    };
  }

  private setRefreshCookie(res: Response, tokens: IssuedTokens) {
    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      this.refreshCookieOptions(tokens.refreshTokenExpiresAt),
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto.identifier, dto.password, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  /**
   * Pendaftaran mandiri orang tua dari landing page. Setelah akun dibuat,
   * langsung login — response identik dengan /auth/login supaya client bisa
   * memakai satu handler sesi.
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterParentDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const created = await this.authService.registerParent(dto);
    await this.audit.log({
      actorId: created.userId,
      action: 'PARENT_SELF_REGISTERED',
      entity: 'Parent',
      entityId: created.parentId,
      newData: { email: dto.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    const tokens = await this.authService.login(dto.email, dto.password, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  /**
   * Minta link reset password via email.
   * Catatan: `identifier` = email ATAU nomor HP — dipilah di AuthService. Origin request dipakai sebagai base
   * URL link (fallback env WEB_APP_URL) supaya cocok dengan host yang diakses
   * user. Selalu 200 — tidak membocorkan apakah email terdaftar.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const origin =
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    return this.authService.requestPasswordReset(dto.email, origin);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = (
      req.cookies as Record<string, string> | undefined
    )?.[REFRESH_COOKIE_NAME];
    if (!rawRefreshToken) {
      return { accessToken: null, user: null };
    }
    const tokens = await this.authService.refresh(rawRefreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = (
      req.cookies as Record<string, string> | undefined
    )?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(rawRefreshToken);
    // Hapus cookie baru (path /) + sisa cookie lama dari rilis sebelumnya
    // (path /auth dan /api/auth) agar sesi benar-benar bersih di browser.
    // sameSite/secure harus cocok dengan cookie yang diset, kalau tidak
    // browser bisa menolak penghapusan (mis. SameSite=None; Secure).
    const opts = this.refreshCookieOptions(new Date(0));
    res.clearCookie(REFRESH_COOKIE_NAME, { ...opts, expires: undefined });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  /**
   * Profil mandiri (semua role): GET = data segar termasuk nomor HP;
   * PATCH = ubah nama/nomor HP sendiri.
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    const updated = await this.authService.updateProfile(user.id, dto);
    await this.audit.log({
      actorId: user.id,
      action: 'PROFILE_UPDATED',
      entity: 'User',
      entityId: user.id,
      newData: {
        name: dto.name,
        phone: dto.phone,
        majorChoice1: dto.majorChoice1,
        majorChoice2: dto.majorChoice2,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  /**
   * Foto profil self-service (semua role) — multipart field `file`.
   * Hanya menyentuh user yang sedang login; tidak ada parameter userId.
   */
  @Post('profile/photo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  async updateAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
          size: number;
        }
      | undefined,
    @Req() req: Request,
  ) {
    const updated = await this.authService.updateAvatar(user.id, file);
    await this.audit.log({
      actorId: user.id,
      action: 'PROFILE_PHOTO_UPDATED',
      entity: 'User',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete('profile/photo')
  @UseGuards(JwtAuthGuard)
  async removeAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.removeAvatar(user.id);
  }

  /**
   * Ubah kata sandi mandiri (Profil semua role). Setelah sukses, semua refresh
   * token direvoke — client harus mengarahkan user login ulang.
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const result = await this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    await this.audit.log({
      actorId: user.id,
      action: 'PASSWORD_CHANGED',
      entity: 'User',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
