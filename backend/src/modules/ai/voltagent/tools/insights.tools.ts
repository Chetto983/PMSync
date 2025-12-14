/**
 * VoltAgent Email Insights Tools
 *
 * AI-powered email analysis and composition tools for VoltAgent.
 * Refactored from email-insights.service.ts into reusable tools.
 *
 * Performance optimizations (2025-12-14):
 * - Email content caching to avoid redundant DB queries
 * - Model routing: fast tier for simple scoring tasks
 * - Intent-based pre-filtering for action item extraction
 *
 * Tools:
 * - summarize_email: Generate concise email summaries
 * - analyze_sentiment: Analyze email sentiment and tone
 * - compose_reply: Compose intelligent reply drafts
 * - extract_action_items: Extract action items from emails
 * - categorize_email: Suggest labels for email categorization
 * - generate_smart_replies: Generate quick reply suggestions
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralService } from '../../services/mistral.service';
import { WritingStyleService } from '../services/writing-style.service';
import { getToolTranslations, type SupportedLocale } from '../locales';

/**
 * Default fallback labels when DB is empty
 */
const DEFAULT_LABELS = ['Important', 'Follow-up', 'Info'];

/**
 * Helper to get available labels from database for tenant
 */
async function getAvailableLabels(prisma: PrismaService, tenantId: string): Promise<string[]> {
  const labels = await prisma.userLabel.findMany({
    where: { tenantId },
    select: { name: true },
    orderBy: { orderIndex: 'asc' },
    take: 20, // Limit for prompt efficiency
  });

  if (labels.length === 0) {
    return DEFAULT_LABELS;
  }

  return labels.map((l) => l.name);
}

/**
 * Email record from database
 */
interface EmailRecord {
  id: string;
  subject: string | null;
  from: string;
  to: string[];
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  receivedAt: Date;
}

/**
 * Tool options for insights tools
 */
export interface InsightsToolOptions {
  prisma: PrismaService;
  mistral: MistralService;
  writingStyle?: WritingStyleService;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
}

/**
 * In-memory cache for email content within a tool session
 * Prevents redundant DB queries when analyzing same email multiple times
 * TTL: 5 minutes (cleared on module reload)
 */
const emailContentCache = new Map<string, { email: EmailRecord; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedEmail(emailId: string): EmailRecord | null {
  const cached = emailContentCache.get(emailId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.email;
  }
  emailContentCache.delete(emailId);
  return null;
}

function setCachedEmail(emailId: string, email: EmailRecord): void {
  // Limit cache size to prevent memory bloat
  if (emailContentCache.size > 100) {
    // Remove oldest entries
    const entries = Array.from(emailContentCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 20; i++) {
      emailContentCache.delete(entries[i][0]);
    }
  }
  emailContentCache.set(emailId, { email, timestamp: Date.now() });
}

/**
 * Helper to get email from database with caching
 * Performance optimization: avoids redundant DB queries when same email is analyzed multiple times
 */
async function getEmail(prisma: PrismaService, tenantId: string, emailId: string): Promise<EmailRecord | null> {
  // Check cache first
  const cached = getCachedEmail(emailId);
  if (cached) {
    return cached;
  }

  // Query database
  const email = await prisma.email.findFirst({
    where: { id: emailId, tenantId },
    select: {
      id: true,
      subject: true,
      from: true,
      to: true,
      bodyText: true,
      bodyHtml: true,
      snippet: true,
      receivedAt: true,
    },
  });

  // Cache the result
  if (email) {
    setCachedEmail(emailId, email);
  }

  return email;
}

/**
 * Helper to extract email content
 */
function extractEmailContent(
  email: EmailRecord,
  t: ReturnType<typeof getToolTranslations>,
  maxLength = 6000,
): string {
  let content = '';

  if (email.bodyText && email.bodyText.trim().length > 0) {
    content = email.bodyText.trim();
  } else if (email.bodyHtml) {
    content = email.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } else if (email.snippet) {
    content = email.snippet.trim();
  } else {
    return t.insights.contentUnavailable;
  }

  return content.length > maxLength ? `${content.slice(0, maxLength)}...` : content;
}

/**
 * Helper to build email prompt using locale translations
 */
function buildEmailPrompt(
  email: EmailRecord,
  locale: SupportedLocale,
  t: ReturnType<typeof getToolTranslations>,
): string {
  const toList = email.to.join(', ');
  const noSubject = t.insights.noSubject;
  const header =
    locale === 'it'
      ? `Oggetto: ${email.subject || noSubject}\nDa: ${email.from}\nA: ${toList}`
      : `Subject: ${email.subject || noSubject}\nFrom: ${email.from}\nTo: ${toList}`;

  const content = extractEmailContent(email, t);

  return `${header}\n\n${t.insights.emailBody}\n${content}`;
}

/**
 * Helper to strip markdown from AI output
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[\-\*•]\s+/gm, '- ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Helper to parse JSON array from AI output
 */
function parseArrayFromPayload(payload: string, key: string): string[] {
  try {
    let cleaned = payload.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed[key])) {
      return parsed[key].map((item: unknown) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall through to return empty array
  }
  return [];
}

/**
 * Creates the summarize_email tool
 */
export function createSummarizeEmailTool(options: InsightsToolOptions) {
  const { prisma, mistral, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'summarize_email',
    description: t.insights.summarize.description,
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to summarize'),
    }),
    execute: async ({ emailId }) => {
      const email = await getEmail(prisma, tenantId, emailId);
      if (!email) {
        return { error: t.email.notFound };
      }

      const userPrompt = buildEmailPrompt(email, locale, t);

      const summary = await mistral.completePrompt({
        systemPrompt: t.insights.summarize.systemPrompt,
        userPrompt,
        temperature: 0.2,
        maxTokens: 400,
      });

      return {
        emailId,
        subject: email.subject,
        from: email.from,
        summary: stripMarkdown(summary.trim()),
      };
    },
  });
}

/**
 * Creates the analyze_sentiment tool
 */
export function createAnalyzeSentimentTool(options: InsightsToolOptions) {
  const { prisma, mistral, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'analyze_sentiment',
    description: t.insights.sentiment.description,
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to analyze'),
    }),
    execute: async ({ emailId }) => {
      const email = await getEmail(prisma, tenantId, emailId);
      if (!email) {
        return { error: t.email.notFound };
      }

      const userPrompt = buildEmailPrompt(email, locale, t);

      // Performance optimization: use fast model for sentiment scoring (3-4x faster)
      const raw = await mistral.completePrompt({
        systemPrompt: t.insights.sentiment.systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 300,
        modelTier: 'fast', // Use AI_MODEL_SIMPLE for sentiment analysis
      });

      try {
        let cleaned = raw.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

        const parsed = JSON.parse(cleaned);
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          sentiment: parsed.sentiment || 'neutral',
          tone: parsed.tone || 'casual',
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning || '',
        };
      } catch {
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          sentiment: 'neutral',
          tone: 'casual',
          confidence: 0.5,
          reasoning: raw,
        };
      }
    },
  });
}

/**
 * Creates the compose_reply tool
 */
export function createComposeReplyTool(options: InsightsToolOptions) {
  const { prisma, mistral, writingStyle, locale, tenantId, userId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'compose_reply',
    description: t.insights.compose.description,
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to reply to'),
      instructions: z.string().describe('User instructions for the reply'),
      tone: z.enum(['formal', 'casual', 'technical']).optional().describe('Tone for the reply'),
    }),
    execute: async ({ emailId, instructions, tone = 'casual' }) => {
      const email = await getEmail(prisma, tenantId, emailId);
      if (!email) {
        return { error: t.email.notFound };
      }

      // Get user writing style if available
      let styleSection = '';
      if (userId && writingStyle) {
        try {
          const style = await writingStyle.getStylePromptSection(tenantId, userId, locale);
          styleSection = style ?? '';
        } catch {
          // No style available
        }
      }

      // Get tone instruction from locale
      const toneInstruction = t.insights.tones[tone];
      const systemPrompt = t.insights.compose.systemPrompt(toneInstruction);

      const originalContext = buildEmailPrompt(email, locale, t);
      const userPrompt = [
        t.insights.compose.originalEmail,
        originalContext,
        '',
        styleSection,
        `${t.insights.compose.replyInstructions} ${instructions}`,
      ]
        .filter(Boolean)
        .join('\n');

      const raw = await mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.35,
        maxTokens: 800,
      });

      try {
        let cleaned = raw.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

        const parsed = JSON.parse(cleaned);
        return {
          emailId,
          replyTo: email.from,
          subject: parsed.subject || `Re: ${email.subject || ''}`,
          body: stripMarkdown(parsed.body || raw),
          tone,
        };
      } catch {
        return {
          emailId,
          replyTo: email.from,
          subject: `Re: ${email.subject || ''}`,
          body: stripMarkdown(raw),
          tone,
        };
      }
    },
  });
}

/**
 * Heuristic pre-filter: check if email likely contains action items
 * Performance optimization: skip expensive LLM call for emails unlikely to have actions
 */
const ACTION_KEYWORDS_EN = [
  'please', 'action', 'todo', 'to do', 'deadline', 'asap', 'urgent', 'required',
  'need', 'must', 'should', 'request', 'confirm', 'respond', 'reply', 'let me know',
  'by tomorrow', 'by friday', 'by end of', 'schedule', 'meeting', 'call', 'review',
];
const ACTION_KEYWORDS_IT = [
  'perfavore', 'azione', 'fare', 'scadenza', 'urgente', 'richiesto',
  'bisogna', 'deve', 'conferma', 'rispondi', 'fammi sapere',
  'entro domani', 'entro venerdì', 'riunione', 'chiamata', 'revisiona',
];

function likelyHasActionItems(content: string, locale: string): boolean {
  const keywords = locale === 'it' ? [...ACTION_KEYWORDS_IT, ...ACTION_KEYWORDS_EN] : ACTION_KEYWORDS_EN;
  const lowerContent = content.toLowerCase();
  return keywords.some((kw) => lowerContent.includes(kw));
}

/**
 * Creates the extract_action_items tool
 * Performance optimized with:
 * - Heuristic pre-filtering to skip emails without action indicators
 * - Fast model for extraction
 */
export function createExtractActionItemsTool(options: InsightsToolOptions) {
  const { prisma, mistral, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'extract_action_items',
    description: t.insights.actionItems.description,
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to analyze'),
    }),
    execute: async ({ emailId }) => {
      const email = await getEmail(prisma, tenantId, emailId);
      if (!email) {
        return { error: t.email.notFound };
      }

      // Performance optimization: heuristic pre-filter
      // Skip expensive LLM call if email doesn't contain action keywords
      const emailContent = extractEmailContent(email, t);
      if (!likelyHasActionItems(emailContent, locale)) {
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          actionItems: [],
          hasDeadlines: false,
          count: 0,
          skipped: true, // Indicate this was skipped due to heuristic
        };
      }

      const userPrompt = buildEmailPrompt(email, locale, t);

      // Performance optimization: use fast model for extraction
      const raw = await mistral.completePrompt({
        systemPrompt: t.insights.actionItems.systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 500,
        modelTier: 'fast', // Use AI_MODEL_SIMPLE for action extraction
      });

      try {
        let cleaned = raw.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

        const parsed = JSON.parse(cleaned);
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          actionItems: parsed.actionItems || [],
          hasDeadlines: parsed.hasDeadlines || false,
          count: (parsed.actionItems || []).length,
        };
      } catch {
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          actionItems: [],
          hasDeadlines: false,
          count: 0,
          rawAnalysis: raw,
        };
      }
    },
  });
}

/**
 * Creates the categorize_email tool
 */
export function createCategorizeEmailTool(options: InsightsToolOptions) {
  const { prisma, mistral, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'categorize_email',
    description: t.insights.categorize.description,
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to categorize'),
    }),
    execute: async ({ emailId }) => {
      const email = await getEmail(prisma, tenantId, emailId);
      if (!email) {
        return { error: t.email.notFound };
      }

      // Fetch available labels from database
      const availableLabels = await getAvailableLabels(prisma, tenantId);
      const labelsList = availableLabels.join(', ');

      const systemPrompt = t.insights.categorize.systemPrompt(labelsList);
      const userPrompt = buildEmailPrompt(email, locale, t);

      const raw = await mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 300,
      });

      let labels = parseArrayFromPayload(raw, 'labels');

      // Normalize and validate labels against available labels from DB
      labels = labels
        .map((label) => {
          const trimmed = label.trim().toLowerCase();
          return availableLabels.find((allowed) => allowed.toLowerCase() === trimmed || allowed.toLowerCase().includes(trimmed)) || '';
        })
        .filter(Boolean);

      // Deduplicate and limit to 3
      labels = [...new Set(labels)].slice(0, 3);

      // Default to first available label if empty
      if (labels.length === 0 && availableLabels.length > 0) {
        labels = [availableLabels[0]];
      }

      return {
        emailId,
        subject: email.subject,
        from: email.from,
        suggestedLabels: labels,
        availableLabels, // Return available labels for reference
      };
    },
  });
}

/**
 * Creates the generate_smart_replies tool
 */
export function createSmartRepliesTool(options: InsightsToolOptions) {
  const { prisma, mistral, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'generate_smart_replies',
    description: t.insights.smartReplies.description,
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to generate replies for'),
      tone: z.enum(['formal', 'casual', 'technical']).optional().describe('Tone for the replies'),
    }),
    execute: async ({ emailId, tone = 'casual' }) => {
      const email = await getEmail(prisma, tenantId, emailId);
      if (!email) {
        return { error: t.email.notFound };
      }

      // Get tone instruction from locale
      const toneInstruction = t.insights.tones[tone];
      const systemPrompt = t.insights.smartReplies.systemPrompt(toneInstruction);
      const userPrompt = buildEmailPrompt(email, locale, t);

      const raw = await mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
        maxTokens: 500,
      });

      let replies = parseArrayFromPayload(raw, 'replies');

      // Clean up replies
      replies = replies
        .map((reply) =>
          reply
            .replace(/```/g, '')
            .replace(/^"+|"+$/g, '')
            .replace(/\\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter((reply) => reply.length > 10)
        .slice(0, 3);

      return {
        emailId,
        subject: email.subject,
        from: email.from,
        smartReplies: replies,
        tone,
      };
    },
  });
}

/**
 * Email intent types for classification
 */
export const EMAIL_INTENTS = [
  'action_required', // Requires action from recipient
  'fyi', // For your information, no action needed
  'question', // Asking a question
  'meeting_request', // Scheduling related
  'follow_up', // Following up on previous conversation
  'escalation', // Urgent/escalated issue
  'feedback', // Providing feedback
  'introduction', // Introduction or first contact
  'thank_you', // Gratitude message
  'complaint', // Complaint or issue report
] as const;

export type EmailIntent = (typeof EMAIL_INTENTS)[number];

/**
 * Creates the analyze_email tool (comprehensive analysis)
 *
 * Combines sentiment, urgency, intent, and priority into a single analysis.
 * Best practice 2025: Aspect-based analysis for better insights.
 */
export function createAnalyzeEmailTool(options: InsightsToolOptions) {
  const { prisma, mistral, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'analyze_email',
    description: t.insights.analyze?.description ?? 'Comprehensive email analysis: sentiment, urgency, intent, and priority',
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to analyze'),
    }),
    execute: async ({ emailId }) => {
      const email = await getEmail(prisma, tenantId, emailId);
      if (!email) {
        return { error: t.email.notFound };
      }

      const userPrompt = buildEmailPrompt(email, locale, t);

      const systemPrompt =
        locale === 'it'
          ? `Analizza l'email in modo completo. Rispondi in JSON:
{
  "sentiment": "positive|negative|neutral",
  "tone": "formal|casual|urgent|friendly",
  "urgency": "high|medium|low",
  "intent": "action_required|fyi|question|meeting_request|follow_up|escalation|feedback|introduction|thank_you|complaint",
  "priority": 1-10,
  "escalationRisk": true|false,
  "keyTopics": ["..."],
  "suggestedResponse": "immediate|within_day|within_week|optional",
  "confidence": 0.0-1.0,
  "reasoning": "..."
}`
          : `Analyze the email comprehensively. Reply in JSON:
{
  "sentiment": "positive|negative|neutral",
  "tone": "formal|casual|urgent|friendly",
  "urgency": "high|medium|low",
  "intent": "action_required|fyi|question|meeting_request|follow_up|escalation|feedback|introduction|thank_you|complaint",
  "priority": 1-10,
  "escalationRisk": true|false,
  "keyTopics": ["..."],
  "suggestedResponse": "immediate|within_day|within_week|optional",
  "confidence": 0.0-1.0,
  "reasoning": "..."
}`;

      const raw = await mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 600,
      });

      try {
        let cleaned = raw.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

        const parsed = JSON.parse(cleaned);
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          receivedAt: email.receivedAt,
          analysis: {
            sentiment: parsed.sentiment || 'neutral',
            tone: parsed.tone || 'casual',
            urgency: parsed.urgency || 'medium',
            intent: parsed.intent || 'fyi',
            priority: Math.min(10, Math.max(1, parsed.priority || 5)),
            escalationRisk: parsed.escalationRisk || false,
            keyTopics: parsed.keyTopics || [],
            suggestedResponse: parsed.suggestedResponse || 'within_day',
            confidence: parsed.confidence || 0.5,
            reasoning: parsed.reasoning || '',
          },
        };
      } catch {
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          receivedAt: email.receivedAt,
          analysis: {
            sentiment: 'neutral',
            tone: 'casual',
            urgency: 'medium',
            intent: 'fyi',
            priority: 5,
            escalationRisk: false,
            keyTopics: [],
            suggestedResponse: 'within_day',
            confidence: 0.3,
            reasoning: raw,
          },
        };
      }
    },
  });
}

/**
 * Creates the detect_intent tool
 *
 * Classifies email intent with confidence scoring.
 * Best practice 2025: Intent-based routing for better handling.
 */
export function createDetectIntentTool(options: InsightsToolOptions) {
  const { prisma, mistral, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'detect_intent',
    description: t.insights.detectIntent?.description ?? 'Detect email intent and classify the purpose',
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to classify'),
    }),
    execute: async ({ emailId }) => {
      const email = await getEmail(prisma, tenantId, emailId);
      if (!email) {
        return { error: t.email.notFound };
      }

      const userPrompt = buildEmailPrompt(email, locale, t);
      const intentsList = EMAIL_INTENTS.join(', ');

      const systemPrompt =
        locale === 'it'
          ? `Classifica l'intento dell'email. Intenti possibili: ${intentsList}. Rispondi in JSON:
{
  "primaryIntent": "...",
  "secondaryIntents": ["..."],
  "requiresAction": true|false,
  "requiresResponse": true|false,
  "deadline": "YYYY-MM-DD or null",
  "confidence": 0.0-1.0
}`
          : `Classify the email intent. Possible intents: ${intentsList}. Reply in JSON:
{
  "primaryIntent": "...",
  "secondaryIntents": ["..."],
  "requiresAction": true|false,
  "requiresResponse": true|false,
  "deadline": "YYYY-MM-DD or null",
  "confidence": 0.0-1.0
}`;

      // Performance optimization: use fast model for intent classification (3-4x faster)
      const raw = await mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 400,
        modelTier: 'fast', // Use AI_MODEL_SIMPLE for intent detection
      });

      try {
        let cleaned = raw.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

        const parsed = JSON.parse(cleaned);
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          primaryIntent: parsed.primaryIntent || 'fyi',
          secondaryIntents: parsed.secondaryIntents || [],
          requiresAction: parsed.requiresAction || false,
          requiresResponse: parsed.requiresResponse || false,
          deadline: parsed.deadline || null,
          confidence: parsed.confidence || 0.5,
        };
      } catch {
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          primaryIntent: 'fyi',
          secondaryIntents: [],
          requiresAction: false,
          requiresResponse: false,
          deadline: null,
          confidence: 0.3,
        };
      }
    },
  });
}

/**
 * Creates the calculate_priority tool
 *
 * Calculates email priority score based on multiple factors.
 * Best practice 2025: Multi-factor priority scoring.
 */
export function createCalculatePriorityTool(options: InsightsToolOptions) {
  const { prisma, mistral, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'calculate_priority',
    description: t.insights.calculatePriority?.description ?? 'Calculate email priority score based on urgency, sender, and content',
    parameters: z.object({
      emailId: z.string().describe('The ID of the email to score'),
      senderImportance: z.enum(['vip', 'important', 'normal', 'low']).optional().describe('Known sender importance level'),
    }),
    execute: async ({ emailId, senderImportance = 'normal' }) => {
      const email = await getEmail(prisma, tenantId, emailId);
      if (!email) {
        return { error: t.email.notFound };
      }

      const userPrompt = buildEmailPrompt(email, locale, t);

      const systemPrompt =
        locale === 'it'
          ? `Calcola la priorità dell'email. Considera: urgenza, importanza, deadline, sentiment. Rispondi in JSON:
{
  "urgencyScore": 1-10,
  "importanceScore": 1-10,
  "timeScore": 1-10,
  "sentimentImpact": -2 to +2,
  "factors": ["..."],
  "recommendation": "handle_now|handle_today|handle_this_week|can_wait|archive"
}`
          : `Calculate email priority. Consider: urgency, importance, deadline, sentiment. Reply in JSON:
{
  "urgencyScore": 1-10,
  "importanceScore": 1-10,
  "timeScore": 1-10,
  "sentimentImpact": -2 to +2,
  "factors": ["..."],
  "recommendation": "handle_now|handle_today|handle_this_week|can_wait|archive"
}`;

      // Performance optimization: use fast model for scoring (3-4x faster)
      const raw = await mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 400,
        modelTier: 'fast', // Use AI_MODEL_SIMPLE for priority scoring
      });

      try {
        let cleaned = raw.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

        const parsed = JSON.parse(cleaned);

        // Calculate weighted priority with sender importance boost
        const senderBoost = { vip: 3, important: 2, normal: 0, low: -1 }[senderImportance] ?? 0;
        const baseScore =
          (parsed.urgencyScore || 5) * 0.35 +
          (parsed.importanceScore || 5) * 0.35 +
          (parsed.timeScore || 5) * 0.2 +
          (parsed.sentimentImpact || 0) * 0.5;

        const finalScore = Math.min(10, Math.max(1, Math.round(baseScore + senderBoost)));

        return {
          emailId,
          subject: email.subject,
          from: email.from,
          priority: {
            score: finalScore,
            urgencyScore: parsed.urgencyScore || 5,
            importanceScore: parsed.importanceScore || 5,
            timeScore: parsed.timeScore || 5,
            sentimentImpact: parsed.sentimentImpact || 0,
            senderBoost,
            factors: parsed.factors || [],
            recommendation: parsed.recommendation || 'handle_this_week',
          },
        };
      } catch {
        return {
          emailId,
          subject: email.subject,
          from: email.from,
          priority: {
            score: 5,
            urgencyScore: 5,
            importanceScore: 5,
            timeScore: 5,
            sentimentImpact: 0,
            senderBoost: 0,
            factors: [],
            recommendation: 'handle_this_week',
          },
        };
      }
    },
  });
}

/**
 * Creates all email insight tools
 */
export function createInsightTools(options: InsightsToolOptions) {
  return [
    createSummarizeEmailTool(options),
    createAnalyzeSentimentTool(options),
    createComposeReplyTool(options),
    createExtractActionItemsTool(options),
    createCategorizeEmailTool(options),
    createSmartRepliesTool(options),
    // Enhanced 2025 tools
    createAnalyzeEmailTool(options),
    createDetectIntentTool(options),
    createCalculatePriorityTool(options),
  ];
}
