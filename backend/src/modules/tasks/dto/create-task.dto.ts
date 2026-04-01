import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { UNIFIED_TASK_PRIORITIES } from './unified-task.dto';

export class CreateManualTaskDto {
  @ApiProperty({ description: 'Task title (max 200 chars)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Task description (max 2000 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Priority level', enum: UNIFIED_TASK_PRIORITIES })
  @IsOptional()
  @IsIn([...UNIFIED_TASK_PRIORITIES])
  priority?: string;

  @ApiPropertyOptional({ description: 'Due date in ISO 8601' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Associated contact ID' })
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Associated deal ID' })
  @IsOptional()
  @IsString()
  dealId?: string;

  @ApiPropertyOptional({ description: 'Associated email ID' })
  @IsOptional()
  @IsString()
  emailId?: string;
}
