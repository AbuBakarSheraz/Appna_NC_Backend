import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCmeDto {
  @IsString() @IsNotEmpty() @MaxLength(120) fullName: string;
  @IsString() @IsNotEmpty() @MaxLength(180) university: string;
  @IsString() @IsNotEmpty() @MaxLength(40) phone: string;
  @IsEmail() @MaxLength(180) email: string;
  @IsString() @IsNotEmpty() @MaxLength(120) specialty: string;
  @IsString() @IsNotEmpty() @MaxLength(80) state: string;
  @IsString() @IsNotEmpty() @MaxLength(100) city: string;
}
