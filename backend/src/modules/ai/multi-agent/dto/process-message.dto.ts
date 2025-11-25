import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentIntent } from '../interfaces/agent-context.interface';

class HistoryMessageDto {
  @ApiProperty({ enum: ['user', 'assistant', 'system'] })
  @IsEnum(['user', 'assistant', 'system'])
  role: 'user' | 'assistant' | 'system';

  @ApiProperty()
  @IsString()
  content: string;
}

export class ProcessMessageDto {
  @ApiProperty({ description: 'The user message to process' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Session ID for conversation continuity' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Conversation history', type: [HistoryMessageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoryMessageDto)
  history?: HistoryMessageDto[];

  @ApiPropertyOptional({ description: 'Force a specific intent', enum: AgentIntent })
  @IsOptional()
  @IsEnum(AgentIntent)
  knownIntent?: AgentIntent;

  @ApiPropertyOptional({ description: 'Force a specific agent to handle the request' })
  @IsOptional()
  @IsString()
  forceAgent?: string;

  @ApiPropertyOptional({ description: 'Auto-approve threshold (0-1)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  autoApproveThreshold?: number;

  @ApiPropertyOptional({ description: 'User preferred locale (en, it, es, fr, de)' })
  @IsOptional()
  @IsString()
  locale?: string;
}
