/**
 * BriefingService - Daily briefing generation via generateText + parseJsonOutput
 *
 * Produces a comprehensive executive briefing including priority emails,
 * calendar snapshot, pending follow-ups, stale contacts, draft suggestions,
 * email volume trends, and focus time recommendations.
 *
 * Uses a single LLM call with pre-fetched data context.
 * JSON extracted from raw text via parseJsonOutput (Qwen 3.5 via OpenRouter).
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateObject, generateText } from 'ai';
import { AiRunStatus } from '@prisma/client';
import { z } from 'zod';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { AiRunLedgerService } from './ai-run-ledger.service';
import { parseJsonOutput } from '../utils/parse-json-output';
import { promptHash } from '../utils/prompt-hash';
import { buildAiResponseMeta, type AiServiceResult } from '../utils/ai-response-meta';
import { CacheNamespace, CacheService } from '../../../common/services/cache.service';
import {
  getLocale as resolveAiLocale,
  getTranslations as getAiTranslations,
  type SupportedLocale,
} from '../locales';

// ============ Zod Schema (co-located, exported for frontend type derivation) ============

export const briefingSchema = z.object({
  priorityEmails: z.array(z.object({
    emailId: z.string().describe('Email ID'),
    subject: z.string().describe('Email subject line'),
    sender: z.string().describe('Sender email or name'),
    urgency: z.enum(['critical', 'high', 'medium', 'low']).default('medium').describe('Urgency level'),
    reason: z.string().describe('Why this email is a priority'),
  })).default([]).describe('Top priority emails requiring attention'),

  calendarSnapshot: z.array(z.object({
    eventId: z.string().describe('Calendar event ID'),
    title: z.string().describe('Event title'),
    startTime: z.string().describe('ISO 8601 start time'),
    endTime: z.string().describe('ISO 8601 end time'),
    hasConflict: z.boolean().default(false).describe('Whether event overlaps with another'),
  })).default([]).describe('Today calendar events with conflict flags'),

  pendingFollowUps: z.array(z.object({
    emailId: z.string().describe('Email ID requiring follow-up'),
    contactName: z.string().describe('Contact name'),
    reason: z.string().describe('Follow-up reason'),
    suggestedDueDate: z.string().nullable().default(null).describe('Suggested due date ISO string'),
    urgency: z.enum(['high', 'medium', 'low']).default('medium').describe('Follow-up urgency'),
  })).default([]).describe('Pending follow-ups requiring action'),

  executiveSummary: z.string().default('No briefing data available.').describe('2-3 sentence natural language executive summary'),

  staleContactsAlert: z.array(z.object({
    contactId: z.string().describe('Contact ID'),
    name: z.string().describe('Contact display name'),
    daysSinceContact: z.number().default(0).describe('Days since last interaction'),
    suggestedAction: z.string().describe('Suggested re-engagement action'),
  })).default([]).describe('Contacts losing touch'),

  draftSuggestions: z.array(z.object({
    emailId: z.string().describe('Email ID that may need a reply'),
    subject: z.string().describe('Email subject'),
    reason: z.string().describe('Why a reply is suggested'),
  })).default([]).describe('Emails that may need a reply draft'),

  emailVolumeTrends: z.object({
    todayReceived: z.number().default(0).describe('Emails received today'),
    todaySent: z.number().default(0).describe('Emails sent today'),
    weeklyAvgReceived: z.number().default(0).describe('Weekly average received'),
    weeklyAvgSent: z.number().default(0).describe('Weekly average sent'),
    trend: z.enum(['increasing', 'stable', 'decreasing']).default('stable').describe('Volume trend'),
  }).default({ todayReceived: 0, todaySent: 0, weeklyAvgReceived: 0, weeklyAvgSent: 0, trend: 'stable' }).describe('Email volume trends'),

  focusTimeRecommendations: z.array(z.object({
    startTime: z.string().describe('ISO 8601 recommended focus start'),
    endTime: z.string().describe('ISO 8601 recommended focus end'),
    reason: z.string().describe('Why this time block is recommended'),
  })).default([]).describe('Recommended focus time blocks based on calendar gaps'),
});

export type BriefingOutput = z.infer<typeof briefingSchema>;

type BriefingContext = {
  unreadEmails: Array<{
    id: string;
    subject: string | null;
    from: string;
    snippet: string | null;
    receivedAt: Date;
    aiPriority: number | null;
    aiPriorityReason: string | null;
    aiSentiment: string | null;
  }>;
  todayEvents: Array<{
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
  }>;
  pendingFollowUps: Array<{
    id: string;
    emailId: string;
    reason: string | null;
    dueDate: Date;
    followUpType: string;
    email?: {
      subject: string | null;
      from: string;
    } | null;
  }>;
  staleContacts: Array<{
    id: string;
    displayName: string | null;
    lastInteractedAt: Date | null;
  }>;
  emailVolume: {
    todayReceived: number;
    todaySent: number;
    weeklyAvgReceived: number;
    weeklyAvgSent: number;
  };
  upcomingDeadlines: number;
  pendingActionItems: number;
  currentTime: Date;
};

type CachedBriefingResult = AiServiceResult<BriefingOutput>;

type BriefingSlotWindow = {
  cacheKey: string;
  localDate: string;
  slotIndex: number;
  slotLabel: string;
  ttlSeconds: number;
};

// ============ Safe Fallback ============

const SAFE_FALLBACK: BriefingOutput = {
  priorityEmails: [],
  calendarSnapshot: [],
  pendingFollowUps: [],
  executiveSummary: 'Unable to generate briefing at this time.',
  staleContactsAlert: [],
  draftSuggestions: [],
  emailVolumeTrends: {
    todayReceived: 0,
    todaySent: 0,
    weeklyAvgReceived: 0,
    weeklyAvgSent: 0,
    trend: 'stable',
  },
  focusTimeRecommendations: [],
};

const SYSTEM_PROMPT = `You are a professional executive assistant analyzing a user's email, calendar, and contacts data to produce a comprehensive daily briefing.

Analyze the provided data context and return a JSON object with EXACTLY these fields:

{
  "priorityEmails": [{"emailId": string, "subject": string, "sender": string, "urgency": "critical"|"high"|"medium"|"low", "reason": string}],
  "calendarSnapshot": [{"eventId": string, "title": string, "startTime": string, "endTime": string, "hasConflict": boolean}],
  "pendingFollowUps": [{"emailId": string, "contactName": string, "reason": string, "suggestedDueDate": string|null, "urgency": "high"|"medium"|"low"}],
  "executiveSummary": string,
  "staleContactsAlert": [{"contactId": string, "name": string, "daysSinceContact": number, "suggestedAction": string}],
  "draftSuggestions": [{"emailId": string, "subject": string, "reason": string}],
  "emailVolumeTrends": {"todayReceived": number, "todaySent": number, "weeklyAvgReceived": number, "weeklyAvgSent": number, "trend": "increasing"|"stable"|"decreasing"},
  "focusTimeRecommendations": [{"startTime": string, "endTime": string, "reason": string}]
}

Rules:
- priorityEmails: Pick the most urgent/important emails from unread list. Maximum 5.
- calendarSnapshot: List today's events. Flag conflicts where times overlap.
- pendingFollowUps: Summarize pending follow-ups with contact info.
- executiveSummary: Write 2-3 concise actionable sentences.
- staleContactsAlert: List contacts with no recent interaction.
- draftSuggestions: Identify emails that likely need a reply.
- emailVolumeTrends: Report today's counts and weekly averages.
- focusTimeRecommendations: Suggest focus blocks in calendar gaps.

Be concise, actionable, and data-driven. Do NOT fabricate data -- only reference items from the provided context.
If a field has no matching data in the provided context, return an empty array or null — never synthesize missing data.

Confidence calibration for urgency ratings:
- critical: Explicit deadline within 24h, or sender flagged as VIP, or escalation/complaint
- high: Deadline within 48h, direct question requiring action, or important sender
- medium: General action item, no hard deadline, within the week
- low: FYI email, newsletter, or optional action`;

type BriefingFallbackCopy = {
  noSubject: string;
  unknown: string;
  pendingReason: (followUpType: string) => string;
  staleContactAction: (name: string) => string;
  draftReason: string;
  systemAlertReason: string;
  deadlineReason: string;
  responseReason: string;
  highRankReason: string;
  nextBlockReason: string;
  executiveSummary: (priorityEmails: number, pendingFollowUps: number, meetings: number) => string;
  topAttention: (subject: string) => string;
  approaching: (deadlines: number, actionItems: number) => string;
  focusBlockReason: string;
};

const BRIEFING_FALLBACK_COPY: Record<SupportedLocale, BriefingFallbackCopy> = {
  en: {
    noSubject: 'No subject',
    unknown: 'Unknown',
    pendingReason: (followUpType) =>
      followUpType === 'WAITING_FOR'
        ? 'Waiting on a response or external update.'
        : followUpType === 'TODO'
          ? 'Pending task or reply to complete.'
          : 'Pending follow-up item.',
    staleContactAction: (name) => `Send a short reconnect note to ${name}.`,
    draftReason: 'Unread email likely needs a response or review.',
    systemAlertReason: 'System alert or delivery signal detected in an unread email.',
    deadlineReason: 'Unread email includes deadline or urgency signals that need review.',
    responseReason: 'Unread email appears to require a response or decision.',
    highRankReason: 'Unread email ranks high based on urgency and recency.',
    nextBlockReason: 'Unread email should be reviewed in the next work block.',
    executiveSummary: (priorityEmails, pendingFollowUps, meetings) =>
      `You have ${priorityEmails} priority unread emails, ${pendingFollowUps} pending follow-ups, and ${meetings} meetings today.`,
    topAttention: (subject) => `Top attention item: "${subject}".`,
    approaching: (deadlines, actionItems) =>
      `${deadlines} deadlines and ${actionItems} action items are approaching.`,
    focusBlockReason: 'Open calendar gap suitable for focused email or follow-up work.',
  },
  it: {
    noSubject: 'Nessun oggetto',
    unknown: 'Sconosciuto',
    pendingReason: (followUpType) =>
      followUpType === 'WAITING_FOR'
        ? 'In attesa di una risposta o di un aggiornamento esterno.'
        : followUpType === 'TODO'
          ? 'Attivita o risposta da completare.'
          : 'Follow-up in sospeso.',
    staleContactAction: (name) => `Invia un breve messaggio di ricontatto a ${name}.`,
    draftReason: 'Email non letta che probabilmente richiede una risposta o una revisione.',
    systemAlertReason: 'Rilevato un avviso di sistema o un segnale di delivery in un email non letta.',
    deadlineReason: 'L email non letta contiene segnali di scadenza o urgenza da rivedere.',
    responseReason: 'L email non letta sembra richiedere una risposta o una decisione.',
    highRankReason: 'L email non letta e alta in priorita per urgenza e recenza.',
    nextBlockReason: 'L email non letta dovrebbe essere rivista nel prossimo blocco di lavoro.',
    executiveSummary: (priorityEmails, pendingFollowUps, meetings) =>
      `Hai ${priorityEmails} email prioritarie non lette, ${pendingFollowUps} follow-up in sospeso e ${meetings} riunioni oggi.`,
    topAttention: (subject) => `Massima attenzione: "${subject}".`,
    approaching: (deadlines, actionItems) =>
      `Si avvicinano ${deadlines} scadenze e ${actionItems} attivita operative.`,
    focusBlockReason: 'Finestra libera in calendario adatta a email o follow-up concentrati.',
  },
};

function resolveBriefingLocale(locale?: string): SupportedLocale {
  return resolveAiLocale(locale);
}

function getBriefingFallbackCopy(locale?: string): BriefingFallbackCopy {
  return BRIEFING_FALLBACK_COPY[resolveBriefingLocale(locale)];
}

function buildBriefingSystemPrompt(locale?: string): string {
  const briefingTranslations = getAiTranslations(resolveBriefingLocale(locale)).briefing;
  return SYSTEM_PROMPT + `\n\n${briefingTranslations.aiPromptLanguage} JSON keys must remain in English.`;
}

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);
  private readonly briefingModelId: string;
  private readonly briefingVersion = 'briefing-v2';
  private readonly briefingSlotsPerDay = 3;
  private readonly briefingSlotHours = 24 / this.briefingSlotsPerDay;

  constructor(
    private readonly mistralProvider: OpenRouterProviderService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() @Inject(UsageTrackingService) private readonly usageTrackingService?: UsageTrackingService,
    @Optional() private readonly ledgerService?: AiRunLedgerService,
    @Optional() private readonly cacheService?: CacheService,
  ) {
    // Use fast/simple model for structured JSON — M2.7's Interleaved Thinking breaks JSON.
    this.briefingModelId = this.configService.get<string>('AI_MODEL_SIMPLE', 'mistralai/mistral-small-3.1-24b-instruct');
  }

  /**
   * Return the cached briefing for the current local time slot.
   * Page loads should reuse the same slot result instead of regenerating.
   */
  async getBriefing(
    tenantId: string,
    userId: string,
    timezone?: string,
    locale?: string,
  ): Promise<AiServiceResult<BriefingOutput>> {
    if (!this.cacheService) {
      return this.generateBriefing(tenantId, timezone, locale);
    }

    const window = this.getSlotWindow(tenantId, userId, timezone, locale);
    const cached = await this.cacheService.get<CachedBriefingResult>(window.cacheKey, {
      namespace: CacheNamespace.AI_BRIEFING,
    });

    if (cached) {
      return {
        data: cached.data,
        error: cached.error,
        meta: {
          ...cached.meta,
          source: 'cache',
          locale: locale || cached.meta.locale,
        },
      };
    }

    const generated = await this.generateBriefing(tenantId, timezone, locale);
    await this.cacheService.set(window.cacheKey, generated, {
      namespace: CacheNamespace.AI_BRIEFING,
      ttl: window.ttlSeconds,
    });
    return generated;
  }

  /**
   * Force regenerate the briefing for the current slot and replace the cached result.
   */
  async refreshBriefing(
    tenantId: string,
    userId: string,
    timezone?: string,
    locale?: string,
  ): Promise<AiServiceResult<BriefingOutput>> {
    const generated = await this.generateBriefing(tenantId, timezone, locale);

    if (!this.cacheService) {
      return generated;
    }

    const window = this.getSlotWindow(tenantId, userId, timezone, locale);
    await this.cacheService.set(window.cacheKey, generated, {
      namespace: CacheNamespace.AI_BRIEFING,
      ttl: window.ttlSeconds,
    });

    return generated;
  }

  /**
   * Generate a comprehensive daily briefing for a tenant.
   * Pre-fetches all data in parallel, then makes a single LLM call.
   */
  async generateBriefing(
    tenantId: string,
    timezone?: string,
    locale?: string,
  ): Promise<AiServiceResult<BriefingOutput>> {
    const now = new Date();
    // Calculate "today" boundaries in user's timezone
    const tz = timezone || 'UTC';
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
    // Parse midnight in user's timezone by computing UTC offset
    const parts = todayStr.split('-').map(Number);
    const naive = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])); // midnight UTC
    // Find the actual UTC offset for this timezone at this date
    const probe = new Date(naive.toLocaleString('en-US', { timeZone: tz }));
    const offsetMs = probe.getTime() - naive.getTime();
    const startOfDay = new Date(naive.getTime() - offsetMs);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 1. Pre-fetch all data in parallel
    const [unreadEmails, todayEvents, followUps, staleContacts, todayReceivedCount, todaySentCount, weeklyReceivedCount, weeklySentCount, deadlineCount, actionItemCount] =
      await Promise.all([
        this.prisma.email.findMany({
          where: { tenantId, isRead: false, isDeleted: false },
          orderBy: { receivedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            subject: true,
            from: true,
            snippet: true,
            receivedAt: true,
            aiPriority: true,
            aiPriorityReason: true,
            aiSentiment: true,
          },
        }),
        this.prisma.calendarEvent.findMany({
          where: {
            tenantId,
            isDeleted: false,
            startTime: { gte: startOfDay, lte: endOfDay },
          },
          orderBy: { startTime: 'asc' },
          select: { id: true, title: true, startTime: true, endTime: true },
        }),
        this.prisma.emailFollowUp.findMany({
          where: { tenantId, status: 'PENDING' },
          take: 10,
          select: {
            id: true,
            emailId: true,
            reason: true,
            dueDate: true,
            followUpType: true,
            email: {
              select: {
                subject: true,
                from: true,
              },
            },
          },
        }),
        this.prisma.contact.findMany({
          where: {
            tenantId,
            isDeleted: false,
            lastInteractedAt: { lt: thirtyDaysAgo },
          },
          orderBy: { lastInteractedAt: 'asc' },
          take: 5,
          select: { id: true, displayName: true, lastInteractedAt: true },
        }),
        this.prisma.email.count({
          where: { tenantId, receivedAt: { gte: startOfDay }, isDeleted: false },
        }),
        this.prisma.email.count({
          where: { tenantId, sentAt: { gte: startOfDay }, isDraft: false, folder: 'SENT', isDeleted: false },
        }),
        this.prisma.email.count({
          where: { tenantId, receivedAt: { gte: sevenDaysAgo }, isDeleted: false },
        }),
        this.prisma.email.count({
          where: { tenantId, sentAt: { gte: sevenDaysAgo }, isDraft: false, folder: 'SENT', isDeleted: false },
        }),
        // Deadlines: follow-ups with detected deadline in next 7 days
        this.prisma.emailFollowUp.count({
          where: {
            tenantId,
            status: { in: ['PENDING', 'REMINDED'] },
            detectedDeadline: { not: null, gte: now, lte: sevenDaysFromNow },
          },
        }),
        // Action items: TODO follow-ups pending
        this.prisma.emailFollowUp.count({
          where: {
            tenantId,
            status: 'PENDING',
            followUpType: 'TODO',
          },
        }),
      ]);

    // 2. Build data context for LLM
    const contextData: BriefingContext = {
      unreadEmails,
      todayEvents,
      pendingFollowUps: followUps,
      upcomingDeadlines: deadlineCount,
      pendingActionItems: actionItemCount,
      staleContacts,
      emailVolume: {
        todayReceived: todayReceivedCount,
        todaySent: todaySentCount,
        weeklyAvgReceived: Math.round(weeklyReceivedCount / 7),
        weeklyAvgSent: Math.round(weeklySentCount / 7),
      },
      currentTime: now,
    };

    const deterministicFallback = this.buildDeterministicFallback(contextData, locale);
    const dataContext = JSON.stringify({
      unreadEmails: contextData.unreadEmails.map(e => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        snippet: e.snippet?.slice(0, 200),
        receivedAt: e.receivedAt.toISOString(),
        aiPriority: e.aiPriority,
        aiPriorityReason: e.aiPriorityReason,
        aiSentiment: e.aiSentiment,
      })),
      todayEvents: contextData.todayEvents.map(e => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
      })),
      pendingFollowUps: contextData.pendingFollowUps.map(f => ({
        id: f.id,
        emailId: f.emailId,
        reason: f.reason,
        dueDate: f.dueDate?.toISOString(),
        followUpType: f.followUpType,
        email: f.email ? { subject: f.email.subject, from: f.email.from } : null,
      })),
      upcomingDeadlines: contextData.upcomingDeadlines,
      pendingActionItems: contextData.pendingActionItems,
      staleContacts: contextData.staleContacts.map(c => ({
        id: c.id,
        name: c.displayName || 'Unknown',
        lastInteractedAt: c.lastInteractedAt?.toISOString(),
      })),
      emailVolume: contextData.emailVolume,
      currentTime: contextData.currentTime.toISOString(),
    }, null, 0);

    // 3. Generate briefing with graceful fallback
    return this.generateWithFallback(dataContext, deterministicFallback, tenantId, locale);
  }

  private getSlotWindow(
    tenantId: string,
    userId: string,
    timezone?: string,
    locale?: string,
    now = new Date(),
  ): BriefingSlotWindow {
    const tz = timezone || 'UTC';
    const resolvedLocale = resolveBriefingLocale(locale);
    const localDate = now.toLocaleDateString('en-CA', { timeZone: tz });
    const localHour = Number.parseInt(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(now),
      10,
    );
    const slotIndex = Math.min(
      this.briefingSlotsPerDay - 1,
      Math.floor(localHour / this.briefingSlotHours),
    );
    const startOfDay = this.getTimezoneStartOfDay(localDate, tz);
    const slotEnd = new Date(
      startOfDay.getTime() + (slotIndex + 1) * this.briefingSlotHours * 60 * 60 * 1000,
    );
    const ttlSeconds = Math.max(
      60,
      Math.ceil((slotEnd.getTime() - now.getTime()) / 1000),
    );
    const slotLabel = `slot-${slotIndex + 1}`;

    return {
      cacheKey: `${tenantId}:${userId}:${resolvedLocale}:${localDate}:${slotLabel}`,
      localDate,
      slotIndex,
      slotLabel,
      ttlSeconds,
    };
  }

  private getTimezoneStartOfDay(localDate: string, timezone: string): Date {
    const parts = localDate.split('-').map(Number);
    const naive = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const probe = new Date(naive.toLocaleString('en-US', { timeZone: timezone }));
    const offsetMs = probe.getTime() - naive.getTime();
    return new Date(naive.getTime() - offsetMs);
  }

  private buildDeterministicFallback(context: BriefingContext, locale?: string): BriefingOutput {
    const copy = getBriefingFallbackCopy(locale);
    const rankedEmails = [...context.unreadEmails]
      .map((email) => ({ email, score: this.scorePriorityEmail(email) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const priorityEmails: BriefingOutput['priorityEmails'] = rankedEmails.map(({ email, score }) => ({
      emailId: email.id,
      subject: email.subject || copy.noSubject,
      sender: this.extractSenderName(email.from, copy.unknown),
      urgency: this.scoreToUrgency(score),
      reason: email.aiPriorityReason || this.buildPriorityReason(email, score, locale),
    }));

    const calendarSnapshot: BriefingOutput['calendarSnapshot'] = context.todayEvents
      .slice(0, 8)
      .map((event, index, events) => ({
        eventId: event.id,
        title: event.title,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        hasConflict: events.some((other, otherIndex) =>
          otherIndex !== index
          && event.startTime < other.endTime
          && other.startTime < event.endTime),
      }));

    const pendingFollowUps: BriefingOutput['pendingFollowUps'] = context.pendingFollowUps
      .slice(0, 8)
      .map((followUp) => ({
        emailId: followUp.emailId,
        contactName: this.extractSenderName(followUp.email?.from, copy.unknown),
        reason: followUp.reason || copy.pendingReason(followUp.followUpType),
        suggestedDueDate: followUp.dueDate?.toISOString() ?? null,
        urgency: followUp.dueDate && followUp.dueDate.getTime() < Date.now() + 24 * 60 * 60 * 1000
          ? 'high'
          : followUp.followUpType === 'TODO'
            ? 'medium'
            : 'low',
      }));

    const staleContactsAlert: BriefingOutput['staleContactsAlert'] = context.staleContacts
      .slice(0, 5)
      .map((contact) => ({
        contactId: contact.id,
        name: contact.displayName || copy.unknown,
        daysSinceContact: contact.lastInteractedAt
          ? Math.max(0, Math.round((Date.now() - contact.lastInteractedAt.getTime()) / 86_400_000))
          : 0,
        suggestedAction: copy.staleContactAction(contact.displayName || copy.unknown),
      }));

    const draftSuggestions: BriefingOutput['draftSuggestions'] = rankedEmails
      .filter(({ email, score }) => score >= 3)
      .slice(0, 3)
      .map(({ email }) => ({
        emailId: email.id,
        subject: email.subject || copy.noSubject,
        reason: email.aiPriorityReason || copy.draftReason,
      }));

    const focusTimeRecommendations = this.buildFocusBlocks(context.todayEvents, context.currentTime, locale);
    const trend = this.computeVolumeTrend(context.emailVolume.todayReceived, context.emailVolume.weeklyAvgReceived);

    return {
      priorityEmails,
      calendarSnapshot,
      pendingFollowUps,
      executiveSummary: this.buildExecutiveSummary(priorityEmails, calendarSnapshot, pendingFollowUps, context, locale),
      staleContactsAlert,
      draftSuggestions,
      emailVolumeTrends: {
        ...context.emailVolume,
        trend,
      },
      focusTimeRecommendations,
    };
  }

  private scorePriorityEmail(email: BriefingContext['unreadEmails'][number]): number {
    const sample = `${email.subject || ''}\n${email.snippet || ''}`.toLowerCase();
    let score = email.aiPriority ? Math.max(0, 6 - email.aiPriority) : 1;

    if (/\b(failed|failure|urgent|asap|deadline|overdue|action required|incident|down|outage|error)\b/.test(sample)) {
      score += 3;
    }
    if (/\b(question|can you|please|review|reply|meeting|call|tomorrow|today)\b/.test(sample)) {
      score += 2;
    }
    if (/\b(github|vercel|railway|deploy|build)\b/.test(sample)) {
      score += 2;
    }
    if (email.aiSentiment === 'negative') {
      score += 1;
    }

    return score;
  }

  private scoreToUrgency(score: number): 'critical' | 'high' | 'medium' | 'low' {
    if (score >= 6) return 'critical';
    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  private buildPriorityReason(email: BriefingContext['unreadEmails'][number], score: number, locale?: string): string {
    const copy = getBriefingFallbackCopy(locale);
    const sample = `${email.subject || ''} ${email.snippet || ''}`.toLowerCase();
    if (/\b(github|vercel|railway|deploy|build)\b/.test(sample)) {
      return copy.systemAlertReason;
    }
    if (/\b(deadline|overdue|tomorrow|today|asap|urgent)\b/.test(sample)) {
      return copy.deadlineReason;
    }
    if (/\b(question|please|review|reply)\b/.test(sample)) {
      return copy.responseReason;
    }
    return score >= 4
      ? copy.highRankReason
      : copy.nextBlockReason;
  }

  private extractSenderName(value?: string | null, fallback = 'Unknown'): string {
    if (!value) return fallback;
    const match = value.match(/^([^<]+)/);
    return (match?.[1] || value).trim().replace(/^"+|"+$/g, '');
  }

  private computeVolumeTrend(todayReceived: number, weeklyAvgReceived: number): 'increasing' | 'stable' | 'decreasing' {
    if (weeklyAvgReceived <= 0) return 'stable';
    if (todayReceived >= weeklyAvgReceived * 1.2) return 'increasing';
    if (todayReceived <= weeklyAvgReceived * 0.8) return 'decreasing';
    return 'stable';
  }

  private buildExecutiveSummary(
    priorityEmails: BriefingOutput['priorityEmails'],
    calendarSnapshot: BriefingOutput['calendarSnapshot'],
    pendingFollowUps: BriefingOutput['pendingFollowUps'],
    context: BriefingContext,
    locale?: string,
  ): string {
    const copy = getBriefingFallbackCopy(locale);
    const topSubject = priorityEmails[0]?.subject;
    const parts = [copy.executiveSummary(priorityEmails.length, pendingFollowUps.length, calendarSnapshot.length)];

    if (topSubject) {
      parts.push(copy.topAttention(topSubject));
    }

    if (context.upcomingDeadlines > 0 || context.pendingActionItems > 0) {
      parts.push(copy.approaching(context.upcomingDeadlines, context.pendingActionItems));
    }

    return parts.join(' ');
  }

  private buildFocusBlocks(
    events: BriefingContext['todayEvents'],
    currentTime: Date,
    locale?: string,
  ): BriefingOutput['focusTimeRecommendations'] {
    const copy = getBriefingFallbackCopy(locale);
    if (events.length === 0) return [];

    const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const blocks: BriefingOutput['focusTimeRecommendations'] = [];
    let pointer = new Date(currentTime);

    for (const event of sorted) {
      const gapMs = event.startTime.getTime() - pointer.getTime();
      if (gapMs >= 60 * 60 * 1000) {
        const end = new Date(Math.min(pointer.getTime() + 2 * 60 * 60 * 1000, event.startTime.getTime()));
        blocks.push({
          startTime: pointer.toISOString(),
          endTime: end.toISOString(),
          reason: copy.focusBlockReason,
        });
      }
      if (event.endTime > pointer) {
        pointer = new Date(event.endTime);
      }
      if (blocks.length >= 2) break;
    }

    return blocks;
  }

  private shouldPreferDeterministicFallback(
    candidate: BriefingOutput,
    deterministicFallback: BriefingOutput,
  ): boolean {
    const genericSummary = /unable to generate briefing|no briefing data available/i.test(candidate.executiveSummary || '');
    const fallbackHasSignal =
      deterministicFallback.priorityEmails.length > 0
      || deterministicFallback.calendarSnapshot.length > 0
      || deterministicFallback.pendingFollowUps.length > 0;
    const candidateHasSignal =
      candidate.priorityEmails.length > 0
      || candidate.calendarSnapshot.length > 0
      || candidate.pendingFollowUps.length > 0;

    return genericSummary || (fallbackHasSignal && !candidateHasSignal);
  }

  private async generateWithFallback(
    dataContext: string,
    deterministicFallback: BriefingOutput,
    tenantId = 'system',
    locale?: string,
  ): Promise<AiServiceResult<BriefingOutput>> {
    const systemPrompt = buildBriefingSystemPrompt(locale);

    // Attempt 1: generateObject (structured output)
    const attempt1 = await this.tryGenerateObject(dataContext, tenantId, systemPrompt);
    if (attempt1) {
      if (this.shouldPreferDeterministicFallback(attempt1, deterministicFallback)) {
        await this.trackUsage();
        return {
          data: deterministicFallback,
          meta: buildAiResponseMeta({
            operation: 'briefing',
            version: this.briefingVersion,
            source: 'fallback',
            locale,
            model: this.briefingModelId,
            degraded: true,
            warnings: ['briefing_low_signal_output'],
          }),
        };
      }
      await this.trackUsage();
      return {
        data: attempt1,
        meta: buildAiResponseMeta({
          operation: 'briefing',
          version: this.briefingVersion,
          source: 'live',
          locale,
          model: this.briefingModelId,
        }),
      };
    }

    // Attempt 2: generateText + manual JSON extraction (fallback)
    const attempt2 = await this.tryGenerateText(dataContext, tenantId, systemPrompt);
    if (attempt2) {
      if (this.shouldPreferDeterministicFallback(attempt2, deterministicFallback)) {
        await this.trackUsage();
        return {
          data: deterministicFallback,
          meta: buildAiResponseMeta({
            operation: 'briefing',
            version: this.briefingVersion,
            source: 'fallback',
            locale,
            model: this.briefingModelId,
            degraded: true,
            warnings: ['briefing_low_signal_output', 'structured_output_unavailable'],
          }),
        };
      }
      await this.trackUsage();
      return {
        data: attempt2,
        meta: buildAiResponseMeta({
          operation: 'briefing',
          version: this.briefingVersion,
          source: 'live',
          locale,
          model: this.briefingModelId,
          warnings: ['structured_output_unavailable'],
        }),
      };
    }

    this.logger.error('Briefing generation failed on all attempts');
    return {
      data: deterministicFallback,
      meta: buildAiResponseMeta({
        operation: 'briefing',
        version: this.briefingVersion,
        source: 'fallback',
        locale,
        model: this.briefingModelId,
        degraded: true,
        warnings: ['briefing_generation_failed'],
      }),
      error: 'Briefing generation failed',
    };
  }

  private async tryGenerateObject(
    prompt: string, tenantId: string, systemPrompt: string = SYSTEM_PROMPT,
  ): Promise<BriefingOutput | null> {
    const startTime = Date.now();
    try {
      const result = await generateObject({
        model: this.mistralProvider.getChatModel(this.briefingModelId),
        schema: briefingSchema,
        schemaName: 'DailyBriefing',
        system: systemPrompt,
        prompt,
        temperature: 0.1,
        maxOutputTokens: 1500,
        abortSignal: AbortSignal.timeout(45_000),
      });
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'briefing', model: this.briefingModelId,
        promptTokens: result.usage?.inputTokens ?? 0, completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0, latencyMs: Date.now() - startTime,
        promptVersion: promptHash(systemPrompt),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return result.object;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`generateObject failed for briefing: ${msg}`);
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'briefing', model: this.briefingModelId,
        promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: Date.now() - startTime,
        status: AiRunStatus.FAILED, errorMessage: `generateObject: ${msg}`,
        promptVersion: promptHash(systemPrompt),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return null;
    }
  }

  private async tryGenerateText(
    prompt: string, tenantId: string, systemPrompt: string = SYSTEM_PROMPT,
  ): Promise<BriefingOutput | null> {
    const startTime = Date.now();
    try {
      const result = await generateText({
        model: this.mistralProvider.getChatModel(this.briefingModelId),
        system: systemPrompt,
        prompt: prompt + '\n\nReturn valid JSON.',
        maxOutputTokens: 1200,
        abortSignal: AbortSignal.timeout(45_000),
      });
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'briefing', model: this.briefingModelId,
        promptTokens: result.usage?.inputTokens ?? 0, completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0, latencyMs: Date.now() - startTime,
        promptVersion: promptHash(systemPrompt),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return parseJsonOutput(result.text, briefingSchema);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`generateText fallback failed for briefing: ${msg}`);
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'briefing', model: this.briefingModelId,
        promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: Date.now() - startTime,
        status: AiRunStatus.FAILED, errorMessage: `generateText: ${msg}`,
        promptVersion: promptHash(systemPrompt),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return null;
    }
  }

  private async trackUsage() {
    if (this.usageTrackingService) {
      try {
        await this.usageTrackingService.trackUsage(
          'system',
          'ai-calls',
          1,
        );
      } catch (err) {
        this.logger.warn(`Failed to track briefing usage: ${err}`);
      }
    }
  }
}
