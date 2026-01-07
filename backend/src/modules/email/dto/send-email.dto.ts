import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
  IsInt,
  IsPositive,
  Max,
} from 'class-validator';

/**
 * Attachment DTO with size validation
 * FIX (BUG-010, BUG-019): Added size validation with positive check and max limit
 */
class EmailAttachmentDto {
  @IsString()
  filename!: string;

  @IsString()
  contentType!: string;

  @IsString()
  @MaxLength(35_000_000, { message: 'Attachment content exceeds 25MB base64 limit' }) // ~25MB in base64
  contentBase64!: string;

  @IsOptional()
  @IsInt({ message: 'Attachment size must be an integer' })
  @IsPositive({ message: 'Attachment size must be positive' })
  @Max(26_214_400, { message: 'Attachment size exceeds 25MB limit' }) // 25MB
  size?: number;
}

class BaseComposeEmailDto {
  @IsArray()
  @IsEmail({}, { each: true, message: 'Invalid email address in "to" field' })
  @ArrayMaxSize(50, { message: 'Maximum 50 recipients in "to" field' })
  to!: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true, message: 'Invalid email address in "cc" field' })
  @ArrayMaxSize(50, { message: 'Maximum 50 recipients in "cc" field' })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true, message: 'Invalid email address in "bcc" field' })
  @ArrayMaxSize(50, { message: 'Maximum 50 recipients in "bcc" field' })
  bcc?: string[];

  @IsString()
  @MaxLength(998, { message: 'Subject exceeds RFC 5322 limit of 998 characters' })
  subject!: string;

  @IsString()
  @MaxLength(10000000, { message: 'HTML body exceeds 10MB limit' })
  bodyHtml!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000000, { message: 'Text body exceeds 10MB limit' })
  bodyText?: string;

  @IsOptional()
  @IsString()
  inReplyTo?: string;

  @IsOptional()
  @IsString()
  references?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EmailAttachmentDto)
  attachments?: EmailAttachmentDto[];
}

export class SendEmailRequestDto extends BaseComposeEmailDto {
  @IsString()
  providerId!: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}

export class ReplyForwardEmailRequestDto extends BaseComposeEmailDto { }

export type { EmailAttachmentDto };
