import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SquareTokenPaymentDto {
  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @IsString()
  @IsOptional()
  @MaxLength(45)
  idempotencyKey?: string;
}

export class SquareEventTokenPaymentDto extends SquareTokenPaymentDto {
  @IsString()
  @IsNotEmpty()
  requestId: string;
}
