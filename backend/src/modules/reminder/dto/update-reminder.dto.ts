import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ReminderAzione,
  ReminderCondizioneTipo,
  ReminderPeriodo,
  ReminderPriorita,
  ReminderStatus,
} from '@prisma/client';

export class UpdateReminderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  titolo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descrizione?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contatto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scadenzaDatetime?: string;

  @ApiPropertyOptional({ enum: ReminderPeriodo })
  @IsOptional()
  @IsEnum(ReminderPeriodo)
  periodo?: ReminderPeriodo;

  @ApiPropertyOptional({ enum: ReminderAzione })
  @IsOptional()
  @IsEnum(ReminderAzione)
  azione?: ReminderAzione;

  @ApiPropertyOptional({ enum: ReminderPriorita })
  @IsOptional()
  @IsEnum(ReminderPriorita)
  priorita?: ReminderPriorita;

  @ApiPropertyOptional({ enum: ReminderCondizioneTipo })
  @IsOptional()
  @IsEnum(ReminderCondizioneTipo)
  condizioneTipo?: ReminderCondizioneTipo;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  condizioneDettaglio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  monitoraEmail?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailKeywords?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailMittente?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  messaggioTelegram?: string;

  @ApiPropertyOptional({ enum: ReminderStatus })
  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;

  @ApiPropertyOptional({ description: 'Whether this reminder recurs' })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional({ description: 'RRULE string (RFC 5545), e.g. FREQ=WEEKLY;INTERVAL=1' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  recurrenceRule?: string;
}
