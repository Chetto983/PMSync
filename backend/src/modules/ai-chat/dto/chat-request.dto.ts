import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
  IsArray,
} from 'class-validator';

/**
 * DTO for AI chat streaming endpoint
 * POST /ai/chat
 *
 * Supports TWO body formats:
 *
 * 1. **Standard AI SDK format** (from useChat + AssistantChatTransport):
 *    { id, messages: UIMessage[], trigger, messageId }
 *
 * 2. **Legacy format** (from Telegram, CLI, or other non-SDK consumers):
 *    { message, conversationId }
 *
 * The controller extracts the user message and conversation ID from either format.
 */
export class ChatRequestDto {
  // ========== Standard AI SDK fields ==========

  @ApiPropertyOptional({
    description: 'Chat/conversation ID (standard AI SDK field)',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description:
      'Full message history from the client (standard AI SDK UIMessage[] format).',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  messages?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({
    description: 'Trigger type from AI SDK',
  })
  @IsOptional()
  @IsString()
  trigger?: string;

  @ApiPropertyOptional({
    description: 'Message ID from AI SDK',
  })
  @IsOptional()
  @IsString()
  messageId?: string;

  @ApiPropertyOptional({
    description: 'Tool schemas forwarded by AssistantChatTransport (ignored by backend)',
  })
  @IsOptional()
  @IsObject()
  tools?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Request metadata forwarded by AssistantChatTransport (ignored by backend)',
  })
  @IsOptional()
  metadata?: unknown;

  // ========== Legacy fields ==========

  @ApiPropertyOptional({
    description:
      'The user message (legacy format). Takes precedence over messages[].',
    maxLength: 10000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  message?: string;

  @ApiPropertyOptional({
    description: 'Existing conversation ID to continue (legacy format).',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Override the default AI model',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Preferred locale for AI responses and runtime context',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}

// ========== Extraction helpers (used by controller) ==========

/**
 * Extract the user message text from either format.
 * Priority: legacy message > last user message from messages[]
 */
export function extractUserMessageFromDto(dto: ChatRequestDto): string {
  if (dto.message) return dto.message;

  if (dto.messages?.length) {
    for (let i = dto.messages.length - 1; i >= 0; i--) {
      const msg = dto.messages[i];
      if (msg.role !== 'user') continue;

      // UIMessage format: parts array
      const parts = msg.parts;
      if (Array.isArray(parts) && parts.length > 0) {
        return (parts as Array<{ type: string; text?: string }>)
          .filter((p) => p.type === 'text' && typeof p.text === 'string')
          .map((p) => p.text!)
          .join('');
      }

      // Fallback: content string
      if (typeof msg.content === 'string') return msg.content;
    }
  }

  return '';
}

/**
 * IDs that are not real backend conversation IDs.
 * AssistantChatTransport sends these before initialize() resolves.
 */
const PLACEHOLDER_IDS = new Set(['DEFAULT_THREAD_ID']);

function isValidConversationId(id: string | undefined): id is string {
  if (!id || id.length === 0) return false;
  if (PLACEHOLDER_IDS.has(id)) return false;
  if (id.startsWith('__LOCALID_')) return false;
  return true;
}

/**
 * Resolve the conversation ID from either format.
 * Priority: legacy conversationId > standard id field.
 * Filters out placeholder IDs from the AI SDK transport.
 */
export function resolveConversationIdFromDto(
  dto: ChatRequestDto,
): string | undefined {
  if (isValidConversationId(dto.conversationId)) return dto.conversationId;
  if (isValidConversationId(dto.id)) return dto.id;
  return undefined;
}
