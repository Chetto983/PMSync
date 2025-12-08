import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';

class EmailAttachmentDto {
  @IsString()
  filename!: string;

  @IsString()
  contentType!: string;

  @IsString()
  contentBase64!: string;
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

  @IsString()
  @MaxLength(10000000, { message: 'Text body exceeds 10MB limit' })
  bodyText!: string;

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
}

export class ReplyForwardEmailRequestDto extends BaseComposeEmailDto {}

export type { EmailAttachmentDto };
