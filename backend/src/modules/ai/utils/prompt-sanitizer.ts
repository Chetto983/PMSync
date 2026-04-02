/**
 * Prompt Sanitizer Utility
 *
 * Sanitizes user-provided content before including it in LLM prompts.
 * Helps prevent prompt injection attacks by filtering known injection patterns.
 *
 * Configuration via environment variables:
 * - AI_PROMPT_MAX_LENGTH: Maximum prompt content length (default: 10000)
 * - AI_PROMPT_MAX_TOTAL_LENGTH: Maximum total prompt length (default: 100000)
 * - AI_PROMPT_STRIP_SYSTEM: Strip system prompt overrides (default: true)
 * - AI_PROMPT_STRIP_CODE: Strip code blocks (default: false)
 * - AI_PROMPT_ESCAPE_TOKENS: Escape special LLM tokens (default: true)
 *
 * @see OWASP Top 10 2025 - A04: Insecure Design
 */

export interface SanitizeOptions {
  /** Maximum length of content (default from AI_PROMPT_MAX_LENGTH or 10000) */
  maxLength?: number;
  /** Remove patterns that could override system prompts (default from AI_PROMPT_STRIP_SYSTEM or true) */
  stripSystemPrompts?: boolean;
  /** Remove code blocks that might contain injection attempts (default from AI_PROMPT_STRIP_CODE or false) */
  stripCodeBlocks?: boolean;
  /** Escape special LLM tokens like <|endoftext|> (default from AI_PROMPT_ESCAPE_TOKENS or true) */
  escapeSpecialTokens?: boolean;
}

/**
 * Get default options from environment variables
 */
function getDefaultOptions(): SanitizeOptions {
  return {
    maxLength: parseInt(process.env.AI_PROMPT_MAX_LENGTH || '10000', 10),
    stripSystemPrompts: process.env.AI_PROMPT_STRIP_SYSTEM !== 'false',
    stripCodeBlocks: process.env.AI_PROMPT_STRIP_CODE === 'true',
    escapeSpecialTokens: process.env.AI_PROMPT_ESCAPE_TOKENS !== 'false',
  };
}

/**
 * Get maximum total prompt length from environment
 */
function getMaxTotalPromptLength(): number {
  return parseInt(process.env.AI_PROMPT_MAX_TOTAL_LENGTH || '100000', 10);
}

/**
 * Patterns commonly used in prompt injection attacks
 */
const INJECTION_PATTERNS = [
  // Direct instruction override attempts
  /ignore\s+(all\s+|previous\s+|above\s+)?instructions?/gi,
  /disregard\s+(all\s+|previous\s+|above\s+)?instructions?/gi,
  /forget\s+(all\s+|previous\s+|above\s+)?instructions?/gi,
  /override\s+(all\s+|previous\s+|above\s+)?instructions?/gi,

  // Role/persona hijacking
  /you\s+are\s+now\s+/gi,
  /act\s+as\s+(if\s+you\s+are\s+)?/gi,
  /pretend\s+(to\s+be|you\s+are)/gi,
  /your\s+new\s+(role|instructions?|persona)/gi,

  // System prompt extraction
  /reveal\s+your\s+(system\s+)?prompt/gi,
  /show\s+(me\s+)?your\s+instructions/gi,
  /what\s+are\s+your\s+instructions/gi,
  /print\s+your\s+(system\s+)?prompt/gi,

  // Delimiter exploitation
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
  /<<SYS>>/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /### instruction/gi,
  /### system/gi,

  // Context manipulation
  /new\s+instructions?\s*:/gi,
  /updated?\s+instructions?\s*:/gi,
  /additional\s+instructions?\s*:/gi,
  /important\s+instructions?\s*:/gi,
];

/**
 * Special tokens used by various LLMs that could be exploited
 */
const SPECIAL_TOKENS = [
  '<|endoftext|>',
  '<|padding|>',
  '<|startoftext|>',
  '<|assistant|>',
  '<|user|>',
  '<|system|>',
  '</s>',
  '<s>',
  '[INST]',
  '[/INST]',
  '<<SYS>>',
  '<</SYS>>',
];

/**
 * Sanitizes content for safe inclusion in LLM prompts.
 *
 * @param content - User-provided content to sanitize
 * @param options - Sanitization options
 * @returns Sanitized content safe for LLM prompt inclusion
 *
 * @example
 * ```typescript
 * const sanitized = sanitizeForLLM(userEmail, { maxLength: 5000 });
 * const prompt = `[USER_CONTENT]\n${sanitized}\n[/USER_CONTENT]\nAnalyze above.`;
 * ```
 */
export function sanitizeForLLM(
  content: string,
  options: SanitizeOptions = {},
): string {
  const opts = { ...getDefaultOptions(), ...options };
  let sanitized = content;

  // 1. Escape special tokens first
  if (opts.escapeSpecialTokens) {
    for (const token of SPECIAL_TOKENS) {
      sanitized = sanitized.split(token).join(`[FILTERED:${token.slice(1, -1)}]`);
    }
  }

  // 2. Remove potential injection patterns
  if (opts.stripSystemPrompts) {
    for (const pattern of INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[FILTERED]');
    }
  }

  // 3. Optionally strip code blocks
  if (opts.stripCodeBlocks) {
    sanitized = sanitized.replace(/```[\s\S]*?```/g, '[CODE_BLOCK_REMOVED]');
    sanitized = sanitized.replace(/`[^`]+`/g, '[INLINE_CODE_REMOVED]');
  }

  // 4. Enforce length limit
  if (opts.maxLength && sanitized.length > opts.maxLength) {
    sanitized = sanitized.slice(0, opts.maxLength);
  }

  return sanitized;
}

/**
 * Wraps user content with clear delimiters for the LLM.
 * This helps the model distinguish between system instructions and user content.
 *
 * @param content - Already sanitized content
 * @returns Content wrapped with clear delimiters
 */
export function wrapUserContent(content: string): string {
  return `[USER_CONTENT_START]\n${content}\n[USER_CONTENT_END]`;
}

/**
 * Validates prompt length to prevent DoS attacks.
 *
 * @param prompt - Full prompt string
 * @param maxLength - Maximum allowed length (default from AI_PROMPT_MAX_TOTAL_LENGTH or 100000)
 * @throws Error if prompt exceeds maximum length
 */
export function validatePromptLength(
  prompt: string,
  maxLength?: number,
): void {
  const limit = maxLength ?? getMaxTotalPromptLength();
  if (prompt.length > limit) {
    throw new Error(
      `Prompt length (${prompt.length}) exceeds maximum allowed (${limit})`,
    );
  }
}

/**
 * Truncate a single prompt line, collapsing whitespace and adding ellipsis.
 */
export function truncatePromptLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (maxLength <= 0) return '';
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return normalized.slice(0, maxLength);
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

/**
 * Build an XML-tagged prompt section from lines, with optional length budget.
 */
export function buildTaggedPromptSection(
  tag: string,
  lines: string[],
  maxLength?: number,
  prefix?: string,
): string {
  if (lines.length === 0) return '';

  const open = `\n<${tag}>\n`;
  const prefixBlock = prefix ? `${prefix}\n` : '';
  const close = `\n</${tag}>`;
  const limit = typeof maxLength === 'number' ? maxLength : Number.MAX_SAFE_INTEGER;
  const overhead = open.length + prefixBlock.length + close.length;
  if (limit <= overhead) return '';

  const accepted: string[] = [];
  let currentLength = overhead;

  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized) continue;

    const lineCost = normalized.length + (accepted.length > 0 ? 1 : 0);
    if (currentLength + lineCost > limit) {
      const available = limit - currentLength - (accepted.length > 0 ? 1 : 0);
      if (available > 6) {
        accepted.push(truncatePromptLine(normalized, available));
      }
      break;
    }

    accepted.push(normalized);
    currentLength += lineCost;
  }

  if (accepted.length === 0) return '';
  return `${open}${prefixBlock}${accepted.join('\n')}${close}`;
}

/**
 * Sanitizes data before logging to prevent sensitive info leakage.
 *
 * @param data - Data object to sanitize
 * @returns Sanitized copy of the data
 */
export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'authorization',
    'cookie',
    'body',
    'content',
    'emailBody',
    'bodyText',
    'bodyHtml',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
