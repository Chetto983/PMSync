import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Phase 145 — Smart Today Dashboard DTOs.
 *
 * Per RESEARCH.md (lines 530-585): the Today feed is a single curated list grouped
 * into three urgency tiers (urgent, today, fyi). Each item carries enough source
 * linkage to support click-through navigation and quick actions (complete, dismiss,
 * snooze) without an extra round-trip.
 */

export const TODAY_ITEM_TYPES = ['email', 'task', 'deal', 'event'] as const;
export type TodayItemType = (typeof TODAY_ITEM_TYPES)[number];

export const TODAY_TIERS = ['urgent', 'today', 'fyi'] as const;
export type TodayTier = (typeof TODAY_TIERS)[number];

export class TodayFeedItemDto {
  @ApiProperty({ description: 'Composite ID: type_sourceType_sourceId' })
  id!: string;

  @ApiProperty({ enum: TODAY_ITEM_TYPES })
  type!: TodayItemType;

  @ApiProperty({ enum: TODAY_TIERS })
  tier!: TodayTier;

  @ApiProperty({ description: 'Numeric priority score (higher = more urgent)' })
  score!: number;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  subtitle!: string | null;

  @ApiPropertyOptional({ description: 'ISO 8601 datetime for time badge', nullable: true })
  dueAt!: string | null;

  @ApiProperty({ description: 'true = past due' })
  isOverdue!: boolean;

  // Source linkage — enables click-through navigation per D-08.
  @ApiPropertyOptional({ nullable: true })
  emailId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  threadId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taskSourceType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taskSourceId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  dealId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  eventId!: string | null;

  // Quick-action capability flags — frontend renders buttons conditionally.
  @ApiProperty()
  canComplete!: boolean;

  @ApiProperty()
  canDismiss!: boolean;

  @ApiProperty()
  canSnooze!: boolean;
}

export class TodayFeedCountsDto {
  @ApiProperty()
  urgent!: number;

  @ApiProperty()
  today!: number;

  @ApiProperty()
  fyi!: number;

  @ApiProperty()
  total!: number;
}

export class TodayFeedResponseDto {
  @ApiProperty({ type: [TodayFeedItemDto] })
  items!: TodayFeedItemDto[];

  @ApiProperty({ type: TodayFeedCountsDto })
  counts!: TodayFeedCountsDto;

  @ApiPropertyOptional({
    description: '2-3 sentence greeting from BriefingService.executiveSummary',
    nullable: true,
  })
  greeting!: string | null;

  @ApiProperty({ description: 'ISO timestamp of when the feed was generated' })
  generatedAt!: string;
}
