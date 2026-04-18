import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Phase 145.1 — Smart Today Dashboard v2 DTOs.
 *
 * Per CONTEXT.md §D-02 and §D-07: each feed item belongs to exactly one of 4
 * action-driven streams (replies-needed > due-today > waiting-on-others > fyi)
 * with strict precedence. Items ship a backend-computed `routeUrl` so the
 * frontend renders a plain `<a href>` (fixes WR-06) and an optional
 * deterministic `rationale` 1-liner.
 *
 * `counts` carries both per-stream totals and a `kpi` block driving the header
 * chip strip (D-04): inbox / calendar / deals / tasks.
 */

export const TODAY_ITEM_TYPES = ['email', 'task', 'deal', 'event'] as const;
export type TodayItemType = (typeof TODAY_ITEM_TYPES)[number];

export const TODAY_STREAMS = [
  'replies-needed',
  'due-today',
  'waiting-on-others',
  'fyi',
] as const;
export type TodayStream = (typeof TODAY_STREAMS)[number];

export class TodayFeedItemDto {
  @ApiProperty({ description: 'Composite ID: type_sourceType_sourceId' })
  id!: string;

  @ApiProperty({ enum: TODAY_ITEM_TYPES })
  type!: TodayItemType;

  @ApiProperty({ enum: TODAY_STREAMS })
  stream!: TodayStream;

  @ApiProperty({ description: 'Numeric priority score (higher = more urgent)' })
  score!: number;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  subtitle!: string | null;

  @ApiProperty({ description: 'Backend-computed click-through URL' })
  routeUrl!: string;

  @ApiPropertyOptional({
    description: 'Deterministic 1-line reason (no LLM)',
    nullable: true,
  })
  rationale!: string | null;

  @ApiPropertyOptional({
    description: 'ISO 8601 datetime for time badge',
    nullable: true,
  })
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

export class TodayFeedKpiCountsDto {
  @ApiProperty()
  inbox!: number;

  @ApiProperty()
  calendar!: number;

  @ApiProperty()
  deals!: number;

  @ApiProperty()
  tasks!: number;
}

export class TodayFeedCountsDto {
  @ApiProperty()
  repliesNeeded!: number;

  @ApiProperty()
  dueToday!: number;

  @ApiProperty()
  waitingOnOthers!: number;

  @ApiProperty()
  fyi!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: TodayFeedKpiCountsDto })
  kpi!: TodayFeedKpiCountsDto;
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
