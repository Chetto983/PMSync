/**
 * BriefingService - Daily briefing generation via generateText + Output.object()
 *
 * Produces a comprehensive executive briefing including priority emails,
 * calendar snapshot, pending follow-ups, stale contacts, draft suggestions,
 * email volume trends, and focus time recommendations.
 *
 * Uses a single LLM call with pre-fetched data context.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { generateText } from 'ai';
import { AiRunStatus } from '@prisma/client';
import { z } from 'zod';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { AiRunLedgerService } from './ai-run-ledger.service';
import { parseJsonOutput } from '../utils/parse-json-output';

// ============ Zod Schema (co-located, exported for frontend type derivation) ============

export const briefingSchema = z.object({
  priorityEmails: z.array(z.object({
    emailId: z.string().describe('Email ID'),
    subject: z.string().describe('Email subject line'),
    sender: z.string().describe('Sender email or name'),
    urgency: z.enum(['critical', 'high', 'medium', 'low']).describe('Urgency level'),
    reason: z.string().describe('Why this email is a priority'),
  })).describe('Top priority emails requiring attention'),

  calendarSnapshot: z.array(z.object({
    eventId: z.string().describe('Calendar event ID'),
    title: z.string().describe('Event title'),
    startTime: z.string().describe('ISO 8601 start time'),
    endTime: z.string().describe('ISO 8601 end time'),
    hasConflict: z.boolean().describe('Whether event overlaps with another'),
  })).describe('Today calendar events with conflict flags'),

  pendingFollowUps: z.array(z.object({
    emailId: z.string().describe('Email ID requiring follow-up'),
    contactName: z.string().describe('Contact name'),
    reason: z.string().describe('Follow-up reason'),
    suggestedDueDate: z.string().nullable().describe('Suggested due date ISO string'),
    urgency: z.enum(['high', 'medium', 'low']).describe('Follow-up urgency'),
  })).describe('Pending follow-ups requiring action'),

  executiveSummary: z.string().describe('2-3 sentence natural language executive summary'),

  staleContactsAlert: z.array(z.object({
    contactId: z.string().describe('Contact ID'),
    name: z.string().describe('Contact display name'),
    daysSinceContact: z.number().describe('Days since last interaction'),
    suggestedAction: z.string().describe('Suggested re-engagement action'),
  })).describe('Contacts losing touch'),

  draftSuggestions: z.array(z.object({
    emailId: z.string().describe('Email ID that may need a reply'),
    subject: z.string().describe('Email subject'),
    reason: z.string().describe('Why a reply is suggested'),
  })).describe('Emails that may need a reply draft'),

  emailVolumeTrends: z.object({
    todayReceived: z.number().describe('Emails received today'),
    todaySent: z.number().describe('Emails sent today'),
    weeklyAvgReceived: z.number().describe('Weekly average received'),
    weeklyAvgSent: z.number().describe('Weekly average sent'),
    trend: z.enum(['increasing', 'stable', 'decreasing']).describe('Volume trend'),
  }).describe('Email volume trends'),

  focusTimeRecommendations: z.array(z.object({
    startTime: z.string().describe('ISO 8601 recommended focus start'),
    endTime: z.string().describe('ISO 8601 recommended focus end'),
    reason: z.string().describe('Why this time block is recommended'),
  })).describe('Recommended focus time blocks based on calendar gaps'),
});

export type BriefingOutput = z.infer<typeof briefingSchema>;

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

Analyze the provided data context and return structured JSON matching the exact schema.

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

Confidence calibration for urgency ratings:
- critical: Explicit deadline within 24h, or sender flagged as VIP, or escalation/complaint
- high: Deadline within 48h, direct question requiring action, or important sender
- medium: General action item, no hard deadline, within the week
- low: FYI email, newsletter, or optional action`;

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);

  constructor(
    private readonly mistralProvider: MistralProviderService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(UsageTrackingService) private readonly usageTrackingService?: UsageTrackingService,
    @Optional() private readonly ledgerService?: AiRunLedgerService,
  ) {}

  /**
   * Generate a comprehensive daily briefing for a tenant.
   * Pre-fetches all data in parallel, then makes a single LLM call.
   */
  async generateBriefing(tenantId: string, timezone?: string): Promise<{ data: BriefingOutput; error?: string }> {
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
          select: { id: true, subject: true, from: true, snippet: true, receivedAt: true },
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
          select: { id: true, emailId: true, reason: true, dueDate: true },
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
    const dataContext = JSON.stringify({
      unreadEmails: unreadEmails.map(e => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        snippet: e.snippet?.slice(0, 200),
        receivedAt: e.receivedAt.toISOString(),
      })),
      todayEvents: todayEvents.map(e => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
      })),
      pendingFollowUps: followUps.map(f => ({
        id: f.id,
        emailId: f.emailId,
        reason: f.reason,
        dueDate: f.dueDate?.toISOString(),
      })),
      upcomingDeadlines: deadlineCount,
      pendingActionItems: actionItemCount,
      staleContacts: staleContacts.map(c => ({
        id: c.id,
        name: c.displayName || 'Unknown',
        lastInteractedAt: c.lastInteractedAt?.toISOString(),
      })),
      emailVolume: {
        todayReceived: todayReceivedCount,
        todaySent: todaySentCount,
        weeklyAvgReceived: Math.round(weeklyReceivedCount / 7),
        weeklyAvgSent: Math.round(weeklySentCount / 7),
      },
      currentTime: now.toISOString(),
    }, null, 0);

    // 3. Generate briefing with graceful fallback
    return this.generateWithFallback(dataContext, tenantId);
  }

  private async generateWithFallback(
    dataContext: string,
    tenantId = 'system',
  ): Promise<{ data: BriefingOutput; error?: string }> {
    const startTime = Date.now();
    try {
      const result = await generateText({
        model: this.mistralProvider.getChatModel(),
        system: SYSTEM_PROMPT,
        prompt: dataContext + '\n\nReturn valid JSON.',
      });

      this.ledgerService?.recordRun({
        tenantId,
        userId: 'system',
        runType: 'briefing',
        model: this.mistralProvider.getChatModelName(),
        promptTokens: result.usage?.inputTokens ?? 0,
        completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0,
        latencyMs: Date.now() - startTime,
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

      const parsed = parseJsonOutput(result.text, briefingSchema);
      await this.trackUsage();
      return { data: parsed };
    } catch (firstError) {
      this.ledgerService?.recordRun({
        tenantId,
        userId: 'system',
        runType: 'briefing',
        model: this.mistralProvider.getChatModelName(),
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        latencyMs: Date.now() - startTime,
        status: AiRunStatus.FAILED,
        errorMessage: firstError instanceof Error ? firstError.message : String(firstError),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

      this.logger.error(`Briefing generation failed: ${firstError}`);
      return { data: SAFE_FALLBACK, error: 'Briefing generation failed' };
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
