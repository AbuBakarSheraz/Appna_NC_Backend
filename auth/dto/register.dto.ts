import { IsEmail, IsEnum, IsNotEmpty, MinLength } from 'class-validator';

export enum PrefixEnum {
  DR = 'DR',
  MISS = 'MISS',
  MR = 'MR',
  MRS = 'MRS',
  MS = 'MS',
}

export enum SuffixEnum {
  DDS = 'DDS',
  DMD = 'DMD',
  DO = 'DO',
  MD = 'MD',
  NA = 'NA',
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  username: string;

  @MinLength(6)
  password: string;

  @IsEnum(PrefixEnum)
  prefix: PrefixEnum;

  @IsEnum(SuffixEnum)
  suffix: SuffixEnum;
}

