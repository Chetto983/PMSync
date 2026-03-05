import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must be at most 128 characters' })
  password!: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
