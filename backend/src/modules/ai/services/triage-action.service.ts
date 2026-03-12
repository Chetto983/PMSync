/**
 * TriageActionService -- Bridges triage detection → follow-up/reminder creation.
 *
 * After analyzeEmailUnified() returns, this service:
 * 1. Creates EmailFollowUp records for needsFollowUp/hasDeadline signals
 * 2. (Phase 3) Creates HITL-gated ActionQueue entries for calendar reminders
 *
 * Zero additional LLM calls — purely acts on existing triage output.
 *
 * Phase CONSOLIDATION: Triage + Follow-Up + Reminder unification.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ActionStatus, FollowUpStatus, FollowUpType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { UnifiedEmailAnalysis } from '../types/email-insights.types';

/** Minimal email fields needed to determine follow-up type */
interface TriageEmailContext {
  emailId: string;
  tenantId: string;
  userId: string;
  from: string;
  subject: string | null;
}

/** Result of processing triage signals */
export interface TriageActionResult {
  followUpCreated: boolean;
  followUpId: string | null;
  followUpType: FollowUpType | null;
  dueDate: Date | null;
}

/** Default follow-up window: 3 business days from now */
function defaultDueDate(): Date {
  const d = new Date();
  let added = 0;
  while (added < 3) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  d.setHours(9, 0, 0, 0); // 09:00 local
  return d;
}

@Injectable()
export class TriageActionService {
  private readonly logger = new Logger(TriageActionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Process triage signals and create follow-up records.
   *
   * Called after analyzeEmailUnified() by EmailTriageService.
   * Only creates records when needsFollowUp or hasDeadline is true.
   */
  async processTriageSignals(
    context: TriageEmailContext,
    analysis: UnifiedEmailAnalysis,
  ): Promise<TriageActionResult> {
    const empty: TriageActionResult = {
      followUpCreated: false,
      followUpId: null,
      followUpType: null,
      dueDate: null,
    };

    // Skip if no actionable signals
    if (!analysis.needsFollowUp && !analysis.hasDeadline) {
      return empty;
    }

    try {
      // Determine follow-up type based on email direction
      const followUpType = await this.determineFollowUpType(
        context.tenantId,
        context.userId,
        context.from,
      );

      // Determine due date: deadlineDate > followUpDate > default +3 business days
      const dueDate = analysis.deadlineDate
        ? new Date(analysis.deadlineDate)
        : analysis.followUpDate
          ? new Date(analysis.followUpDate)
          : defaultDueDate();

      // Build reason from analysis
      const reason = this.buildReason(analysis);

      // Upsert EmailFollowUp (unique on emailId + tenantId)
      const followUp = await this.prisma.emailFollowUp.upsert({
        where: {
          emailId_tenantId: {
            emailId: context.emailId,
            tenantId: context.tenantId,
          },
        },
        create: {
          tenantId: context.tenantId,
          userId: context.userId,
          emailId: context.emailId,
          status: FollowUpStatus.PENDING,
          followUpType,
          reason,
          dueDate,
          confidence: analysis.confidence,
          detectedDeadline: analysis.deadlineDate
            ? new Date(analysis.deadlineDate)
            : null,
          deadlineSource: analysis.hasDeadline ? 'triage' : null,
        },
        update: {
          // Only update if not already resolved
          reason,
          dueDate,
          confidence: analysis.confidence,
          detectedDeadline: analysis.deadlineDate
            ? new Date(analysis.deadlineDate)
            : null,
          deadlineSource: analysis.hasDeadline ? 'triage' : null,
        },
      });

      this.logger.debug(
        `Follow-up created for email ${context.emailId}: type=${followUpType}, due=${dueDate.toISOString()}, confidence=${analysis.confidence}`,
      );

      // Phase 3: Create HITL-gated calendar reminder for high-urgency deadlines
      if (
        analysis.hasDeadline &&
        dueDate &&
        (analysis.urgency === 'critical' || analysis.urgency === 'high')
      ) {
        await this.createReminderAction(context, followUp.id, dueDate, reason);
      }

      return {
        followUpCreated: true,
        followUpId: followUp.id,
        followUpType,
        dueDate,
      };
    } catch (error) {
      // Non-blocking: triage should not fail because follow-up creation failed
      this.logger.warn(
        `Failed to create follow-up for email ${context.emailId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return empty;
    }
  }

  /**
   * Determine follow-up type: WAITING_FOR (user sent) vs TODO (user received).
   *
   * Checks if the email sender matches the user's configured email addresses.
   */
  private async determineFollowUpType(
    tenantId: string,
    userId: string,
    emailFrom: string,
  ): Promise<FollowUpType> {
    try {
      // Check if sender matches any of the user's provider emails
      const providers = await this.prisma.providerConfig.findMany({
        where: { tenantId, userId, isActive: true },
        select: { email: true },
      });

      const userEmails = providers
        .map((p) => p.email?.toLowerCase())
        .filter(Boolean) as string[];

      const senderLower = emailFrom.toLowerCase().trim();
      // Extract email from "Name <email>" format
      const match = senderLower.match(/<([^>]+)>/);
      const senderEmail = match ? match[1] : senderLower;

      if (userEmails.some((e) => senderEmail.includes(e) || e.includes(senderEmail))) {
        return FollowUpType.WAITING_FOR; // User sent this, waiting for response
      }
    } catch {
      // Fall through to default
    }

    return FollowUpType.TODO; // User received this, needs to take action
  }

  /**
   * Create a HITL-gated ActionQueue entry for calendar reminder.
   * User must approve before the calendar event is created.
   */
  private async createReminderAction(
    context: TriageEmailContext,
    followUpId: string,
    dueDate: Date,
    reason: string,
  ): Promise<void> {
    try {
      // Check if a reminder action already exists for this email
      const existing = await this.prisma.actionQueue.findFirst({
        where: {
          tenantId: context.tenantId,
          userId: context.userId,
          actionType: 'CREATE_REMINDER',
          status: ActionStatus.PENDING_APPROVAL,
          actionPayload: { path: ['emailId'], equals: context.emailId },
        },
      });
      if (existing) return; // Already pending

      const reminderTime = new Date(dueDate);
      reminderTime.setMinutes(reminderTime.getMinutes() - 30); // 30 min before deadline

      await this.prisma.actionQueue.create({
        data: {
          tenantId: context.tenantId,
          userId: context.userId,
          conversationId: `triage-${context.emailId}`,
          actionType: 'CREATE_REMINDER',
          actionPayload: {
            title: `Follow up: ${context.subject || 'Email'}`,
            startTime: reminderTime.toISOString(),
            endTime: dueDate.toISOString(),
            emailId: context.emailId,
            followUpId,
            description: reason,
          },
          confidence: 0.8,
          reasoning: `Auto-triage detected high-urgency deadline for "${context.subject || 'email'}"`,
          status: ActionStatus.PENDING_APPROVAL,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour expiry
        },
      });

      this.logger.debug(
        `Reminder action created for email ${context.emailId}: due=${dueDate.toISOString()}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to create reminder action for ${context.emailId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Build a human-readable reason from analysis data.
   */
  private buildReason(analysis: UnifiedEmailAnalysis): string {
    const parts: string[] = [];

    if (analysis.hasDeadline && analysis.deadlineDate) {
      parts.push(`Deadline: ${new Date(analysis.deadlineDate).toLocaleDateString()}`);
    }

    if (analysis.needsFollowUp) {
      parts.push(analysis.followUpReason || 'Follow-up needed');
    }

    if (!parts.length && analysis.reasoning) {
      parts.push(analysis.reasoning.slice(0, 200));
    }

    return parts.join(' — ') || 'Detected by auto-triage';
  }
}
