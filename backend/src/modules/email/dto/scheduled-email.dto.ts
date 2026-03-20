import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class RescheduleEmailDto {
  @ApiProperty({ description: 'New scheduled time (ISO 8601)', example: '2026-03-25T10:00:00.000Z' })
  @IsDateString()
  scheduledAt: string;
}

export class ScheduledEmailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  to: string[];

  @ApiProperty()
  subject: string;

  @ApiProperty()
  scheduledAt: Date;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional({ nullable: true })
  errorMessage?: string | null;

  @ApiPropertyOptional({ nullable: true })
  sentAt?: Date | null;

  @ApiProperty()
  createdAt: Date;
}
