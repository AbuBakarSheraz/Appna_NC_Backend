import {
  IsString,
  IsOptional,
  IsNotEmpty,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Home Address ────────────────────────────────────────────────
export class HomeAddressDto {
  // ── "address" → "street" in the new schema ──
  @IsString()
  @IsNotEmpty({ message: 'Street address is required' })
  street: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 12)
  zipCode: string;

  @IsOptional()
  @Matches(/^\+?[\d\s\-().]{7,20}$/, { message: 'Invalid home phone format' })
  homePhone?: string;
}

// ─── Office Information ───────────────────────────────────────────
export class OfficeInfoDto {
  // ── "office_name" → "officeName" in the new schema ──
  @IsString()
  @IsNotEmpty({ message: 'Office / practice name is required' })
  officeName: string;

  // ── "address1" → "street" in the new schema ──
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 12)
  zipCode: string;

  @IsOptional()
  @Matches(/^\+?[\d\s\-().]{7,20}$/, { message: 'Invalid office phone format' })
  officePhone?: string;
}

// ─── Combined DTO (both sections sent in one request) ────────────
export class AddressDto {
  @ValidateNested()
  @Type(() => HomeAddressDto)
  home: HomeAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OfficeInfoDto)
  office?: OfficeInfoDto;
}