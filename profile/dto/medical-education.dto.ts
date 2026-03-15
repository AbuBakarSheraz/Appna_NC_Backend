import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsNotEmpty,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Practicing } from '@prisma/client';

export class MedicalEducationDto {
  @IsString()
  @IsNotEmpty({ message: 'Institution name is required' })
  institutionName: string;

  @IsInt({ message: 'Graduation year must be a number' })
  @Min(1950, { message: 'Graduation year seems too early' })
  @Max(new Date().getFullYear(), { message: 'Graduation year cannot be in the future' })
  @Type(() => Number) // transforms string "1995" → number when sent as form-data
  graduationYear: number;

  // ── "primarySpeciality" → "primarySpecialty" in the new schema ──
  @IsString()
  @IsNotEmpty({ message: 'Primary specialty is required' })
  primarySpecialty: string;

  // ── "secondarySpeciality" → "secondarySpecialty" in the new schema ──
  @IsOptional()
  @IsString()
  secondarySpecialty?: string;

  @IsOptional()
  @IsString()
  internship?: string;

  @IsOptional()
  @IsString()
  residency?: string;

  @IsOptional()
  @IsString()
  fellowship1?: string;

  @IsOptional()
  @IsString()
  fellowship2?: string;

  // ── Enum values updated: Academics → ACADEMICS, Non-Academics → NON_ACADEMICS ──
  @IsOptional()
  @IsEnum(Practicing, {
    message: `currentlyPracticing must be one of: ${Object.values(Practicing).join(', ')}`,
  })
  currentlyPracticing?: Practicing;
}