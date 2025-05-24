import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthJwtPayload } from './jwt-strategy';
import { AuthService } from '../auth.service';
import { ConfigType } from '@nestjs/config';
import refreshConfig from '../config/refresh.token';
import { Inject, Injectable } from '@nestjs/common';
@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh-jwt') {
  constructor(
    @Inject(refreshConfig.KEY)
    private refreshTokenConfig: ConfigType<typeof refreshConfig>,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromHeader('refresh'),
      secretOrKey: refreshTokenConfig.secret!,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  validate(req: any, payload: AuthJwtPayload) {
    const userId = payload.sub;
    const refreshToken = req.headers.refresh;
    return this.authService.validateRefreshToken(userId, refreshToken);
  }
}
