import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString } from 'class-validator';

/**
 * Phase 145.1 — Body for `PATCH /tasks/:sourceType/:id/snooze`.
 * Mirrors SnoozeFollowUpDto from the ai module; shape is identical.
 */
export class SnoozeTaskDto {
  @ApiProperty({
    example: '2026-04-19T09:00:00.000Z',
    description: 'New due date as an ISO-8601 future timestamp',
  })
  @IsString()
  @IsISO8601()
  dueDate!: string;
}
