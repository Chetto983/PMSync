import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type TimelineEntryType =
  | 'email_sent'
  | 'email_received'
  | 'deal_activity'
  | 'task'
  | 'meeting'
  | 'ticket'
  | 'note';

export class TimelineEntryDto {
  id!: string;
  type!: TimelineEntryType;
  title!: string;
  summary!: string | null;
  date!: string;
  metadata!: Record<string, unknown>;
  entityId!: string;
}

export class TimelineResponseDto {
  entries!: TimelineEntryDto[];
  nextCursor!: string | null;
  total!: number;
}

export class TimelineQueryDto {
  @ApiPropertyOptional({ description: 'ISO date cursor for pagination' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Number of entries per page (default 20, max 50)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
