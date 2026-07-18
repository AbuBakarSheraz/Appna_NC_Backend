import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { AlreadyAMemberDto } from './dto/already-a-member.dto';
import { MEMBERSHIP_PRICING } from '../profile/dto/membership.dto'; // ← reuse existing pricing map

function annualExpiry(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
}

@Injectable()
export class AlreadyAMemberService {
  private readonly logger = new Logger(AlreadyAMemberService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async addAlreadyAMember(dto: AlreadyAMemberDto, file?: Express.Multer.File) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('Email or username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const expiresAt = dto.membershipType === 'LIFETIME' ? null : annualExpiry();
    const price = MEMBERSHIP_PRICING[dto.membershipType]; // 50 for ANNUAL, 500 for LIFETIME

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          password: passwordHash,
          prefix: dto.prefix,
          suffix: dto.suffix,
          imagePath: file?.path ?? null,
          profileStep: 5,
          isProfileCompleted: true, // whole profile arrives in one shot
        },
      });

      await tx.basicInfo.create({
        data: {
          userId: created.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: dto.phoneNumber,
          referredBy: dto.referredBy,
        },
      });

      await tx.medicalEducation.create({
        data: {
          userId: created.id,
          institutionName: dto.institutionName,
          graduationYear: dto.graduationYear,
          primarySpecialty: dto.primarySpecialty,
          secondarySpecialty: dto.secondarySpecialty,
          currentlyPracticing: dto.currentlyPracticing,
          internship: dto.internship,
          residency: dto.residency,
          fellowship1: dto.fellowship1,
          fellowship2: dto.fellowship2,
        },
      });

      await tx.address.create({
        data: {
          userId: created.id,
          street: dto.street,
          city: dto.city,
          state: dto.state,
          country: 'USA',
          zipCode: '27513',
        },
      });

      await tx.membership.create({
        data: {
          userId: created.id,
          type: dto.membershipType,
          price,
          expiresAt,
          isActive: false, // admin flips this after verifying existing membership
          startedAt: new Date(),
          paymentProvider: 'MANUAL',
          paymentStatus: 'PAID', // reuses the existing "awaiting confirmation" dashboard state
          paidAt: new Date(),
        },
      });

      return created;
    });

    try {
      await this.mailService.sendAlreadyMemberRequestSubmitted({
        memberName: `${dto.firstName} ${dto.lastName}`,
        memberEmail: dto.email,
        membershipType: dto.membershipType,
      });
    } catch (err) {
      this.logger.error('Failed to send already-member confirmation email', err);
    }

    return {
      message:
        'Your request has been submitted. APPNA NC will verify your existing membership and email your confirmation shortly.',
      userId: user.id,
    };
  }
}