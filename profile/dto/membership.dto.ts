import { IsEnum, IsNotEmpty } from 'class-validator';
import { MembershipType } from '@prisma/client';

// ─── Membership pricing (single source of truth) ─────────────────
// Keep this here so the controller/service never hard-code prices.
export const MEMBERSHIP_PRICING: Record<MembershipType, number> = {
  [MembershipType.STUDENT]:  50,   // USD
  [MembershipType.ANNUAL]:   200,
  [MembershipType.LIFETIME]: 1500,
};

export class MembershipDto {
  @IsEnum(MembershipType, {
    message: `type must be one of: ${Object.values(MembershipType).join(', ')}`,
  })
  @IsNotEmpty()
  type: MembershipType;
}