/**
 * Follow-up Tracking Service - AI analysis and orchestration.
 * CRUD delegated to FollowUpCrudService (Phase 11-02).
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getErrorMessage } from '../../../../common/utils';
import { FollowUpStatus, FollowUpType, EmailFollowUp } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralService } from '../../services/mistral.service';
import { FollowUpQueueService } from './follow-up-queue.service';
import { FollowUpScannerService, FollowUpScanResult, FollowUpScanOptions } from './follow-up-scanner.service';
import {
  FollowUpExtractionService,
  EmailExtractionResult,
} from './follow-up-extraction.service';
import {
  FollowUpCrudService,
  CreateFollowUpInput,
  ListFollowUpsOptions,
  FollowUpStats,
} from './follow-up-crud.service';

// Re-export types for backward compatibility
export type { CreateFollowUpInput, ListFollowUpsOptions, FollowUpStats };

/** Follow-up patterns (EN + IT) */
const FOLLOW_UP_PATTERNS = [
  /\?$/m, /\?\s*$/m, // Questions
  /please\s+(let\s+me\s+know|respond|reply|confirm|send|provide|update)/i,
  /looking\s+forward\s+to\s+(hearing|your\s+response)/i,
  /can\s+you\s+(please\s+)?(confirm|send|provide|check)/i,
  /could\s+you\s+(please\s+)?(confirm|send|provide|let)/i,
  /would\s+you\s+(please\s+)?(be\s+able|mind|kindly)/i,
  /waiting\s+for\s+your/i, /await(ing)?\s+(your|a)\s+response/i,
  /by\s+(friday|monday|tuesday|wednesday|thursday|end\s+of\s+(week|day|month))/i,
  /before\s+(friday|monday|the\s+meeting)/i, /need\s+(this|it|a\s+response)\s+by/i,
  /get\s+back\s+to\s+(you|me)/i, /follow\s*up\s+on/i, /touch\s+base/i, /circle\s+back/i,
  /per\s+favore\s+(fammi\s+sapere|rispondi|conferma|invia|mandami)/i,
  /potresti\s+(per\s+favore\s+)?(confermare|inviarmi|mandarmi|farmi\s+sapere)/i,
  /puoi\s+(per\s+favore\s+)?(confermare|inviarmi|mandarmi|controllare)/i,
  /vorrei\s+(sapere|ricevere|avere\s+conferma)/i,
  /ti\s+(chiedo|prego)\s+(di\s+)?(confermare|rispondere|inviarmi)/i,
  /mi\s+fai\s+sapere/i, /fammi\s+sapere/i, /resto\s+in\s+attesa/i,
  /attendo\s+(una\s+)?(tua\s+)?(risposta|conferma|riscontro)/i,
  /in\s+attesa\s+di\s+(un\s+)?(tuo\s+)?(riscontro|feedback|risposta)/i,
  /aspetto\s+(una\s+)?(tua\s+)?(risposta|conferma)/i,
  /entro\s+(venerd[ìi]|luned[ìi]|marted[ìi]|mercoled[ìi]|gioved[ìi]|fine\s+(settimana|mese|giornata))/i,
  /prima\s+(di|del|della)\s+(venerd[ìi]|luned[ìi]|riunione|meeting)/i,
  /ho\s+bisogno\s+(di\s+una\s+risposta\s+)?entro/i, /mi\s+serve\s+entro/i,
  /ti\s+ricontatto/i, /ci\s+sentiamo/i, /ci\s+aggiorniamo/i, /rimango\s+in\s+attesa/i,
  /sollecito/i, /urgente/i,
];

/** No follow-up patterns (EN + IT) */
const NO_FOLLOW_UP_PATTERNS = [
  /fyi|for\s+your\s+information/i, /no\s+(response|reply|action)\s+(needed|required)/i,
  /just\s+(wanted\s+to\s+)?let\s+you\s+know/i, /auto(-|\s)?reply|out\s+of\s+office/i,
  /newsletter|unsubscribe/i, /do\s+not\s+reply/i, /per\s+(tua\s+)?informazione/i,
  /non\s+(è\s+)?(necessaria|richiesta)\s+(una\s+)?(risposta|azione)/i,
  /solo\s+per\s+(tua\s+)?informazione/i, /risposta\s+automatica|fuori\s+ufficio/i,
  /annulla\s+iscrizione|cancellati/i, /non\s+rispondere/i,
  /ti\s+informo\s+(solo\s+)?che/i, /volevo\s+solo\s+(farti\s+sapere|informarti)/i,
];

const VIP_PATTERNS = [/board\./i, /investor/i, /ceo@/i, /cto@/i, /cfo@/i, /coo@/i,
  /partner/i, /legal/i, /compliance/i, /executive/i, /director/i, /vp@|vice\.?president/i];

function isVipContact(email: string): boolean {
  return email ? VIP_PATTERNS.some((p) => p.test(email)) : false;
}

function getRelationshipBoost(fromEmail: string, toEmails: string[]): number {
  return [fromEmail, ...toEmails].filter(Boolean).some((e) => isVipContact(e)) ? 0.15 : 0;
}

export interface LlmAnalysisResult {
  needsFollowUp: boolean; confidence: number; reason: string | null;
  priority: 'HIGH' | 'NORMAL' | 'LOW'; dueDate: Date | null;
}

export interface SmartTimingRecommendation {
  suggestedDate: Date; reason: string; confidence: number;
}

@Injectable()
export class FollowUpService implements OnModuleInit {
  private readonly logger = new Logger(FollowUpService.name);
  private readonly enabled: boolean;
  private readonly defaultDueDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mistralService: MistralService,
    private readonly queueService: FollowUpQueueService,
    private readonly scannerService: FollowUpScannerService,
    private readonly extractionService: FollowUpExtractionService,
    private readonly crudService: FollowUpCrudService,
  ) {
    this.enabled = this.configService.get<string>('AI_FOLLOW_UP_ENABLED', 'true') === 'true';
    this.defaultDueDays = this.configService.get<number>('AI_FOLLOW_UP_DUE_DAYS', 3);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Follow-up tracking disabled by configuration');
      return;
    }

    // Configure CRUD service with queue and defaults
    this.crudService.setQueueService(this.queueService);
    this.crudService.setDefaultDueDays(this.defaultDueDays);

    // Wire up callbacks for queue and scanner services
    this.queueService.setReminderProcessor(this.processReminder.bind(this));
    this.scannerService.setCallbacks(
      this.createFollowUpFromScan.bind(this),
      this.analyzeWithLlm.bind(this),
    );

    this.logger.log('Follow-up tracking service initialized');
  }

  analyzeForFollowUp(body: string, subject?: string): { needsFollowUp: boolean; reason: string | null } {
    for (const pattern of NO_FOLLOW_UP_PATTERNS) {
      if (pattern.test(body) || (subject && pattern.test(subject))) {
        return { needsFollowUp: false, reason: null };
      }
    }

    for (const pattern of FOLLOW_UP_PATTERNS) {
      if (pattern.test(body)) {
        return { needsFollowUp: true, reason: this.getReasonFromPattern(pattern) };
      }
    }

    if (subject) {
      for (const pattern of FOLLOW_UP_PATTERNS) {
        if (pattern.test(subject)) {
          return { needsFollowUp: true, reason: 'Question or request in subject' };
        }
      }
    }

    return { needsFollowUp: false, reason: null };
  }

  private getReasonFromPattern(pattern: RegExp): string {
    const patternStr = pattern.source.toLowerCase();
    if (patternStr.includes('?')) return 'Contains question';
    if (patternStr.includes('please')) return 'Contains request';
    if (patternStr.includes('waiting') || patternStr.includes('await')) return 'Awaiting response';
    if (patternStr.includes('by') || patternStr.includes('before')) return 'Has deadline';
    if (patternStr.includes('follow') || patternStr.includes('circle')) return 'Follow-up mentioned';
    return 'Follow-up needed';
  }

  private detectFollowUpType(
    email: { folder: string | null },
    extraction?: { waitingFor?: unknown[]; actionItems?: unknown[] }
  ): FollowUpType {
    const folderPath = (email.folder || '').toLowerCase();
    const isSentFolder = folderPath.includes('sent') || folderPath.includes('envoy') || folderPath.includes('inviati');
    const hasWaitingFor = extraction?.waitingFor && Array.isArray(extraction.waitingFor) && extraction.waitingFor.length > 0;

    if (isSentFolder && hasWaitingFor) {
      return FollowUpType.WAITING_FOR;
    }

    return FollowUpType.TODO;
  }

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
4. Rate your confidence from 0.0 to 1.0 based on signal strength.
5. Extract a due date if mentioned. If not mentioned, estimate based on urgency.
6. IMPORTANT: Mark as "urgent" ONLY if there's an explicit deadline today/tomorrow.
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
        tenantId, userId, prompt, [],
        { timeoutMs: 15000, conversationId: `follow-up-${Date.now()}` }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      const result = JSON.parse(jsonStr);

      let confidence = typeof result.confidence === 'number' ? result.confidence : 0.5;
      if (confidence === 0.5 && result.priority) {
        const priorityConfidenceMap: Record<string, number> = { 'HIGH': 0.85, 'NORMAL': 0.65, 'LOW': 0.45 };
        confidence = priorityConfidenceMap[result.priority] ?? 0.5;
      }

      if (!result.needsFollowUp) {
        return { needsFollowUp: false, confidence, reason: null, dueDate: null };
      }

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

      return { needsFollowUp: true, confidence, reason: result.reason || 'Follow-up detected by AI', dueDate };
    } catch (error) {
      this.logger.warn(`LLM analysis failed: ${getErrorMessage(error)}`);
      return { needsFollowUp: false, confidence: 0, reason: null, dueDate: null };
    }
  }

  private calculateSmartTiming(createdAt: Date): SmartTimingRecommendation {
    const now = new Date();
    const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    let targetDate = new Date(createdAt);
    targetDate.setDate(targetDate.getDate() + 3);

    if (targetDate < now) {
      targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + 1);
    }

    const dayOfWeek = targetDate.getDay();
    if (dayOfWeek === 0) targetDate.setDate(targetDate.getDate() + 2);
    if (dayOfWeek === 6) targetDate.setDate(targetDate.getDate() + 3);
    if (dayOfWeek === 5) targetDate.setDate(targetDate.getDate() + 4);
    if (dayOfWeek === 1) targetDate.setDate(targetDate.getDate() + 1);

    targetDate.setHours(10, 0, 0, 0);

    const reason = daysSinceCreation < 2
      ? 'Recommended: 2-3 days after initial send'
      : 'Recommended: Tuesday-Thursday 10 AM';

    return { suggestedDate: targetDate, reason, confidence: 0.85 };
  }

  getSmartTimingRecommendation(createdAt: Date): SmartTimingRecommendation {
    return this.calculateSmartTiming(createdAt);
  }

  async createFollowUp(input: CreateFollowUpInput): Promise<EmailFollowUp> {
    // Fetch email to detect type based on folder
    const email = await this.prisma.email.findFirst({
      where: { id: input.emailId, tenantId: input.tenantId },
      select: { folder: true },
    });

    const followUpType = this.detectFollowUpType(
      { folder: email?.folder || null },
      { waitingFor: input.waitingFor, actionItems: input.actionItems }
    );

    return this.crudService.createFollowUp({ ...input, followUpType });
  }

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

    const [llmResult, extraction] = await Promise.all([
      this.analyzeWithLlm(tenantId, userId, body, subject),
      this.extractionService.extractFromEmail(tenantId, userId, subject || '', body, isSentByUser),
    ]);

    const detectedDeadline = this.extractionService.extractDeadlineFromText(
      `${subject || ''} ${body}`,
      new Date()
    );

    if (extraction.commitments.length > 0 || extraction.waitingFor.length > 0) {
      this.logger.debug(
        `Extraction for email ${emailId}: ${extraction.commitments.length} commitments, ${extraction.waitingFor.length} waiting-for`,
      );
    }

    const relationshipBoost = fromEmail ? getRelationshipBoost(fromEmail, toEmails || []) : 0;
    const adjustedConfidence = Math.min(1.0, (llmResult.confidence || 0.5) + relationshipBoost);
    const extractionBoost = extraction.waitingFor.length > 0 ? 0.1 : 0;
    const finalConfidence = Math.min(1.0, adjustedConfidence + extractionBoost);

    const CONFIDENCE_THRESHOLD = 0.6;
    const needsFollowUp = llmResult.needsFollowUp || extraction.needsResponse;

    if (needsFollowUp && finalConfidence >= CONFIDENCE_THRESHOLD) {
      let reason = llmResult.reason || 'Follow-up needed';
      if (extraction.waitingFor.length > 0) {
        reason = `Waiting for: ${extraction.waitingFor[0].waitingFor}`;
      }
      if (relationshipBoost > 0) {
        reason = `${reason} (VIP contact)`;
      }

      const followUp = await this.createFollowUp({
        tenantId, userId, emailId, reason,
        dueDate: llmResult.dueDate ?? undefined,
        commitments: extraction.commitments,
        waitingFor: extraction.waitingFor,
        actionItems: extraction.actionItems,
        emailType: extraction.emailType,
        confidence: finalConfidence,
        detectedDeadline: detectedDeadline ?? undefined,
        deadlineSource: detectedDeadline ? 'nlp' : undefined,
      });

      return { followUp, extraction };
    }

    return { followUp: null, extraction };
  }

  async getFollowUp(tenantId: string, userId: string, id: string): Promise<EmailFollowUp | null> {
    return this.crudService.getFollowUp(tenantId, userId, id);
  }

  async listFollowUps(tenantId: string, userId: string, options: ListFollowUpsOptions = {}): Promise<EmailFollowUp[]> {
    return this.crudService.listFollowUps(tenantId, userId, options);
  }

  async getPendingFollowUps(tenantId: string, userId: string, limit = 20): Promise<EmailFollowUp[]> {
    return this.crudService.getPendingFollowUps(tenantId, userId, limit);
  }

  async getOverdueFollowUps(tenantId: string, userId: string, limit = 20): Promise<EmailFollowUp[]> {
    return this.crudService.getOverdueFollowUps(tenantId, userId, limit);
  }

  async getStats(tenantId: string, userId: string): Promise<FollowUpStats> {
    return this.crudService.getStats(tenantId, userId);
  }

  async resolveFollowUp(
    tenantId: string,
    userId: string,
    id: string,
    resolvedBy: 'REPLY_RECEIVED' | 'MANUAL' | 'AUTO_EXPIRED' = 'MANUAL',
  ): Promise<EmailFollowUp> {
    return this.crudService.resolveFollowUp(tenantId, userId, id, resolvedBy);
  }

  async updateStatus(tenantId: string, userId: string, id: string, status: FollowUpStatus): Promise<EmailFollowUp> {
    return this.crudService.updateStatus(tenantId, userId, id, status);
  }

  async checkForReplyByEmailId(tenantId: string, userId: string, originalEmailId: string): Promise<boolean> {
    return this.crudService.checkForReplyByEmailId(tenantId, userId, originalEmailId);
  }

  async checkAndResolveReplyFollowUp(
    tenantId: string,
    userId: string,
    inReplyTo: string | null,
    references: string | null,
  ): Promise<boolean> {
    return this.crudService.checkAndResolveReplyFollowUp(tenantId, userId, inReplyTo, references);
  }

  async snoozeFollowUp(tenantId: string, userId: string, id: string, newDueDate: Date): Promise<EmailFollowUp> {
    return this.crudService.snoozeFollowUp(tenantId, userId, id, newDueDate);
  }

  async deleteFollowUp(tenantId: string, userId: string, id: string): Promise<void> {
    return this.crudService.deleteFollowUp(tenantId, userId, id);
  }

  async scanEmailsForFollowUps(tenantId: string, userId: string, options: FollowUpScanOptions = {}): Promise<FollowUpScanResult> {
    return this.scannerService.scanEmailsForFollowUps(tenantId, userId, options);
  }

  private async processReminder(followUpId: string, tenantId: string, userId: string): Promise<void> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id: followUpId, tenantId, userId },
    });

    if (!followUp || followUp.status === 'RESOLVED' || followUp.status === 'EXPIRED') {
      return;
    }

    const maxReminders = this.configService.get<number>('AI_FOLLOW_UP_MAX_REMINDERS', 3);

    if ((followUp.remindCount ?? 0) >= maxReminders) {
      await this.crudService.updateForReminder(followUpId, tenantId, userId, {
        status: 'EXPIRED', resolvedBy: 'AUTO_EXPIRED', resolvedAt: new Date()
      });
      return;
    }

    await this.crudService.updateForReminder(followUpId, tenantId, userId, {
      status: 'REMINDED',
      remindCount: { increment: 1 },
      lastRemindedAt: new Date(),
    });

    this.logger.log(`Sent reminder for follow-up ${followUpId}`);
  }

  private async createFollowUpFromScan(
    tenantId: string,
    userId: string,
    emailId: string,
    reason: string,
    dueDate?: Date,
  ): Promise<void> {
    await this.createFollowUp({ tenantId, userId, emailId, reason, dueDate });
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
