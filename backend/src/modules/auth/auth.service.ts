import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { generateOpaqueToken, hashToken, randomId } from '../../common/utils/crypto.util';
import { ROLES, type Permission, type RoleName } from '../../common/constants';
import type {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresIn: number;
}

export interface AuthResult extends TokenPair {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
    role: RoleName;
    emailVerified: boolean;
  };
}

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {
    this.bcryptRounds = this.config.get<number>('auth.bcryptRounds') ?? 12;
  }

  // ------------------------------------------------------------------ register

  async register(dto: RegisterDto, ctx: RequestContext = {}): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const customerRole = await this.prisma.role.findUnique({ where: { name: ROLES.CUSTOMER } });
    if (!customerRole) {
      throw new BadRequestException('Role configuration missing - run database seed');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName ?? null,
        phone: dto.phone ?? null,
        roleId: customerRole.id,
        // Every customer gets a wishlist up front so the UI never handles a null.
        wishlist: { create: {} },
      },
      include: { role: true },
    });

    const verificationToken = await this.issueEmailVerificationToken(user.id);

    this.events.emit('user.registered', {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      verificationToken,
    });

    const tokens = await this.issueTokens(
      {
        id: user.id,
        email: user.email,
        role: user.role.name as RoleName,
        permissions: user.role.permissions as Permission[],
      },
      ctx,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name as RoleName,
        emailVerified: user.emailVerified,
      },
    };
  }

  // --------------------------------------------------------------------- login

  async login(dto: LoginDto, ctx: RequestContext = {}): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    // Always run a hash comparison, even when the user does not exist, so that
    // response timing cannot be used to enumerate registered email addresses.
    const hash =
      user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('This account has been deactivated');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(
      {
        id: user.id,
        email: user.email,
        role: user.role.name as RoleName,
        permissions: user.role.permissions as Permission[],
      },
      ctx,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name as RoleName,
        emailVerified: user.emailVerified,
      },
    };
  }

  // ------------------------------------------------------------------- refresh

  /**
   * Rotating refresh with reuse detection.
   *
   * Each refresh token belongs to a "family". Presenting a token that has
   * already been rotated means it leaked, so the entire family is revoked and
   * the session is terminated - the standard defence against token replay.
   */
  async refresh(rawToken: string, ctx: RequestContext = {}): Promise<TokenPair> {
    if (!rawToken) throw new UnauthorizedException('Refresh token missing');

    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoking family ${stored.family}`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }
    if (stored.user.deletedAt || stored.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const next = await this.issueTokens(
      {
        id: stored.user.id,
        email: stored.user.email,
        role: stored.user.role.name as RoleName,
        permissions: stored.user.role.permissions as Permission[],
      },
      ctx,
      stored.family,
    );

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: hashToken(next.refreshToken) },
    });

    return next;
  }

  // -------------------------------------------------------------------- logout

  async logout(rawToken: string | undefined, allDevices = false): Promise<{ success: boolean }> {
    if (!rawToken) return { success: true };
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!stored) return { success: true };

    await this.prisma.refreshToken.updateMany({
      where: allDevices
        ? { userId: stored.userId, revokedAt: null }
        : { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  // ----------------------------------------------------------- password resets

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always report success. Revealing whether an address is registered would
    // turn this endpoint into an account-enumeration oracle.
    if (user && !user.deletedAt && user.status === 'ACTIVE') {
      const token = generateOpaqueToken();
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });
      this.events.emit('user.password_reset_requested', {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        token,
      });
    }
    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: true }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // A password change invalidates every existing session.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.events.emit('user.password_changed', { userId: record.userId });
    return { success: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new BadRequestException('Password login is not enabled');

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    this.events.emit('user.password_changed', { userId });
    return { success: true };
  }

  // ------------------------------------------------------- email verification

  async issueEmailVerificationToken(userId: string): Promise<string> {
    const token = generateOpaqueToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });
    return token;
  }

  async verifyEmail(token: string): Promise<{ success: true }> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This verification link is invalid or has expired');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  async resendVerification(userId: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Account not found');
    if (user.emailVerified) return { success: true };

    const token = await this.issueEmailVerificationToken(userId);
    this.events.emit('user.verification_requested', {
      userId,
      email: user.email,
      firstName: user.firstName,
      verificationToken: token,
    });
    return { success: true };
  }

  // -------------------------------------------------------------- token issue

  private async issueTokens(
    user: { id: string; email: string; role: RoleName; permissions: Permission[] },
    ctx: RequestContext,
    family?: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        type: 'access',
      },
      {
        secret: this.config.get<string>('auth.accessSecret'),
        expiresIn: (this.config.get<string>('auth.accessTtl') ??
          '15m') as JwtSignOptions['expiresIn'],
      },
    );

    // The refresh token is an opaque random value, not a JWT: it must be
    // revocable server-side, and only its hash is ever persisted.
    const refreshToken = generateOpaqueToken(48);
    const ttlDays = this.parseDays(this.config.get<string>('auth.refreshTtl') ?? '30d');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        family: family ?? randomId(16),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent?.slice(0, 512) ?? null,
      },
    });

    return {
      accessToken,
      refreshToken,
      csrfToken: generateOpaqueToken(24),
      expiresIn: this.parseSeconds(this.config.get<string>('auth.accessTtl') ?? '15m'),
    };
  }

  private parseDays(ttl: string): number {
    const m = /^(\d+)([dhm])$/.exec(ttl);
    if (!m) return 30;
    const n = Number(m[1]);
    return m[2] === 'd' ? n : m[2] === 'h' ? n / 24 : n / 1440;
  }

  private parseSeconds(ttl: string): number {
    const m = /^(\d+)([dhms])$/.exec(ttl);
    if (!m) return 900;
    const n = Number(m[1]);
    return { d: n * 86400, h: n * 3600, m: n * 60, s: n }[m[2] as 'd' | 'h' | 'm' | 's'];
  }
}
