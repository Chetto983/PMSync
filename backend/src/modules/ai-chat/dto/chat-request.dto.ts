import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';

/**
 * DTO for AI chat streaming endpoint
 * POST /ai/chat
 *
 * Phase 24: Backend Core Pipeline
 */
export class ChatRequestDto {
  @ApiProperty({
    description: 'The user message to send to the AI assistant',
    example: 'Summarize my unread emails from today',
    maxLength: 10000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message!: string;

  @ApiPropertyOptional({
    description:
      'Existing conversation ID to continue. If omitted, a new conversation is created.',
    example: 'clxyz123abc',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Override the default AI model (e.g. qwen/qwen3.5-flash-02-23)',
    example: 'qwen/qwen3.5-plus-02-15',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Preferred locale for AI responses and runtime context',
    example: 'it',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}
