import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from 'prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  //========== ISSUE TOKENS ==========

  private async issueTokens(userId : string) {
    const payload = { sub: userId};
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: '15m',
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      expiresIn: '7d',
    });

    await this.saveRefreshToken(userId, refreshToken);

    return {
      access_token : accessToken,
      refresh_token: refreshToken,
    };

  }

  //========== STORE REFRESH TOKEN ==========

  private async saveRefreshToken(userId: string, token: string) {
    const hash = await bcrypt.hash(token, 10);

    await this.prisma.refreshToken.create({
      data:{
        userId,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 7 * 86400000)
      },
    });
  }

    // ================= REFRESH =================
  async refresh(refreshToken: string) {
    let payload: any;

    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // ✅ Fetch ALL tokens of user (more secure)
    const storedTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: payload.sub,
        expiresAt: { gt: new Date() },
      },
    });

    if (!storedTokens.length) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // ✅ Compare against each stored token
    let valid = false;
    for (const token of storedTokens) {
      if (await bcrypt.compare(refreshToken, token.tokenHash)) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(payload.sub);
  }

  //========== REGISTER ==========

async register(dto: RegisterDto, file?: Express.Multer.File) {

  const existingUser = await this.prisma.user.findFirst({
    where: {
      OR: [
        { email: dto.email },
        { username: dto.username },
      ],
    },
  });

  if (existingUser) {
    throw new ConflictException('Email or username already exists');
  }

  const hash = await bcrypt.hash(dto.password, 10);

  const user = await this.prisma.user.create({
    data: {
      email: dto.email,
      username: dto.username,
      password: hash,
      prefix: dto.prefix,
      suffix: dto.suffix,
      imagePath: file?.path || null,
    },
  });

  return this.issueTokens(user.id);
}
  // ================= LOGIN =================
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      user.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      ...(await this.issueTokens(user.id)),
      profileCompleted: user.isProfileCompleted,
    };
  }

}


