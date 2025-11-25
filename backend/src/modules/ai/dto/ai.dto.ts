import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * DTO for classic chat completion
 * POST /ai/chat
 */
export class ChatDto {
  @ApiProperty({
    description: 'The user message to process',
    example: 'Summarize my emails from today',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message: string;

  @ApiPropertyOptional({
    description: 'Previous conversation history for context',
    type: 'array',
  })
  @IsOptional()
  @IsArray()
  conversationHistory?: Array<{ role: string; content: string }>;

  @ApiPropertyOptional({
    description: 'Existing conversation ID to continue',
    example: 'conv_abc123',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;
}

/**
 * History item for agent conversations
 */
export class AgentHistoryItemDto {
  @ApiProperty({ description: 'Role of the message sender', enum: ['user', 'assistant'] })
  @IsString()
  role: string;

  @ApiProperty({ description: 'Content of the message' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Intermediate steps from tool execution' })
  @IsOptional()
  @IsArray()
  steps?: Array<{ tool: string; output: string }>;
}

/**
 * DTO for agentic workflow
 * POST /ai/agent
 */
export class AgentDto {
  @ApiProperty({
    description: 'The user message/prompt to process',
    example: 'Find emails from John about the project deadline',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message: string;

  @ApiPropertyOptional({
    description: 'Session ID to continue an existing conversation',
    example: 'session_xyz789',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'Conversation history with tool execution steps',
    type: [AgentHistoryItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentHistoryItemDto)
  history?: AgentHistoryItemDto[];

  @ApiPropertyOptional({
    description: 'Locale for response language (e.g., en, it, es)',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}

/**
 * DTO for creating a new chat session
 * POST /ai/chat/sessions
 */
export class CreateSessionDto {
  @ApiPropertyOptional({
    description: 'Locale for the session',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}

/**
 * DTO for email-based AI operations (summarize, smart-reply, categorize)
 */
export class EmailAiDto {
  @ApiPropertyOptional({
    description: 'Locale for response language',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}

/**
 * Response DTOs for Swagger documentation
 */
export class ChatResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ description: 'AI response text' })
  response: string;
}

export class SessionResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ description: 'The chat session object' })
  session: {
    id: string;
    tenantId: string;
    userId: string;
    title: string;
    messages: unknown; // JsonValue from Prisma
    createdAt: Date;
    updatedAt: Date;
  };
}

export class SessionListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ description: 'List of chat sessions', type: 'array' })
  sessions: Array<{
    id: string;
    tenantId: string;
    userId: string;
    title: string;
    messages: unknown; // JsonValue from Prisma
    createdAt: Date;
    updatedAt: Date;
  }>;
}

export class AgentResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ description: 'Session ID' })
  sessionId: string;

  @ApiProperty({ description: 'Updated session object' })
  session: object;

  @ApiProperty({ description: 'All messages in the conversation' })
  messages: Array<{ role: string; content: string; steps?: object[] }>;

  @ApiProperty({ description: 'AI response text' })
  response: string;

  @ApiProperty({ description: 'Tool execution steps' })
  steps: Array<{ tool: string; output: string }>;
}

export class SummaryResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    description: 'AI-generated summary of the email',
    example: 'This email discusses the Q4 budget proposal and requests approval by Friday.',
  })
  summary: string;
}

export class SmartReplyResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    description: 'Array of suggested reply options',
    example: ['Thanks for the update!', 'I\'ll review and get back to you.', 'Could you provide more details?'],
  })
  suggestions: string[];
}

export class CategorizeResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    description: 'Suggested labels for the email',
    example: ['work', 'urgent', 'finance'],
  })
  labels: string[];
}
