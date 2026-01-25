import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';

export class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor() {
    super({
      jwtFromRequest: (req: Request) => req.body.refreshToken,
      secretOrKey: process.env.JWT_REFRESH_SECRET,
    });
  }

  validate(payload: any) {
    return payload;
  }
}
