import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  Length,
  Matches,
} from 'class-validator';
import { Prefix, Suffix, MaritalStatus } from '@prisma/client';

export class BasicInfoDto {
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @Length(1, 60)
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @Length(1, 60)
  lastName: string;

  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be a valid ISO date (YYYY-MM-DD)' })
  dateOfBirth?: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  // Allows formats like +1-800-555-0199, (800) 555-0199, +92 300 1234567
  @Matches(/^\+?[\d\s\-().]{7,20}$/, { message: 'Invalid phone number format' })
  phoneNumber: string;

  // ── Now a proper enum instead of a free-text string ──
  @IsOptional()
  @IsEnum(MaritalStatus, {
    message: `maritalStatus must be one of: ${Object.values(MaritalStatus).join(', ')}`,
  })
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @IsString()
  spouse?: string;

  // ── referredBy is optional in the new schema ──
  @IsOptional()
  @IsString()
  referredBy?: string;

  // ── User-level fields — routed to the User table in the service ──
  @IsOptional()
  @IsEnum(Prefix, { message: `prefix must be one of: ${Object.values(Prefix).join(', ')}` })
  prefix?: Prefix;

  @IsOptional()
  @IsEnum(Suffix, { message: `suffix must be one of: ${Object.values(Suffix).join(', ')}` })
  suffix?: Suffix;
}