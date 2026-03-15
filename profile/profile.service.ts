import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BasicInfoDto } from './dto/basic-info.dto';
import { AddressDto, OfficeInfoDto } from './dto/address.dto';
import { MedicalEducationDto } from './dto/medical-education.dto';
import { MembershipDto, MEMBERSHIP_PRICING } from './dto/membership.dto';
import { AdminService } from '../admin/admin.service';

// Base URL used to build public image URLs.
// In production, set APP_URL in your .env to your CDN or domain.
const BASE_URL = process.env.APP_URL ?? 'http://localhost:1018';

// ─── Step constants — single source of truth ─────────────────────
// If you ever reorder the onboarding flow, only change numbers here.
const STEPS = {
  BASIC_INFO:        1,
  MEDICAL_EDUCATION: 2,
  ADDRESS:           3,
  OFFICE_INFO:       4,
  COMPLETE:          5,
} as const;

@Injectable()
export class ProfileService {
constructor(
  private readonly prisma: PrismaService,
  private readonly adminService: AdminService,
) {}
  // ─────────────────────────────────────────────────────────────────
  // STEP 1 — Basic Information
  //
  // Saves firstName, lastName, DOB, phone, maritalStatus, referredBy.
  // Also updates prefix/suffix on the User row (they live there).
  // Optionally replaces the profile image.
  // Advances profileStep → 1.
  // ─────────────────────────────────────────────────────────────────
  async saveBasicInfo(
    userId: string,
    dto: BasicInfoDto,
    image?: Express.Multer.File,
  ) {
    // Split user-level fields away so they don't land in BasicInfo table
    const { prefix, suffix, ...basicFields } = dto;

    // Run both DB writes atomically — if one fails, both roll back
    const [basicInfo] = await this.prisma.$transaction([

      // 1a. Upsert BasicInfo — all field names match the new schema
      this.prisma.basicInfo.upsert({
        where: { userId },
        update: {
          ...basicFields,
          // ISO string → Date object that Prisma/MySQL expects
          dateOfBirth: basicFields.dateOfBirth
            ? new Date(basicFields.dateOfBirth)
            : undefined,
        },
        create: {
          ...basicFields,
          userId,
          dateOfBirth: basicFields.dateOfBirth
            ? new Date(basicFields.dateOfBirth)
            : undefined,
        },
      }),

      // 1b. Update User with prefix, suffix, optional image, and step
      this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(prefix && { prefix }),
          ...(suffix && { suffix }),
          ...(image  && { imagePath: image.path }),
          profileStep: STEPS.BASIC_INFO,
        },
        select: { profileStep: true },
      }),
    ]);

    return {
      message: 'Basic information saved successfully',
      profileStep: STEPS.BASIC_INFO,
      data: basicInfo,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 2 — Medical Education
  //
  // Uses renamed fields: primarySpecialty, secondarySpecialty.
  // Updated Practicing enum: ACADEMICS / NON_ACADEMICS.
  // Advances profileStep → 2.
  // ─────────────────────────────────────────────────────────────────
  async saveMedicalEducation(userId: string, dto: MedicalEducationDto) {
    const [medicalEducation] = await this.prisma.$transaction([
      this.prisma.medicalEducation.upsert({
        where: { userId },
        update: dto,
        create: { ...dto, userId },
      }),

      this.prisma.user.update({
        where: { id: userId },
        data: { profileStep: STEPS.MEDICAL_EDUCATION },
        select: { profileStep: true },
      }),
    ]);

    return {
      message: 'Medical education saved successfully',
      profileStep: STEPS.MEDICAL_EDUCATION,
      data: medicalEducation,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 3 — Home Address
  //
  // Renamed field: "street" (was "address" in the old schema).
  // Advances profileStep → 3.
  // ─────────────────────────────────────────────────────────────────
  async saveAddress(userId: string, dto: AddressDto) {
    const { home } = dto;

    const [address] = await this.prisma.$transaction([
      this.prisma.address.upsert({
        where: { userId },
        update: home,
        create: { ...home, userId },
      }),

      this.prisma.user.update({
        where: { id: userId },
        data: { profileStep: STEPS.ADDRESS },
        select: { profileStep: true },
      }),
    ]);

    return {
      message: 'Home address saved successfully',
      profileStep: STEPS.ADDRESS,
      data: address,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 4 — Office Information (optional)
  //
  // Renamed fields: officeName (was office_name), street (was address1).
  // Relation name fixed: officeInformation (was OfficeInformation).
  // User can skip — step still advances to 4 so they can proceed.
  // ─────────────────────────────────────────────────────────────────
  async saveOfficeInfo(userId: string, dto?: OfficeInfoDto) {
    if (!dto) {
      // User skipped — advance step anyway so they can reach membership
      await this.prisma.user.update({
        where: { id: userId },
        data: { profileStep: STEPS.OFFICE_INFO },
      });
      return { message: 'Office info skipped', profileStep: STEPS.OFFICE_INFO };
    }

    const [officeInformation] = await this.prisma.$transaction([
      this.prisma.officeInformation.upsert({
        where: { userId },
        update: dto,
        create: { ...dto, userId },
      }),

      this.prisma.user.update({
        where: { id: userId },
        data: { profileStep: STEPS.OFFICE_INFO },
        select: { profileStep: true },
      }),
    ]);

    return {
      message: 'Office information saved successfully',
      profileStep: STEPS.OFFICE_INFO,
      data: officeInformation,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 5 — Select Membership & Initiate Payment
  //
  // Creates/updates Membership with isActive: false.
  // isActive becomes true only after payment is confirmed.
  // ─────────────────────────────────────────────────────────────────
async selectMembership(userId: string, dto: MembershipDto) {
  const { type } = dto;
  const price = MEMBERSHIP_PRICING[type];
  const expiresAt = type === 'LIFETIME' ? null : this.calcExpiry();

  const membership = await this.prisma.membership.upsert({
    where: { userId },
    update: {
      type,
      price,
      expiresAt,
      isActive: false,
      startedAt: new Date(),
    },
    create: {
      userId,
      type,
      price,
      expiresAt,
      isActive: false,
    },
  });

  // ⭐ Auto activate student membership
  if (type === 'STUDENT') {
    await this.adminService.autoConfirmStudent(userId);

    return {
      message: 'Student membership activated successfully',
      data: {
        membershipId: membership.id,
        type: membership.type,
        price: membership.price,
        isActive: true,
      },
    };
  }

  return {
    message: 'Membership selected. Proceed to payment.',
    data: {
      membershipId: membership.id,
      type: membership.type,
      price: membership.price,
      expiresAt: membership.expiresAt,
    },
  };
}


  // ─────────────────────────────────────────────────────────────────
  // CONFIRM PAYMENT
  //
  // Recommended: call from your Stripe webhook handler (more secure).
  // Activates the membership and sets profileStep = 5 + isProfileCompleted.
  // ─────────────────────────────────────────────────────────────────
  async confirmPayment(userId: string) {
    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { userId },
        data: { isActive: true },
      }),

      this.prisma.user.update({
        where: { id: userId },
        data: { isProfileCompleted: true, profileStep: STEPS.COMPLETE },
      }),
    ]);

    return {
      message: 'Payment confirmed. Your profile is now complete.',
      profileStep: STEPS.COMPLETE,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // GET /profile/me — lightweight header data (username + avatar)
  // ─────────────────────────────────────────────────────────────────
  async getUsername(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, imagePath: true },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      username: user.username,
      image: this.buildImageUrl(user.imagePath),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // GET /profile — full profile + current onboarding progress
  //
  // All related tables fetched in ONE Prisma query.
  // The frontend uses `profileStep` to resume the user at the correct
  // step and render the progress tracker accurately.
  // `nextStep` tells the frontend which route to navigate to next.
  // ─────────────────────────────────────────────────────────────────
  async getFullProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id:                 true,
        email:              true,
        username:           true,
        prefix:             true,
        suffix:             true,
        imagePath:          true,
        isProfileCompleted: true,
        profileStep:        true,   // ← frontend reads this to drive the progress UI
        createdAt:          true,
        basicInfo:          true,
        medicalEducation:   true,
        address:            true,
        officeInformation:  true,   // ← fixed relation name (was OfficeInformation)
        membership:         true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const { imagePath, ...rest } = user;

    return {
      ...rest,
      image:    this.buildImageUrl(imagePath),
      // null when profile is fully complete, otherwise the next step number
      nextStep: user.isProfileCompleted ? null : user.profileStep + 1,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────

  /** Converts a stored file path to a full public URL, or null. */
  private buildImageUrl(imagePath: string | null): string | null {
    if (!imagePath) return null;
    return `${BASE_URL}/${imagePath.replace(/\\/g, '/')}`;
  }

  /** STUDENT and ANNUAL memberships both expire after exactly 1 year. */
  private calcExpiry(): Date {
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    return expiry;
  }
}