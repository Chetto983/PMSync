import { IsEmail, IsString, Length, IsOptional, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP code must contain only digits' })
  code!: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
