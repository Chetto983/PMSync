import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const TASK_SOURCE_TYPES = ['follow_up', 'reminder', 'deal_action', 'ticket', 'manual'] as const;
export type TaskSourceType = (typeof TASK_SOURCE_TYPES)[number];

export const UNIFIED_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'dismissed', 'expired'] as const;
export type UnifiedTaskStatus = (typeof UNIFIED_TASK_STATUSES)[number];

export const UNIFIED_TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type UnifiedTaskPriority = (typeof UNIFIED_TASK_PRIORITIES)[number];

export class UnifiedTaskDto {
  @ApiProperty({ description: 'Unique task ID (composite: sourceType_sourceId)' })
  id!: string;

  @ApiProperty({ enum: TASK_SOURCE_TYPES, description: 'Origin system of the task' })
  sourceType!: TaskSourceType;

  @ApiProperty({ description: 'Original record ID in the source table' })
  sourceId!: string;

  @ApiProperty({ description: 'Task title' })
  title!: string;

  @ApiPropertyOptional({ description: 'Task description', nullable: true })
  description!: string | null;

  @ApiProperty({ enum: UNIFIED_TASK_STATUSES, description: 'Normalized status' })
  status!: UnifiedTaskStatus;

  @ApiProperty({ enum: UNIFIED_TASK_PRIORITIES, description: 'Normalized priority' })
  priority!: UnifiedTaskPriority;

  @ApiPropertyOptional({ description: 'Due date in ISO 8601', nullable: true })
  dueDate!: string | null;

  @ApiPropertyOptional({ description: 'Associated contact name', nullable: true })
  contactName!: string | null;

  @ApiPropertyOptional({ description: 'Associated contact ID', nullable: true })
  contactId!: string | null;

  @ApiPropertyOptional({ description: 'Associated deal ID', nullable: true })
  dealId!: string | null;

  @ApiPropertyOptional({ description: 'Associated email ID', nullable: true })
  emailId!: string | null;

  @ApiPropertyOptional({ description: 'Associated ticket ID', nullable: true })
  ticketId!: string | null;

  @ApiProperty({ description: 'Creation date in ISO 8601' })
  createdAt!: string;

  @ApiPropertyOptional({ description: 'Last update date in ISO 8601', nullable: true })
  updatedAt!: string | null;
}

export class TaskCountsDto {
  @ApiProperty() follow_up!: number;
  @ApiProperty() reminder!: number;
  @ApiProperty() deal_action!: number;
  @ApiProperty() ticket!: number;
  @ApiProperty() manual!: number;
}

export class TaskMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty({ type: TaskCountsDto }) counts!: TaskCountsDto;
}

export class UnifiedTaskListResponseDto {
  @ApiProperty({ type: [UnifiedTaskDto] }) data!: UnifiedTaskDto[];
  @ApiProperty({ type: TaskMetaDto }) meta!: TaskMetaDto;
}
