/**
 * Follow-up Tracking Service
 *
 * Proactive AI Secretary feature to track emails awaiting response.
 * Critical for secretary role: human secretaries always track pending follow-ups.
 *
 * Features:
 * - Pattern detection for emails needing follow-up (questions, requests)
 * - Automatic follow-up creation for sent emails
 * - Reply detection to auto-resolve follow-ups
 *
 * Architecture (SRP Refactored):
 * - FollowUpService: Core CRUD + detection logic (this file)
 * - FollowUpQueueService: BullMQ scheduler + reminders
 * - FollowUpScannerService: RAG-based batch scanning
 *
 * Reference:
 * - docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md Phase 1
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { getErrorMessage } from '../../../../common/utils';
import { FollowUpStatus, EmailFollowUp, Prisma } from '@prisma/client';
import { MistralService } from '../../services/mistral.service';
import { FollowUpQueueService } from './follow-up-queue.service';
import { FollowUpScannerService, FollowUpScanResult, FollowUpScanOptions } from './follow-up-scanner.service';
import {
  FollowUpExtractionService,
  EmailExtractionResult,
  ExtractedCommitment,
  ExtractedWaitingFor,
  ExtractedActionItem,
} from './follow-up-extraction.service';

/**
 * Patterns that indicate an email needs follow-up (English + Italian)
 * Used as fast pre-filter before LLM analysis
 */
const FOLLOW_UP_PATTERNS = [
  // Questions (universal)
  /\?$/m,
  /\?\s*$/m,

  // === ENGLISH ===
  /please\s+(let\s+me\s+know|respond|reply|confirm|send|provide|update)/i,
  /looking\s+forward\s+to\s+(hearing|your\s+response)/i,
  /can\s+you\s+(please\s+)?(confirm|send|provide|check)/i,
  /could\s+you\s+(please\s+)?(confirm|send|provide|let)/i,
  /would\s+you\s+(please\s+)?(be\s+able|mind|kindly)/i,
  /waiting\s+for\s+your/i,
  /await(ing)?\s+(your|a)\s+response/i,
  /by\s+(friday|monday|tuesday|wednesday|thursday|end\s+of\s+(week|day|month))/i,
  /before\s+(friday|monday|the\s+meeting)/i,
  /need\s+(this|it|a\s+response)\s+by/i,
  /get\s+back\s+to\s+(you|me)/i,
  /follow\s*up\s+on/i,
  /touch\s+base/i,
  /circle\s+back/i,

  // === ITALIAN ===
  /per\s+favore\s+(fammi\s+sapere|rispondi|conferma|invia|mandami)/i,
  /potresti\s+(per\s+favore\s+)?(confermare|inviarmi|mandarmi|farmi\s+sapere)/i,
  /puoi\s+(per\s+favore\s+)?(confermare|inviarmi|mandarmi|controllare)/i,
  /vorrei\s+(sapere|ricevere|avere\s+conferma)/i,
  /ti\s+(chiedo|prego)\s+(di\s+)?(confermare|rispondere|inviarmi)/i,
  /mi\s+fai\s+sapere/i,
  /fammi\s+sapere/i,
  /resto\s+in\s+attesa/i,
  /attendo\s+(una\s+)?(tua\s+)?(risposta|conferma|riscontro)/i,
  /in\s+attesa\s+di\s+(un\s+)?(tuo\s+)?(riscontro|feedback|risposta)/i,
  /aspetto\s+(una\s+)?(tua\s+)?(risposta|conferma)/i,
  /entro\s+(venerd[ìi]|luned[ìi]|marted[ìi]|mercoled[ìi]|gioved[ìi]|fine\s+(settimana|mese|giornata))/i,
  /prima\s+(di|del|della)\s+(venerd[ìi]|luned[ìi]|riunione|meeting)/i,
  /ho\s+bisogno\s+(di\s+una\s+risposta\s+)?entro/i,
  /mi\s+serve\s+entro/i,
  /ti\s+ricontatto/i,
  /ci\s+sentiamo/i,
  /ci\s+aggiorniamo/i,
  /rimango\s+in\s+attesa/i,
  /sollecito/i,
  /urgente/i,
];

/**
 * Patterns that suggest this is an informational email (no follow-up needed)
 */
const NO_FOLLOW_UP_PATTERNS = [
  // === ENGLISH ===
  /fyi|for\s+your\s+information/i,
  /no\s+(response|reply|action)\s+(needed|required)/i,
  /just\s+(wanted\s+to\s+)?let\s+you\s+know/i,
  /auto(-|\s)?reply|out\s+of\s+office/i,
  /newsletter|unsubscribe/i,
  /do\s+not\s+reply/i,

  // === ITALIAN ===
  /per\s+(tua\s+)?informazione/i,
  /non\s+(è\s+)?(necessaria|richiesta)\s+(una\s+)?(risposta|azione)/i,
  /solo\s+per\s+(tua\s+)?informazione/i,
  /risposta\s+automatica|fuori\s+ufficio/i,
  /annulla\s+iscrizione|cancellati/i,
  /non\s+rispondere/i,
  /ti\s+informo\s+(solo\s+)?che/i,
  /volevo\s+solo\s+(farti\s+sapere|informarti)/i,
];

/**
 * LLM analysis result with confidence score
 */
export interface LlmAnalysisResult {
  needsFollowUp: boolean;
  confidence: number;
  reason: string | null;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  dueDate: Date | null;
}

/**
 * VIP domains/patterns that boost follow-up confidence
 * Emails to/from these contacts are more likely to need follow-up
 */
const VIP_CONTACT_PATTERNS = [
  /board\./i,
  /investor/i,
  /ceo@/i,
  /cto@/i,
  /cfo@/i,
  /coo@/i,
  /partner/i,
  /legal/i,
  /compliance/i,
  /executive/i,
  /director/i,
  /vp@|vice\.?president/i,
];

/**
 * Check if email involves VIP contact
 */
function isVipContact(email: string): boolean {
  if (!email) return false;
  return VIP_CONTACT_PATTERNS.some((pattern) => pattern.test(email));
}

/**
 * Calculate confidence boost based on relationship (VIP contacts)
 */
function getRelationshipBoost(fromEmail: string, toEmails: string[]): number {
  const allEmails = [fromEmail, ...toEmails].filter(Boolean);
  const hasVip = allEmails.some((e) => isVipContact(e));
  return hasVip ? 0.15 : 0;
}

/**
 * Input for creating a follow-up
 */
export interface CreateFollowUpInput {
  tenantId: string;
  userId: string;
  emailId: string;
  reason?: string;
  dueDate?: Date;
  // Extraction data (uses types from follow-up-extraction.service)
  commitments?: ExtractedCommitment[];
  waitingFor?: ExtractedWaitingFor[];
  actionItems?: ExtractedActionItem[];
  emailType?: string;
  confidence?: number;
}

/**
 * Options for listing follow-ups
 */
export interface ListFollowUpsOptions {
  status?: FollowUpStatus | FollowUpStatus[];
  limit?: number;
  offset?: number;
  orderBy?: 'dueDate' | 'createdAt';
  orderDir?: 'asc' | 'desc';
}

/**
 * Follow-up statistics
 */
export interface FollowUpStats {
  total: number;
  pending: number;
  reminded: number;
  resolved: number;
  expired: number;
  dueToday: number;
  overdue: number;
}

@Injectable()
export class FollowUpService implements OnModuleInit {
  private readonly logger = new Logger(FollowUpService.name);
  private readonly enabled: boolean;

  // Configuration
  private readonly defaultDueDays: number;
  private readonly cacheKeyPrefix = 'follow-up';
  private readonly cacheTtl = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly mistralService: MistralService,
    private readonly queueService: FollowUpQueueService,
    private readonly scannerService: FollowUpScannerService,
    private readonly extractionService: FollowUpExtractionService,
  ) {
    this.enabled = this.configService.get<string>('AI_FOLLOW_UP_ENABLED', 'true') === 'true';
    this.defaultDueDays = this.configService.get<number>('AI_FOLLOW_UP_DUE_DAYS', 3);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Follow-up tracking disabled by configuration');
      return;
    }

    // Wire up callbacks for queue and scanner services
    this.queueService.setReminderProcessor(
      this.processReminder.bind(this),
    );

    this.scannerService.setCallbacks(
      this.createFollowUpFromScan.bind(this),
      this.analyzeWithLlm.bind(this),
    );

    this.logger.log('Follow-up tracking service initialized');
  }

  // ==========================================================================
  // PATTERN DETECTION
  // ==========================================================================

  /**
   * Analyze email body to detect if follow-up is needed (fast regex filter)
   */
  analyzeForFollowUp(body: string, subject?: string): { needsFollowUp: boolean; reason: string | null } {
    // Check if it's an informational email first
    for (const pattern of NO_FOLLOW_UP_PATTERNS) {
      if (pattern.test(body) || (subject && pattern.test(subject))) {
        return { needsFollowUp: false, reason: null };
      }
    }

    // Check for follow-up patterns
    for (const pattern of FOLLOW_UP_PATTERNS) {
      if (pattern.test(body)) {
        return { needsFollowUp: true, reason: this.getReasonFromPattern(pattern) };
      }
    }

    // Check subject line
    if (subject) {
      for (const pattern of FOLLOW_UP_PATTERNS) {
        if (pattern.test(subject)) {
          return { needsFollowUp: true, reason: 'Question or request in subject' };
        }
      }
    }

    return { needsFollowUp: false, reason: null };
  }

  /**
   * Get human-readable reason from matched pattern
   */
  private getReasonFromPattern(pattern: RegExp): string {
    const patternStr = pattern.source.toLowerCase();
    if (patternStr.includes('?')) return 'Contains question';
    if (patternStr.includes('please')) return 'Contains request';
    if (patternStr.includes('waiting') || patternStr.includes('await')) return 'Awaiting response';
    if (patternStr.includes('by') || patternStr.includes('before')) return 'Has deadline';
    if (patternStr.includes('follow') || patternStr.includes('circle')) return 'Follow-up mentioned';
    return 'Follow-up needed';
  }

  /**
   * Analyze email with LLM for robust detection
   * Returns confidence score (0.0-1.0) for integration with RAG scanner
   */
  async analyzeWithLlm(
    tenantId: string,
    userId: string,
    body: string,
    subject?: string,
  ): Promise<{ needsFollowUp: boolean; confidence: number; reason: string | null; dueDate: Date | null }> {
    try {
      const prompt = `
You are an expert Executive Assistant. Analyze this SENT email to determine if I need to track it for a follow-up.
I only need to track emails where I am expecting a reply, action, or confirmation from the recipient.

Email Subject: ${subject || '(No Subject)'}
Email Body:
"""
${body.slice(0, 2000)}
"""

Instructions:
1. Ignore "FYI" emails, newsletters, or emails where the conversation is finished.
2. Look for questions, requests, deadlines, or phrases like "let me know", "looking forward to", "waiting for".
3. If follow-up is needed, determine the urgency and a specific reason.
4. Rate your confidence from 0.0 to 1.0 based on signal strength:
   - 0.9-1.0: Explicit question or deadline mentioned
   - 0.7-0.9: Clear request or "waiting for" phrase
   - 0.5-0.7: Implicit expectation of response
   - 0.3-0.5: Ambiguous, might need response
   - 0.0-0.3: Probably doesn't need follow-up
5. Extract a due date if mentioned. If not mentioned, estimate based on urgency (High=2 days, Normal=4 days, Low=7 days).
6. IMPORTANT for urgency: Mark as "urgent" ONLY if there's an explicit deadline today/tomorrow, security alert, or explicit ASAP. Routine emails are NOT urgent.
7. Current Date: ${new Date().toISOString().split('T')[0]}

Return JSON ONLY (no markdown):
{
  "needsFollowUp": boolean,
  "confidence": number (0.0-1.0),
  "reason": "Concise human-readable reason (max 10 words)",
  "priority": "HIGH" | "NORMAL" | "LOW",
  "suggestedDueInDays": number,
  "extractedDeadline": "YYYY-MM-DD" | null
}
      `.trim();

      const response = await this.mistralService.generateResponse(
        tenantId,
        userId,
        prompt,
        [],
        { timeoutMs: 15000, conversationId: `follow-up-${Date.now()}` }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      const result = JSON.parse(jsonStr);

      // Extract confidence with fallback based on priority
      let confidence = typeof result.confidence === 'number' ? result.confidence : 0.5;
      if (confidence === 0.5 && result.priority) {
        // Fallback: map priority to confidence if LLM didn't provide explicit confidence
        const priorityConfidenceMap: Record<string, number> = {
          'HIGH': 0.85,
          'NORMAL': 0.65,
          'LOW': 0.45,
        };
        confidence = priorityConfidenceMap[result.priority] ?? 0.5;
      }

      if (!result.needsFollowUp) {
        return { needsFollowUp: false, confidence, reason: null, dueDate: null };
      }

      // Calculate due date from extracted deadline or suggested days
      let dueDate: Date;
      if (result.extractedDeadline) {
        const parsed = new Date(result.extractedDeadline);
        if (!isNaN(parsed.getTime())) {
          dueDate = parsed;
        } else {
          const days = typeof result.suggestedDueInDays === 'number' ? result.suggestedDueInDays : this.defaultDueDays;
          dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + days);
        }
      } else {
        const days = typeof result.suggestedDueInDays === 'number' ? result.suggestedDueInDays : this.defaultDueDays;
        dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + days);
      }

      return {
        needsFollowUp: true,
        confidence,
        reason: result.reason || 'Follow-up detected by AI',
        dueDate
      };
    } catch (error) {
      this.logger.warn(`LLM analysis failed: ${getErrorMessage(error)}`);
      return { needsFollowUp: false, confidence: 0, reason: null, dueDate: null };
    }
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  /**
   * Create a follow-up for an email
   */
  async createFollowUp(input: CreateFollowUpInput): Promise<EmailFollowUp> {
    const {
      tenantId,
      userId,
      emailId,
      reason,
      dueDate,
      commitments,
      waitingFor,
      actionItems,
      emailType,
      confidence,
    } = input;

    const existing = await this.prisma.emailFollowUp.findFirst({
      where: {
        tenantId,
        userId,
        emailId,
        status: { in: ['PENDING', 'REMINDED'] },
      },
    });

    if (existing) {
      this.logger.debug(`Follow-up already exists for email ${emailId}`);
      return existing;
    }

    const finalDueDate = dueDate || this.getDefaultDueDate();

    const followUp = await this.prisma.emailFollowUp.create({
      data: {
        tenantId,
        userId,
        emailId,
        reason: reason ?? null,
        dueDate: finalDueDate,
        status: 'PENDING',
        // Extraction data (persisted for VoltAgent access)
        commitments: commitments?.length ? (commitments as unknown as Prisma.InputJsonValue) : undefined,
        waitingFor: waitingFor?.length ? (waitingFor as unknown as Prisma.InputJsonValue) : undefined,
        actionItems: actionItems?.length ? (actionItems as unknown as Prisma.InputJsonValue) : undefined,
        emailType: emailType ?? undefined,
        confidence: confidence ?? undefined,
      },
    });

    // Schedule reminder via queue service
    await this.queueService.scheduleReminder(followUp.id, finalDueDate, tenantId, userId);

    await this.invalidateCache(tenantId, userId);

    this.logger.log(`Created follow-up ${followUp.id} for email ${emailId}`);

    return followUp;
  }

  /**
   * Analyze a sent email and create follow-up if needed.
   * Uses LLM confidence scoring with VIP relationship boost.
   * Also extracts commitments, waiting-for items via FollowUpExtractionService.
   *
   * @param fromEmail - Optional sender email for VIP boost calculation
   * @param toEmails - Optional recipient emails for VIP boost calculation
   * @param isSentByUser - Whether email was sent by user (affects extraction perspective)
   */
  async analyzeAndCreateFollowUp(
    tenantId: string,
    userId: string,
    emailId: string,
    body: string,
    subject?: string,
    fromEmail?: string,
    toEmails?: string[],
    isSentByUser = true,
  ): Promise<{ followUp: EmailFollowUp | null; extraction: EmailExtractionResult | null }> {
    // Fast filter: reject obvious junk
    let isObviousJunk = false;
    for (const pattern of NO_FOLLOW_UP_PATTERNS) {
      if (pattern.test(body) || (subject && pattern.test(subject))) {
        isObviousJunk = true;
        break;
      }
    }

    if (isObviousJunk) {
      return { followUp: null, extraction: null };
    }

    // Run LLM analysis and extraction in parallel for efficiency
    const [llmResult, extraction] = await Promise.all([
      this.analyzeWithLlm(tenantId, userId, body, subject),
      this.extractionService.extractFromEmail(tenantId, userId, subject || '', body, isSentByUser),
    ]);

    // Log extraction results for debugging
    if (extraction.commitments.length > 0 || extraction.waitingFor.length > 0) {
      this.logger.debug(
        `Extraction for email ${emailId}: ${extraction.commitments.length} commitments, ${extraction.waitingFor.length} waiting-for`,
      );
    }

    // Apply VIP relationship boost if email addresses provided
    const relationshipBoost = fromEmail
      ? getRelationshipBoost(fromEmail, toEmails || [])
      : 0;
    const adjustedConfidence = Math.min(1.0, (llmResult.confidence || 0.5) + relationshipBoost);

    // Boost confidence if extraction found waiting-for items
    const extractionBoost = extraction.waitingFor.length > 0 ? 0.1 : 0;
    const finalConfidence = Math.min(1.0, adjustedConfidence + extractionBoost);

    // Confidence threshold: 0.6 minimum to create follow-up
    const CONFIDENCE_THRESHOLD = 0.6;

    // Also create follow-up if extraction indicates response needed
    const needsFollowUp = llmResult.needsFollowUp || extraction.needsResponse;

    if (needsFollowUp && finalConfidence >= CONFIDENCE_THRESHOLD) {
      // Build reason from LLM + extraction
      let reason = llmResult.reason || 'Follow-up needed';
      if (extraction.waitingFor.length > 0) {
        reason = `Waiting for: ${extraction.waitingFor[0].waitingFor}`;
      }
      if (relationshipBoost > 0) {
        reason = `${reason} (VIP contact)`;
      }

      const followUp = await this.createFollowUp({
        tenantId,
        userId,
        emailId,
        reason,
        dueDate: llmResult.dueDate ?? undefined,
        // Persist extraction data for VoltAgent access
        commitments: extraction.commitments,
        waitingFor: extraction.waitingFor,
        actionItems: extraction.actionItems,
        emailType: extraction.emailType,
        confidence: finalConfidence,
      });

      return { followUp, extraction };
    }

    return { followUp: null, extraction };
  }

  /**
   * Get a specific follow-up
   */
  async getFollowUp(tenantId: string, userId: string, id: string): Promise<EmailFollowUp | null> {
    return this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
      include: {
        email: {
          select: {
            id: true,
            subject: true,
            from: true,
            to: true,
            receivedAt: true,
            sentAt: true,
            bodyText: true,
          }
        }
      }
    });
  }

  /**
   * List follow-ups for a user
   */
  async listFollowUps(
    tenantId: string,
    userId: string,
    options: ListFollowUpsOptions = {},
  ): Promise<EmailFollowUp[]> {
    const { status, limit = 50, offset = 0, orderBy = 'dueDate', orderDir = 'asc' } = options;

    const where: Record<string, unknown> = { tenantId, userId };
    if (status) {
      where.status = Array.isArray(status) ? { in: status } : status;
    }

    return this.prisma.emailFollowUp.findMany({
      where,
      orderBy: { [orderBy]: orderDir },
      take: limit,
      skip: offset,
      include: {
        email: {
          select: {
            id: true,
            subject: true,
            from: true,
            to: true,
            receivedAt: true,
            sentAt: true,
            bodyText: true,
          }
        }
      }
    });
  }

  /**
   * Get pending follow-ups (cached)
   */
  async getPendingFollowUps(tenantId: string, userId: string, limit = 20): Promise<EmailFollowUp[]> {
    const cacheKey = `${this.cacheKeyPrefix}:pending:${tenantId}:${userId}`;

    try {
      const cached = await this.cacheService.get<EmailFollowUp[]>(cacheKey);
      if (cached) {
        return cached.slice(0, limit);
      }
    } catch {
      // Cache miss
    }

    const followUps = await this.listFollowUps(tenantId, userId, {
      status: ['PENDING', 'REMINDED'],
      limit: Math.max(limit, 50),
      orderBy: 'dueDate',
      orderDir: 'asc',
    });

    try {
      await this.cacheService.set(cacheKey, followUps, { ttl: this.cacheTtl });
    } catch {
      // Ignore cache errors
    }

    return followUps.slice(0, limit);
  }

  /**
   * Get overdue follow-ups
   */
  async getOverdueFollowUps(tenantId: string, userId: string, limit = 20): Promise<EmailFollowUp[]> {
    return this.prisma.emailFollowUp.findMany({
      where: {
        tenantId,
        userId,
        status: { in: ['PENDING', 'REMINDED'] },
        dueDate: { lt: new Date() },
      },
      orderBy: { dueDate: 'asc' },
      take: limit,
      include: {
        email: {
          select: {
            id: true,
            subject: true,
            from: true,
            to: true,
            receivedAt: true,
            sentAt: true,
          }
        }
      }
    });
  }

  /**
   * Get follow-up statistics
   */
  async getStats(tenantId: string, userId: string): Promise<FollowUpStats> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const [total, pending, reminded, resolved, expired, dueToday, overdue] = await Promise.all([
      this.prisma.emailFollowUp.count({ where: { tenantId, userId } }),
      this.prisma.emailFollowUp.count({ where: { tenantId, userId, status: 'PENDING' } }),
      this.prisma.emailFollowUp.count({ where: { tenantId, userId, status: 'REMINDED' } }),
      this.prisma.emailFollowUp.count({ where: { tenantId, userId, status: 'RESOLVED' } }),
      this.prisma.emailFollowUp.count({ where: { tenantId, userId, status: 'EXPIRED' } }),
      this.prisma.emailFollowUp.count({
        where: {
          tenantId, userId,
          status: { in: ['PENDING', 'REMINDED'] },
          dueDate: { gte: startOfToday, lt: endOfToday },
        },
      }),
      this.prisma.emailFollowUp.count({
        where: {
          tenantId, userId,
          status: { in: ['PENDING', 'REMINDED'] },
          dueDate: { lt: now },
        },
      }),
    ]);

    return { total, pending, reminded, resolved, expired, dueToday, overdue };
  }

  // ==========================================================================
  // RESOLUTION
  // ==========================================================================

  /**
   * Resolve a follow-up (manually or when reply received)
   */
  async resolveFollowUp(
    tenantId: string,
    userId: string,
    id: string,
    resolvedBy: 'REPLY_RECEIVED' | 'MANUAL' | 'AUTO_EXPIRED' = 'MANUAL',
  ): Promise<EmailFollowUp> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!followUp) {
      throw new Error('Follow-up not found');
    }

    await this.prisma.emailFollowUp.updateMany({
      where: { id, tenantId, userId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy,
      },
    });

    await this.queueService.cancelReminder(id);
    await this.invalidateCache(tenantId, userId);

    this.logger.log(`Resolved follow-up ${id} by ${resolvedBy}`);

    const updated = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!updated) {
      throw new Error('Follow-up not found');
    }

    return updated;
  }

  /**
   * Check if a reply was received for a follow-up email
   */
  async checkForReplyByEmailId(tenantId: string, userId: string, originalEmailId: string): Promise<boolean> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: {
        tenantId,
        userId,
        emailId: originalEmailId,
        status: { in: ['PENDING', 'REMINDED'] },
      },
    });

    if (followUp) {
      await this.resolveFollowUp(tenantId, userId, followUp.id, 'REPLY_RECEIVED');
      return true;
    }

    return false;
  }

  /**
   * Snooze a follow-up (extend due date)
   */
  async snoozeFollowUp(tenantId: string, userId: string, id: string, newDueDate: Date): Promise<EmailFollowUp> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!followUp) {
      throw new Error('Follow-up not found');
    }

    await this.prisma.emailFollowUp.updateMany({
      where: { id, tenantId, userId },
      data: {
        dueDate: newDueDate,
        status: 'PENDING',
        remindCount: 0,
      },
    });

    await this.queueService.cancelReminder(id);
    await this.queueService.scheduleReminder(id, newDueDate, tenantId, userId);
    await this.invalidateCache(tenantId, userId);

    this.logger.log(`Snoozed follow-up ${id} to ${newDueDate.toISOString()}`);

    const updated = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!updated) {
      throw new Error('Follow-up not found');
    }

    return updated;
  }

  /**
   * Delete a follow-up
   */
  async deleteFollowUp(tenantId: string, userId: string, id: string): Promise<void> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!followUp) {
      throw new Error('Follow-up not found');
    }

    await this.prisma.emailFollowUp.deleteMany({
      where: { id, tenantId, userId },
    });

    await this.queueService.cancelReminder(id);
    await this.invalidateCache(tenantId, userId);

    this.logger.log(`Deleted follow-up ${id}`);
  }

  // ==========================================================================
  // RAG SCANNING (Delegated to FollowUpScannerService)
  // ==========================================================================

  /**
   * Scan emails for follow-up candidates using RAG semantic search.
   * Delegates to FollowUpScannerService.
   */
  async scanEmailsForFollowUps(
    tenantId: string,
    userId: string,
    options: FollowUpScanOptions = {},
  ): Promise<FollowUpScanResult> {
    return this.scannerService.scanEmailsForFollowUps(tenantId, userId, options);
  }

  // ==========================================================================
  // CALLBACKS (for Queue/Scanner services)
  // ==========================================================================

  /**
   * Process a reminder (callback for FollowUpQueueService)
   */
  private async processReminder(followUpId: string, tenantId: string, userId: string): Promise<void> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id: followUpId, tenantId, userId },
    });

    if (!followUp || followUp.status === 'RESOLVED' || followUp.status === 'EXPIRED') {
      return;
    }

    const maxReminders = this.configService.get<number>('AI_FOLLOW_UP_MAX_REMINDERS', 3);

    if ((followUp.remindCount ?? 0) >= maxReminders) {
      await this.prisma.emailFollowUp.updateMany({
        where: { id: followUpId, tenantId, userId },
        data: { status: 'EXPIRED', resolvedBy: 'AUTO_EXPIRED', resolvedAt: new Date() },
      });
      await this.invalidateCache(tenantId, userId);
      return;
    }

    await this.prisma.emailFollowUp.updateMany({
      where: { id: followUpId, tenantId, userId },
      data: {
        status: 'REMINDED',
        remindCount: { increment: 1 },
        lastRemindedAt: new Date(),
      },
    });

    await this.invalidateCache(tenantId, userId);
    this.logger.log(`Sent reminder for follow-up ${followUpId}`);
  }

  /**
   * Create follow-up from scanner (callback for FollowUpScannerService)
   */
  private async createFollowUpFromScan(
    tenantId: string,
    userId: string,
    emailId: string,
    reason: string,
    dueDate?: Date,
  ): Promise<void> {
    await this.createFollowUp({
      tenantId,
      userId,
      emailId,
      reason,
      dueDate,
    });
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Get default due date (configurable days from now)
   */
  private getDefaultDueDate(): Date {
    return new Date(Date.now() + this.defaultDueDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Invalidate cache for a user
   */
  private async invalidateCache(tenantId: string, userId: string): Promise<void> {
    try {
      await this.cacheService.del(`${this.cacheKeyPrefix}:pending:${tenantId}:${userId}`);
    } catch {
      // Ignore cache errors
    }
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
