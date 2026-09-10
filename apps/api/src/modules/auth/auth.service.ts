import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from './types/authenticated-user.type';

export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthenticatedUser;
}

const REFRESH_TOKEN_BYTES = 48;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthenticatedUser(
    user: { id: string; email: string; name: string; isActive: boolean },
    roles: string[],
    permissions: string[],
  ): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions,
    };
  }

  /** Pesan error generik & human-friendly — jangan bocorkan apakah email terdaftar atau tidak. */
  private invalidCredentials(): never {
    throw new UnauthorizedException('Email atau kata sandi salah.');
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.usersService.findByEmailWithRoles(email);
    if (!user || !user.isActive) {
      this.invalidCredentials();
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      this.invalidCredentials();
    }

    return user;
  }

  private signAccessToken(authUser: AuthenticatedUser): string {
    return this.jwtService.sign(
      {
        sub: authUser.id,
        email: authUser.email,
        name: authUser.name,
        roles: authUser.roles,
        permissions: authUser.permissions,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: Number(
          this.config.get<string>('JWT_ACCESS_TTL_SECONDS', '900'),
        ),
      },
    );
  }

  private async issueRefreshToken(userId: string, ctx: LoginContext) {
    const ttlDays = Number(
      this.config.get<string>('JWT_REFRESH_TTL_DAYS', '7'),
    );
    const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    });

    return { rawToken, expiresAt };
  }

  async login(
    email: string,
    password: string,
    ctx: LoginContext,
  ): Promise<IssuedTokens> {
    const user = await this.validateCredentials(email, password);
    const { roles, permissions } =
      this.usersService.buildRolesAndPermissions(user);
    const authUser = this.toAuthenticatedUser(user, roles, permissions);

    const accessToken = this.signAccessToken(authUser);
    const { rawToken, expiresAt } = await this.issueRefreshToken(user.id, ctx);

    return {
      accessToken,
      refreshToken: rawToken,
      refreshTokenExpiresAt: expiresAt,
      user: authUser,
    };
  }

  async refresh(
    rawRefreshToken: string,
    ctx: LoginContext,
  ): Promise<IssuedTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new ForbiddenException('Sesi tidak valid, silakan login kembali.');
    }

    // Rotasi: token lama langsung direvoke supaya tidak bisa dipakai ulang (replay).
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findByIdWithRoles(existing.userId);
    if (!user || !user.isActive) {
      throw new ForbiddenException('Sesi tidak valid, silakan login kembali.');
    }

    const { roles, permissions } =
      this.usersService.buildRolesAndPermissions(user);
    const authUser = this.toAuthenticatedUser(user, roles, permissions);

    const accessToken = this.signAccessToken(authUser);
    const { rawToken, expiresAt } = await this.issueRefreshToken(user.id, ctx);

    return {
      accessToken,
      refreshToken: rawToken,
      refreshTokenExpiresAt: expiresAt,
      user: authUser,
    };
  }

  async logout(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) return;
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
