import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { CreateManualTaskDto } from './create-task.dto';
import { UNIFIED_TASK_STATUSES } from './unified-task.dto';

export class UpdateManualTaskDto extends PartialType(CreateManualTaskDto) {
  @ApiPropertyOptional({ description: 'Task status', enum: UNIFIED_TASK_STATUSES })
  @IsOptional()
  @IsIn([...UNIFIED_TASK_STATUSES])
  status?: string;
}
