import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  TASK_SOURCE_TYPES,
  UNIFIED_TASK_STATUSES,
  UNIFIED_TASK_PRIORITIES,
  type TaskSourceType,
  type UnifiedTaskStatus,
  type UnifiedTaskPriority,
} from './unified-task.dto';

export class ListTasksQueryDto {
  @ApiPropertyOptional({ enum: TASK_SOURCE_TYPES, isArray: true, description: 'Filter by source type' })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsIn([...TASK_SOURCE_TYPES], { each: true })
  sourceType?: TaskSourceType[];

  @ApiPropertyOptional({ enum: UNIFIED_TASK_STATUSES, isArray: true, description: 'Filter by status (default: pending, in_progress)' })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsIn([...UNIFIED_TASK_STATUSES], { each: true })
  status?: UnifiedTaskStatus[];

  @ApiPropertyOptional({ enum: UNIFIED_TASK_PRIORITIES, isArray: true, description: 'Filter by priority' })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsIn([...UNIFIED_TASK_PRIORITIES], { each: true })
  priority?: UnifiedTaskPriority[];

  @ApiPropertyOptional({ description: 'Tasks due before this ISO 8601 date' })
  @IsOptional()
  @IsISO8601()
  dueBefore?: string;

  @ApiPropertyOptional({ description: 'Tasks due after this ISO 8601 date' })
  @IsOptional()
  @IsISO8601()
  dueAfter?: string;

  @ApiPropertyOptional({ description: 'Filter by associated contact ID' })
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Page number (default: 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (default: 50, max: 100)', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['dueDate', 'createdAt', 'priority'], default: 'dueDate' })
  @IsOptional()
  @IsIn(['dueDate', 'createdAt', 'priority'])
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: string;
}
