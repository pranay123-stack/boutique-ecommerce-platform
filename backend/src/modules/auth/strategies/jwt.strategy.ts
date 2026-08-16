import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../../common/decorators';
import type { Permission, RoleName } from '../../../common/constants';

export interface JwtPayload {
  sub: string;
  email: string;
  role: RoleName;
  permissions: Permission[];
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.accessSecret') as string,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Re-check the account on every request: a token issued before a ban must
    // stop working immediately, not when it happens to expire.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        status: true,
        deletedAt: true,
        role: { select: { name: true, permissions: true } },
      },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role.name as RoleName,
      permissions: user.role.permissions as Permission[],
    };
  }
}
