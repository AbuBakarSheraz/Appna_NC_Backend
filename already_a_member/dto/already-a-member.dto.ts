import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Prefix, Suffix, Practicing } from '@prisma/client';

export class AlreadyAMemberDto {
  // ── Account ──
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional() @IsIn(['DR', 'MISS', 'MR', 'MRS', 'MS'])
  prefix?: Prefix;

  @IsOptional() @IsIn(['MD', 'DO', 'DDS', 'DMD', 'NA'])
  suffix?: Suffix;

  // ── Basic info ──
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsString() phoneNumber: string;
  @IsOptional() @IsString() referredBy?: string;

  // ── Medical education ──
  @IsString() institutionName: string;

  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(new Date().getFullYear())
  graduationYear: number;

  @IsString() primarySpecialty: string;
  @IsOptional() @IsString() secondarySpecialty?: string;
  @IsOptional() @IsIn(['ACADEMICS', 'NON_ACADEMICS']) currentlyPracticing?: Practicing;
  @IsOptional() @IsString() internship?: string;
  @IsOptional() @IsString() residency?: string;
  @IsOptional() @IsString() fellowship1?: string;
  @IsOptional() @IsString() fellowship2?: string;

  // ── Home address only — office is intentionally not collected ──
  @IsString() street: string;
  @IsString() city: string;
  @IsString() state: string;

  // ── Membership (existing members only — no STUDENT/free tier here) ──
  @IsIn(['ANNUAL', 'LIFETIME'])
  membershipType: 'ANNUAL' | 'LIFETIME';
}