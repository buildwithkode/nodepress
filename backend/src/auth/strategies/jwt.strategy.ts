import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { env } from '../../config/env';
import { RolesService } from '../../roles/roles.service';
import { AccessTokenPayload, isAccessTokenPayload } from '../access-token';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private roles: RolesService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  async validate(payload: AccessTokenPayload) {
    // Refuse 2FA temp tokens, OIDC cookies and preview tokens
    if (!isAccessTokenPayload(payload)) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) throw new UnauthorizedException();

    // A custom role runs as its base role (so @Roles() checks keep working);
    // customRole is what content permission checks use.
    const { role, customRole } = await this.roles.resolve(user.role);
    return { id: user.id, email: user.email, role, ...(customRole && { customRole }) };
  }
}
