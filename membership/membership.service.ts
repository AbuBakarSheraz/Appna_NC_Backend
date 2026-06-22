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
      price = 1;
      expiresAt = this.calcExpiry();
    }

    if (type === MembershipTypeEnum.STUDENT) {
      price = 0;
      expiresAt = this.calcExpiry();
    }

    if (type === MembershipTypeEnum.LIFETIME) {
      price = 1;
      expiresAt = null;
    }

    return this.prisma.membership.upsert({
      where: { userId },
      update: {
        type,
        price,
        expiresAt,
        isActive: false,
        paymentProvider: price > 0 ? 'PAYPAL' : null,
        paymentStatus: price > 0 ? 'PENDING' : 'NOT_REQUIRED',
      },
      create: {
        userId,
        type,
        price,
        expiresAt,
        isActive: false,
        paymentProvider: price > 0 ? 'PAYPAL' : null,
        paymentStatus: price > 0 ? 'PENDING' : 'NOT_REQUIRED',
      },
    });
  }

  async getMyMembership(userId: string) {
    return this.prisma.membership.findUnique({
      where: { userId },
    });
  }

  private calcExpiry(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  }
}
