import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'] as const;
export const FIELD_TYPES = ['TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'SELECT', 'TEXTAREA', 'CHECKBOX', 'DATE'] as const;

export class RegistrationFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @IsIn(FIELD_TYPES)
  type: (typeof FIELD_TYPES)[number] = 'TEXT';

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsOptional()
  options?: unknown;

  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsOptional()
  bannerImage?: string;

  @IsDateString()
  date: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsString()
  @IsNotEmpty()
  venue: string;

  @IsString()
  @IsOptional()
  googleMapsUrl?: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsInt()
  @Min(0)
  ticketPrice: number;

  @IsIn(EVENT_STATUSES)
  @IsOptional()
  status?: (typeof EVENT_STATUSES)[number];

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RegistrationFieldDto)
  @IsOptional()
  registrationFields?: RegistrationFieldDto[];
}

export class UpdateEventDto {
  @IsString()
  @IsOptional()
  title: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsString()
  @IsOptional()
  category: string;

  @IsDateString()
  @IsOptional()
  date: string;

  @IsString()
  @IsOptional()
  startTime: string;

  @IsString()
  @IsOptional()
  endTime: string;

  @IsString()
  @IsOptional()
  venue: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  capacity: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  ticketPrice: number;

  @IsIn(EVENT_STATUSES)
  @IsOptional()
  status?: (typeof EVENT_STATUSES)[number];

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RegistrationFieldDto)
  @IsOptional()
  registrationFields?: RegistrationFieldDto[];
}

export class RegisterForEventDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  cnic?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  organization?: string;

  @IsString()
  @IsOptional()
  designation?: string;

  @IsObject()
  @IsOptional()
  answers?: Record<string, unknown>;
}

export class CaptureEventPaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  requestId: string;
}

export class ReviewTicketRequestDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ValidateTicketDto {
  @IsString()
  @IsNotEmpty()
  qrPayload: string;
}
