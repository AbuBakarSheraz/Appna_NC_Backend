import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { SquareService } from '../payments/square.service';
import { SponsorshipDto } from './dto/sponsorship.dto';
import { buildSponsorshipReceiptPng } from '../common/card-image';

export const SPONSORSHIP_PRICING: Record<string, number> = {
  PLATINUM: 10000,
  GOLD: 5000,
  SILVER: 3000,
  BRONZE: 1000,
};

const TIER_LABELS: Record<string, string> = {
  PLATINUM: 'Platinum',
  GOLD: 'Gold',
  SILVER: 'Silver',
  BRONZE: 'Bronze',
};

@Injectable()
export class SponsorshipService {
  private readonly logger = new Logger(SponsorshipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly squareService: SquareService,
  ) {}

  private referenceId(id: string) {
    const fullId = `sponsorship_${id}`;
    if (fullId.length <= 40) return fullId;
    return crypto.createHash('md5').update(fullId).digest('hex');
  }

  async submitSponsorship(dto: SponsorshipDto) {
    const amount = SPONSORSHIP_PRICING[dto.tier];
    if (!amount) throw new BadRequestException('Invalid sponsorship tier.');

    // Create the record first so there's always a paper trail, even if the charge fails
    const sponsorship = await this.prisma.sponsorship.create({
      data: {
        businessName: dto.businessName,
        businessType: dto.businessType,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        tier: dto.tier,
        amount,
        notes: dto.notes,
        paymentProvider: 'SQUARE',
        paymentStatus: 'PENDING',
      },
    });

    let payment;
    try {
      payment = await this.squareService.createPayment({
        sourceId: dto.sourceId,
        idempotencyKey: dto.idempotencyKey ?? crypto.randomUUID(),
        amount,
        referenceId: this.referenceId(sponsorship.id),
        note: `${TIER_LABELS[dto.tier]} Sponsorship - ${dto.businessName}`,
      });
    } catch (err) {
      await this.prisma.sponsorship.update({
        where: { id: sponsorship.id },
        data: { paymentStatus: 'FAILED' },
      });
      throw err;
    }

    const updated = await this.prisma.sponsorship.update({
      where: { id: sponsorship.id },
      data: {
        squarePaymentId: payment.paymentId,
        paidAt: new Date(),
        paymentStatus: 'PAID',
      },
    });


    const receiptDataUrl = buildSponsorshipReceiptPng({
      businessName: updated.businessName,
      tier: TIER_LABELS[updated.tier],
      amount: updated.amount,
      sponsorshipId: updated.id,
      transactionId: payment.paymentId,
      paidAt: updated.paidAt!,
    });

    try {
      await this.mailService.sendSponsorshipPaymentReceived({
        businessName: updated.businessName,
        contactName: updated.contactName,
        contactEmail: updated.contactEmail,
        contactPhone: updated.contactPhone,
        tier: TIER_LABELS[updated.tier],
        amount: updated.amount,
        transactionId: payment.paymentId,
        receiptDataUrl,
      });
    } catch (err) {
      this.logger.error('Failed to send sponsorship payment emails', err);
    }

    return {
      message: 'Payment received. APPNA NC will confirm your sponsorship shortly.',
      data: { sponsorshipId: updated.id, receiptDataUrl, receiptUrl: payment.receiptUrl },
    };
  }

  async getAllSponsorships(status?: 'PAID' | 'CONFIRMED') {
  const data = await this.prisma.sponsorship.findMany({
    where: status ? { paymentStatus: status } : {},
    orderBy: { paidAt: 'desc' },
  });
  return { data, total: data.length };
}

  async getPendingSponsorships() {
    const data = await this.prisma.sponsorship.findMany({
      where: { paymentStatus: 'PAID' },
      orderBy: { paidAt: 'asc' },
    });
    return { data, total: data.length };
  }

  async confirmSponsorship(id: string) {
    const sponsorship = await this.prisma.sponsorship.findUnique({ where: { id } });
    if (!sponsorship) throw new NotFoundException('Sponsorship not found');

    const updated = await this.prisma.sponsorship.update({
      where: { id },
      data: { paymentStatus: 'CONFIRMED', confirmedAt: new Date() },
    });

    try {
      await this.mailService.sendSponsorshipConfirmed({
        businessName: updated.businessName,
        contactName: updated.contactName,
        contactEmail: updated.contactEmail,
        tier: TIER_LABELS[updated.tier],
        amount: updated.amount,
      });
    } catch (err) {
      this.logger.error('Failed to send sponsorship confirmation email', err);
    }

    return { message: `Sponsorship confirmed for ${updated.businessName}` };
  }
}