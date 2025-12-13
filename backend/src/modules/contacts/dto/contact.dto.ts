import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEmail,
  IsUUID,
  MaxLength,
  ValidateNested,
  IsInt,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Email address DTO for contacts
 */
export class EmailAddressDto {
  @IsEmail()
  @MaxLength(320) // RFC 5321 max email length
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsOptional()
  @IsBoolean()
  primary?: boolean;
}

/**
 * Phone number DTO for contacts
 */
export class PhoneNumberDto {
  @IsString()
  @MaxLength(50)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsOptional()
  @IsBoolean()
  primary?: boolean;
}

/**
 * DTO for creating a contact
 */
export class CreateContactDto {
  @IsUUID()
  providerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAddressDto)
  @ArrayMaxSize(20)
  emails?: EmailAddressDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhoneNumberDto)
  @ArrayMaxSize(20)
  phoneNumbers?: PhoneNumberDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

/**
 * DTO for updating a contact
 */
export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAddressDto)
  @ArrayMaxSize(20)
  emails?: EmailAddressDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhoneNumberDto)
  @ArrayMaxSize(20)
  phoneNumbers?: PhoneNumberDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  tags?: string[];
}

/**
 * Query params for listing contacts
 */
export class ListContactsQueryDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number;
}

/**
 * DTO for creating a local contact (no provider sync)
 */
export class CreateLocalContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAddressDto)
  @ArrayMaxSize(20)
  emails?: EmailAddressDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhoneNumberDto)
  @ArrayMaxSize(20)
  phoneNumbers?: PhoneNumberDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

/**
 * DTO for extracting contacts from emails
 */
export class ExtractContactsDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  excludePublicDomains?: boolean;
}

/**
 * DTO for Google contacts manual sync trigger
 */
export class GoogleContactsSyncDto {
  @IsUUID()
  providerId!: string;
}

/**
 * DTO for vCard import body content
 */
export class VCardImportBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(10 * 1024 * 1024) // 10MB max for raw vCard content
  content?: string;
}
