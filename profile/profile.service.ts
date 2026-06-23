import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BasicInfoDto } from './dto/basic-info.dto';
import { AddressDto, OfficeInfoDto } from './dto/address.dto';
import { MedicalEducationDto } from './dto/medical-education.dto';
import { MembershipDto, MEMBERSHIP_PRICING } from './dto/membership.dto';
import { AdminService } from '../admin/admin.service';
import { MailService } from '../src/mail/mail.service';

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
private readonly logger = new Logger(ProfileService.name);
private paypalAccessToken?: string;
private paypalAccessTokenExpiresAt = 0;

constructor(
  private readonly prisma: PrismaService,
  private readonly adminService: AdminService,
  private readonly mailService: MailService,
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
  const isFreePlan = price === 0;

  const membership = await this.prisma.membership.upsert({
    where: { userId },
    update: {
      type,
      price,
      expiresAt,
      isActive: false,
      startedAt: new Date(),
      paymentProvider: isFreePlan ? null : 'PAYPAL',
      paymentStatus: isFreePlan ? 'NOT_REQUIRED' : 'PENDING',
      paypalOrderId: null,
      paypalCaptureId: null,
      paidAt: null,
      paymentNotifiedAt: null,
    },
    create: {
      userId,
      type,
      price,
      expiresAt,
      isActive: false,
      paymentProvider: isFreePlan ? null : 'PAYPAL',
      paymentStatus: isFreePlan ? 'NOT_REQUIRED' : 'PENDING',
    },
  });

  if (isFreePlan) {
    await this.adminService.autoConfirmStudent(userId);

    return {
      message: 'Resident / Fellow in Training membership activated successfully',
      data: {
        membershipId: membership.id,
        type: membership.type,
        price: membership.price,
        expiresAt,
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
      paymentStatus: membership.paymentStatus,
    },
  };
}

  async createPayPalOrder(userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            username: true,
            basicInfo: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!membership) {
      throw new BadRequestException('Please select a membership plan first.');
    }

    if (membership.isActive) {
      throw new BadRequestException('Your membership is already active.');
    }

    if (membership.price <= 0) {
      throw new BadRequestException('This membership does not require payment.');
    }

    const frontendUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'https://appnanc.org';
    const cleanFrontendUrl = frontendUrl.replace(/\/$/, '');
    const order = await this.paypalRequest<{
      id: string;
      links?: Array<{ href: string; rel: string }>;
    }>('/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: membership.id,
            custom_id: userId,
            description: `${this.membershipLabel(membership.type)} APPNA NC Membership`,
            amount: {
              currency_code: 'USD',
              value: membership.price.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: 'APPNA North Carolina',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: `${cleanFrontendUrl}/membership/payment/return`,
          cancel_url: `${cleanFrontendUrl}/membership/payment/cancel`,
        },
      }),
    });

    const approveUrl = order.links?.find((link) => ['payer-action', 'approve', 'approval_url'].includes(link.rel))?.href
      ?? order.links?.find((link) => link.rel !== 'self')?.href;

    if (!approveUrl) {
      throw new InternalServerErrorException('PayPal did not return an approval URL.');
    }

    await this.prisma.membership.update({
      where: { userId },
      data: {
        paypalOrderId: order.id,
        paymentProvider: 'PAYPAL',
        paymentStatus: 'ORDER_CREATED',
      },
    });

    return { orderId: order.id, approveUrl };
  }

  async capturePayPalOrder(userId: string, orderId: string) {
    if (!orderId) throw new BadRequestException('Missing PayPal order token.');

    const membership = await this.prisma.membership.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            username: true,
            basicInfo: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!membership || membership.paypalOrderId !== orderId) {
      throw new BadRequestException('This PayPal order does not match your membership.');
    }

    if (membership.paidAt) {
      return {
        message: 'Payment already received. Awaiting admin confirmation.',
        data: { paymentStatus: membership.paymentStatus },
      };
    }

    const capture = await this.paypalRequest<any>(`/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (capture.status !== 'COMPLETED') {
      throw new BadRequestException('PayPal payment was not completed.');
    }

    const purchaseUnit = capture.purchase_units?.[0];
    const payment = purchaseUnit?.payments?.captures?.[0];
    const paidAmount = Number(payment?.amount?.value ?? 0);

    if (paidAmount !== membership.price) {
      throw new BadRequestException('PayPal payment amount does not match the selected membership.');
    }

    const updated = await this.prisma.membership.update({
      where: { userId },
      data: {
        paypalCaptureId: payment?.id ?? null,
        paidAt: new Date(),
        paymentStatus: 'PAID',
      },
      include: {
        user: {
          select: {
            email: true,
            username: true,
            basicInfo: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!updated.paymentNotifiedAt) {
      await this.prisma.membership.update({
        where: { userId },
        data: { paymentNotifiedAt: new Date() },
      });

      try {
        await this.mailService.sendMembershipPaymentReceived({
          memberName: this.memberName(updated.user),
          memberEmail: updated.user.email,
          membershipType: this.membershipLabel(updated.type),
          amount: updated.price,
          paypalOrderId: updated.paypalOrderId,
          paypalCaptureId: updated.paypalCaptureId,
        });
      } catch (err) {
        this.logger.error('Failed to send PayPal payment emails', err);
      }
    }

    return {
      message: 'Payment received. Awaiting admin confirmation.',
      data: {
        paymentStatus: 'PAID',
        isActive: false,
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

  private async paypalRequest<T>(path: string, init: RequestInit): Promise<T> {
    const token = await this.getPayPalAccessToken();
    const response = await fetch(`${this.paypalBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      this.logger.error(`PayPal request failed: ${response.status}`, json);
      throw new InternalServerErrorException('PayPal payment service is unavailable.');
    }

    return json as T;
  }

  private async getPayPalAccessToken(): Promise<string> {
    if (this.paypalAccessToken && Date.now() < this.paypalAccessTokenExpiresAt) {
      return this.paypalAccessToken;
    }

    const { clientId, clientSecret } = this.getPayPalCredentials();

    const response = await fetch(`${this.paypalBaseUrl()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      this.logger.error(`PayPal token request failed: ${response.status}`, json);
      throw new InternalServerErrorException('PayPal credentials could not be verified.');
    }

    this.paypalAccessToken = json.access_token;
    this.paypalAccessTokenExpiresAt = Date.now() + Math.max((json.expires_in ?? 300) - 60, 60) * 1000;

    return this.paypalAccessToken!;
  }

  private getPayPalCredentials(): { clientId: string; clientSecret: string } {
    const env = process.env.PAYPAL_ENV === 'live' ? 'LIVE' : 'SANDBOX';
    const clientId = process.env.PAYPAL_CLIENT_ID ?? process.env[`PAYPAL_CLIENT_ID_${env}`];
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? process.env[`PAYPAL_CLIENT_SECRET_${env}`];

    if (!clientId || !clientSecret) {
      const missing = [
        !clientId ? `PAYPAL_CLIENT_ID or PAYPAL_CLIENT_ID_${env}` : null,
        !clientSecret ? `PAYPAL_CLIENT_SECRET or PAYPAL_CLIENT_SECRET_${env}` : null,
      ].filter(Boolean).join(' and ');

      throw new InternalServerErrorException(
        `PayPal credentials are not configured. Set ${missing}.`,
      );
    }

    return { clientId, clientSecret };
  }

  private paypalBaseUrl(): string {
    return process.env.PAYPAL_ENV === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
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

  /** Resident/Fellow and Annual memberships expire on December 31 of the current year. */
  private calcExpiry(): Date {
    const now = new Date();
    const expiry = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return expiry;
  }
}
