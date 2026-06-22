import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MembershipExpiryService implements OnModuleInit {
  private readonly logger = new Logger(MembershipExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  onModuleInit() {
    void this.expireMemberships();
    setInterval(() => void this.expireMemberships(), ONE_DAY_MS);
  }

  async expireMemberships() {
    const expired = await this.prisma.membership.findMany({
      where: {
        isActive: true,
        expiresAt: { lt: new Date() },
        expiredNoticeSentAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            basicInfo: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    for (const membership of expired) {
      try {
        await this.prisma.$transaction([
          this.prisma.membership.update({
            where: { id: membership.id },
            data: {
              isActive: false,
              paymentStatus: 'EXPIRED',
              expiredNoticeSentAt: new Date(),
            },
          }),
          this.prisma.user.update({
            where: { id: membership.userId },
            data: { isProfileCompleted: false },
          }),
        ]);

        await this.mailService.sendMembershipExpired({
          memberName: this.memberName(membership.user),
          memberEmail: membership.user.email,
          membershipType: this.membershipLabel(membership.type),
          expiredAt: membership.expiresAt ?? new Date(),
        });
      } catch (err) {
        this.logger.error(`Failed to expire membership ${membership.id}`, err);
      }
    }
  }

  private memberName(user: {
    username: string;
    basicInfo?: { firstName: string; lastName: string } | null;
  }) {
    return user.basicInfo
      ? `${user.basicInfo.firstName} ${user.basicInfo.lastName}`
      : user.username;
  }

  private membershipLabel(type: string) {
    if (type === 'STUDENT') return 'Resident / Fellow in Training';
    if (type === 'ANNUAL') return 'Annual';
    if (type === 'LIFETIME') return 'Lifetime';
    return type;
  }
}
