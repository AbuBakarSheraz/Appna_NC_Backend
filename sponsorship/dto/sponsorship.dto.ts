import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SponsorshipDto {
  @IsString() @MinLength(2) businessName: string;
  @IsString() businessType: string;

  @IsString() contactName: string;
  @IsEmail() contactEmail: string;
  @IsString() contactPhone: string;

  @IsIn(['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'])
  tier: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';

  @IsOptional() @IsString() notes?: string;

  // Square Web Payments SDK token
  @IsString() sourceId: string;
  @IsOptional() @IsString() idempotencyKey?: string;
}