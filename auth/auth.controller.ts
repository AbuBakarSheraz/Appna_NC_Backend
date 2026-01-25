import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}

  @Post('register')
  register(@Body() dto: any) {
    return this.service.register(dto);
  }

  @Post('login')
  login(@Body() dto: any) {
    return this.service.login(dto);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') token: string) {
    return this.service.refresh(token);
  }
}
