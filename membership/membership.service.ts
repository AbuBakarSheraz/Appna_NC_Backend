import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipTypeEnum } from './dto/select-membership.dto';

@Injectable()
export class MembershipService {
  constructor(private prisma: PrismaService) {}

  async selectMembership(userId: string, type: MembershipTypeEnum) {
    let price = 0;
    let expiresAt: Date | null = null;

    if (type === MembershipTypeEnum.ANNUAL) {
      price = 50;
      expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    if (type === MembershipTypeEnum.STUDENT) {
      price = 0;
      expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    if (type === MembershipTypeEnum.LIFETIME) {
      price = 500;
      expiresAt = null;
    }

    return this.prisma.membership.upsert({
      where: { userId },
      update: {
        type,
        price,
        expiresAt,
        isActive: false,
      },
      create: {
        userId,
        type,
        price,
        expiresAt,
        isActive: false,
      },
    });
  }

  async getMyMembership(userId: string) {
    return this.prisma.membership.findUnique({
      where: { userId },
    });
  }
}
