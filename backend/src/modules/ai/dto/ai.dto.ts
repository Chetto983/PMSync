import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Tone for smart reply generation (formal, casual, technical)',
    example: 'casual',
    enum: ['formal', 'casual', 'technical'],
  })
  @IsOptional()
  @IsString()
  tone?: string;
}

/**
 * DTO for AI-assisted email composition
 */
export class ComposeEmailDto {
  @ApiProperty({
    description: 'Prompt describing the email to compose',
    example: 'Write a polite follow-up about the pending contract',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  prompt: string;

  @ApiPropertyOptional({
    description: 'Suggested recipients for context',
    type: [String],
    example: ['recipient@example.com'],
  })
  @IsOptional()
  @IsArray()
  to?: string[];

  @ApiPropertyOptional({
    description: 'Optional subject hint',
    example: 'Contract follow-up',
  })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Tone preference',
    enum: ['formal', 'casual', 'technical'],
    example: 'formal',
  })
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiPropertyOptional({
    description: 'Locale for the composed email',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({
    description: 'Optional thread/email context for better grounding',
    type: 'array',
    example: [{ subject: 'Previous subject', body: 'Thread content here' }],
  })
  @IsOptional()
  @IsArray()
  threadContext?: Array<{ subject?: string; body?: string }>;

  @ApiPropertyOptional({
    description: 'Sender name for signature personalization',
    example: 'Mario Rossi',
  })
  @IsOptional()
  @IsString()
  senderName?: string;

  @ApiPropertyOptional({
    description: 'Custom email signature to append (e.g., name, title, company)',
    example: 'Best regards,\nMario Rossi\nSoftware Engineer | Acme Corp\n+39 123 456 7890',
  })
  @IsOptional()
  @IsString()
  signature?: string;
}

export class ComposeEmailResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional({ type: () => AiResponseMetaDto })
  meta?: AiResponseMetaDto;

  @ApiProperty({ description: 'Composed email body' })
  body: string;

  @ApiPropertyOptional({ description: 'Suggested subject (if generated)' })
  subject?: string;
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

  @ApiPropertyOptional({ type: () => AiResponseMetaDto })
  meta?: AiResponseMetaDto;

  @ApiProperty({
    description: 'AI-generated summary of the email',
    example: 'This email discusses the Q4 budget proposal and requests approval by Friday.',
  })
  summary: string;
}

export class SmartReplyResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional({ type: () => AiResponseMetaDto })
  meta?: AiResponseMetaDto;

  @ApiProperty({
    description: 'Array of suggested reply options',
    example: ['Thanks for the update!', 'I\'ll review and get back to you.', 'Could you provide more details?'],
  })
  suggestions: string[];
}

export class CategorizeResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional({ type: () => AiResponseMetaDto })
  meta?: AiResponseMetaDto;

  @ApiProperty({
    description: 'Suggested labels for the email',
    example: ['work', 'urgent', 'finance'],
  })
  labels: string[];
}

/**
 * Sentiment analysis result - 2025 Best Practice with ABSA (Aspect-Based Sentiment Analysis)
 * Includes emotion detection, polarity, urgency, and churn risk.
 *
 * References:
 * - Aspect-based sentiment for granular insights
 * - Emotion detection beyond simple polarity
 * - ChurnRisk tagging for escalation prediction
 */
export class SentimentResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional({ type: () => AiResponseMetaDto })
  meta?: AiResponseMetaDto;

  @ApiProperty({
    description: 'Overall sentiment polarity',
    enum: ['positive', 'negative', 'neutral', 'mixed'],
    example: 'positive',
  })
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';

  @ApiProperty({
    description: 'Detected communication tone',
    enum: ['formal', 'casual', 'urgent', 'friendly', 'cold', 'assertive'],
    example: 'formal',
  })
  tone: string;

  @ApiProperty({
    description: 'Primary emotion detected (beyond polarity)',
    enum: ['joy', 'gratitude', 'excitement', 'neutral', 'concern', 'frustration', 'anger', 'disappointment', 'sadness'],
    example: 'gratitude',
  })
  emotion: string;

  @ApiProperty({
    description: 'Emotional intensity (0-1)',
    example: 0.7,
  })
  emotionalIntensity: number;

  @ApiProperty({
    description: 'Confidence score (0-1)',
    example: 0.85,
  })
  confidence: number;

  @ApiProperty({
    description: 'Churn/escalation risk indicator',
    example: false,
  })
  churnRisk: boolean;

  @ApiPropertyOptional({
    description: 'Aspect-based sentiments (subject, service, timeline, etc.)',
    example: { subject: 'positive', timeline: 'negative', service: 'neutral' },
  })
  aspects?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Reasoning for the sentiment analysis',
    example: 'The email uses polite language and expresses gratitude for quick resolution.',
  })
  reasoning?: string;
}

/**
 * Priority calculation result
 */
export class PriorityResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional({ type: () => AiResponseMetaDto })
  meta?: AiResponseMetaDto;

  @ApiProperty({
    description: 'Priority score (1-10)',
    example: 8,
  })
  score: number;

  @ApiProperty({
    description: 'Urgency level',
    enum: ['high', 'medium', 'low'],
    example: 'high',
  })
  urgency: string;

  @ApiProperty({
    description: 'Recommended action timing',
    enum: ['handle_now', 'handle_today', 'handle_this_week', 'can_wait', 'archive'],
    example: 'handle_today',
  })
  recommendation: string;

  @ApiProperty({
    description: 'Factors contributing to priority',
    type: [String],
    example: ['deadline mentioned', 'sender is VIP', 'action required'],
  })
  factors: string[];
}

/**
 * Comprehensive email analysis result
 */
export class AnalyzeEmailResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional({ type: () => AiResponseMetaDto })
  meta?: AiResponseMetaDto;

  @ApiProperty({
    description: 'Sentiment',
    enum: ['positive', 'negative', 'neutral'],
  })
  sentiment: string;

  @ApiProperty({
    description: 'Tone',
    enum: ['formal', 'casual', 'urgent', 'friendly'],
  })
  tone: string;

  @ApiProperty({
    description: 'Urgency level',
    enum: ['high', 'medium', 'low'],
  })
  urgency: string;

  @ApiProperty({
    description: 'Primary intent',
    example: 'action_required',
  })
  intent: string;

  @ApiProperty({
    description: 'Priority score (1-10)',
    example: 7,
  })
  priority: number;

  @ApiProperty({
    description: 'Risk of escalation',
    example: false,
  })
  escalationRisk: boolean;

  @ApiProperty({
    description: 'Key topics extracted',
    type: [String],
    example: ['budget', 'deadline', 'approval'],
  })
  keyTopics: string[];

  @ApiProperty({
    description: 'Suggested response timing',
    enum: ['immediate', 'within_day', 'within_week', 'optional'],
  })
  suggestedResponse: string;

  @ApiProperty({
    description: 'Confidence score',
    example: 0.9,
  })
  confidence: number;
}

/**
 * DTO for priority calculation with sender context
 */
export class PriorityRequestDto {
  @ApiPropertyOptional({
    description: 'Known sender importance level',
    enum: ['vip', 'important', 'normal', 'low'],
    example: 'normal',
  })
  @IsOptional()
  @IsString()
  senderImportance?: 'vip' | 'important' | 'normal' | 'low';

  @ApiPropertyOptional({
    description: 'Locale for response language',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class AiResponseMetaDto {
  @ApiProperty({ example: 'email-unified-analysis' })
  operation: string;

  @ApiProperty({ example: 'unified-email-v1' })
  version: string;

  @ApiProperty({ enum: ['live', 'cache', 'fallback'], example: 'cache' })
  source: 'live' | 'cache' | 'fallback';

  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' })
  status: 'ok' | 'degraded';

  @ApiProperty({ example: '2026-03-31T12:34:56.000Z' })
  generatedAt: string;

  @ApiPropertyOptional({ example: 'it' })
  locale?: string;

  @ApiPropertyOptional({ example: 'mistralai/mistral-small-3.1-24b-instruct' })
  model?: string;

  @ApiPropertyOptional({ type: [String], example: ['structured_output_unavailable'] })
  warnings?: string[];
}

export class UpdateFollowUpStatusDto {
  @ApiProperty({
    enum: ['PENDING', 'RESOLVED', 'EXPIRED'],
    example: 'RESOLVED',
  })
  @IsString()
  @IsIn(['PENDING', 'RESOLVED', 'EXPIRED'])
  status: 'PENDING' | 'RESOLVED' | 'EXPIRED';
}

export class SnoozeFollowUpDto {
  @ApiProperty({
    example: '2026-04-02T09:00:00.000Z',
    description: 'New due date as an ISO-8601 future timestamp',
  })
  @IsString()
  @IsISO8601()
  dueDate: string;
}
