import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ============================
  // REGISTER (unchanged behavior)
  // ============================
  async register(data) {
    // ✅ friendly uniqueness check (optional but recommended)
    // const exists = await this.prisma.user.findFirst({
    //   where: {
    //     OR: [{ email: data.email }, { username: data.username }],
    //   },
    // });

    // if (exists) {
    //   throw new ConflictException(
    //     'Email or username already exists',
    //   );
    // }

    const hash = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        password: hash,
      },
    });

    // 👇 still returns access_token like before
    return this.generateToken(user.id);
  }

  // ============================
  // LOGIN (unchanged behavior)
  // ============================
  async login(data) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !(await bcrypt.compare(data.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      ...(await this.generateToken(user.id)),
      profileCompleted: user.isProfileCompleted,
    };
  }

  // ============================
  // ACCESS + REFRESH TOKENS
  // ============================
  private async generateToken(userId: string) {
    // 🔐 short-lived access token
    const accessToken = this.jwtService.sign(
      { sub: userId },
      { expiresIn: '15m' },
    );

    // 🔁 long-lived refresh token
    const refreshToken = this.jwtService.sign(
      { sub: userId },
      { expiresIn: '7d' },
    );

    // store refresh token securely
    await this.saveRefreshToken(userId, refreshToken);

    // ⛔ DO NOT BREAK OLD CLIENTS
    return {
      access_token: accessToken,   // unchanged
      refresh_token: refreshToken, // added (safe)
    };
  }

  // ============================
  // STORE REFRESH TOKEN (HASHED)
  // ============================
  private async saveRefreshToken(userId: string, token: string) {
    const hash = await bcrypt.hash(token, 10);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ),
      },
    });
  }

  // ============================
  // REFRESH ACCESS TOKEN
  // ============================
  async refresh(refreshToken: string) {
    const payload = this.jwtService.verify(refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub },
    });

    if (
      !storedToken ||
      !(await bcrypt.compare(refreshToken, storedToken.tokenHash))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // issue new tokens (rotation-ready)
    return this.generateToken(payload.sub);
  }
}
