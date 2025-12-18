import type { AppTranslations } from '@/locales';

/**
 * Chat message for AI compose assistant
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestion?: string;
  isStreaming?: boolean;
}

/**
 * Tone type for email composition
 */
export type ToneType = 'formal' | 'casual' | 'technical';

/**
 * Quick suggestion preset
 */
export interface QuickSuggestion {
  label: string;
  prompt: string;
}

/**
 * Props for AiChatPanel component
 */
export interface AiChatPanelProps {
  /** Current email body for context */
  emailBody: string;
  /** Current subject for context */
  emailSubject: string;
  /** Recipients for context */
  recipients: string[];
  /** Mode: compose, reply, forward */
  mode: 'compose' | 'reply' | 'forward';
  /** Callback when user wants to insert suggestion */
  onInsertSuggestion: (text: string) => void;
  /** Callback when user wants to replace body */
  onReplaceBody: (text: string) => void;
  /** Callback when user wants to update subject */
  onUpdateSubject: (text: string) => void;
  /** Translation object */
  t: AppTranslations;
  /** Locale for AI */
  locale?: string;
}

/**
 * Props for ChatMessageBubble component
 */
export interface ChatMessageBubbleProps {
  message: ChatMessage;
  onCopy: (message: ChatMessage) => void;
  onInsert: (message: ChatMessage) => void;
  copiedId: string | null;
  t: AppTranslations;
}
