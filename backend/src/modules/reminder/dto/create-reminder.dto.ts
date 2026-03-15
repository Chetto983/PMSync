import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ReminderAzione,
  ReminderCondizioneTipo,
  ReminderPeriodo,
  ReminderPriorita,
} from '@prisma/client';

/**
 * DTO for creating a reminder.
 * Two modes:
 * 1. Natural language: provide only `inputUtente` — AI parser fills the rest
 * 2. Structured: provide individual fields directly (bypass AI parsing)
 */
export class CreateReminderDto {
  @ApiPropertyOptional({
    description: 'Natural language input — AI will parse into structured fields',
    example: 'Ricordami lunedi pomeriggio di chiamare Omron per le fotocellule',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  inputUtente?: string;

  @ApiPropertyOptional({ description: 'Reminder title (max 100 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  titolo?: string;

  @ApiPropertyOptional({ description: 'Description of the reminder' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descrizione?: string;

  @ApiPropertyOptional({ description: 'Contact name (company or person)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contatto?: string;

  @ApiPropertyOptional({ description: 'Deadline as ISO date string' })
  @IsOptional()
  @IsDateString()
  scadenzaDatetime?: string;

  @ApiPropertyOptional({ description: 'Time period', enum: ReminderPeriodo })
  @IsOptional()
  @IsEnum(ReminderPeriodo)
  periodo?: ReminderPeriodo;

  @ApiPropertyOptional({ description: 'Action type', enum: ReminderAzione })
  @IsOptional()
  @IsEnum(ReminderAzione)
  azione?: ReminderAzione;

  @ApiPropertyOptional({ description: 'Priority', enum: ReminderPriorita })
  @IsOptional()
  @IsEnum(ReminderPriorita)
  priorita?: ReminderPriorita;

  @ApiPropertyOptional({ description: 'Condition type', enum: ReminderCondizioneTipo })
  @IsOptional()
  @IsEnum(ReminderCondizioneTipo)
  condizioneTipo?: ReminderCondizioneTipo;

  @ApiPropertyOptional({ description: 'Condition detail (free text)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  condizioneDettaglio?: string;

  @ApiPropertyOptional({ description: 'Enable email monitoring' })
  @IsOptional()
  @IsBoolean()
  monitoraEmail?: boolean;

  @ApiPropertyOptional({ description: 'Keywords for email matching', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailKeywords?: string[];

  @ApiPropertyOptional({ description: 'Expected sender email for monitoring' })
  @IsOptional()
  @IsString()
  emailMittente?: string;

  @ApiPropertyOptional({ description: 'Telegram notification text (max 200 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  messaggioTelegram?: string;
}
