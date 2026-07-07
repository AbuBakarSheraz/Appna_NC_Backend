import { IsEnum, IsNotEmpty } from 'class-validator';
import { MembershipType } from '@prisma/client';

// ─── Membership pricing (single source of truth) ─────────────────
// Keep this here so the controller/service never hard-code prices.
export const MEMBERSHIP_PRICING: Record<MembershipType, number> = {
  [MembershipType.STUDENT]:  0,   // Resident / Fellow in Training
  [MembershipType.ANNUAL]:   200,
  [MembershipType.LIFETIME]: 500,
};

export class MembershipDto {
  @IsEnum(MembershipType, {
    message: `type must be one of: ${Object.values(MembershipType).join(', ')}`,
  })
  @IsNotEmpty()
  type: MembershipType;
}
