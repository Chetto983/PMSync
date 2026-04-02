import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { ReminderPriorita, ReminderStatus } from '@prisma/client';

export class BulkUpdateReminderDto {
  @ApiProperty({ type: [String], description: 'Reminder IDs to update' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  ids: string[];

  @ApiPropertyOptional({ enum: ReminderStatus })
  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;

  @ApiPropertyOptional({ enum: ReminderPriorita })
  @IsOptional()
  @IsEnum(ReminderPriorita)
  priorita?: ReminderPriorita;
}
