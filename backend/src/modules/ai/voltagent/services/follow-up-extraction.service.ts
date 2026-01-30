/**
 * Follow-up Extraction Service
 *
 * Extracts commitments, waiting-for items, and action items from emails.
 * Inspired by email-agent-main patterns for comprehensive email analysis.
 *
 * Features:
 * - Commitment tracking: What user said they would do
 * - Waiting-for tracking: What user is waiting for from others
 * - Action item extraction: Tasks that need attention
 * - Email type classification: receipt/notification/request/conversation/newsletter/alert
 * - Smart urgency detection: Only ASAP/today/tomorrow = urgent
 */
import { Injectable, Logger } from '@nestjs/common';
import { MistralService } from '../../services/mistral.service';
import { getErrorMessage } from '../../../../common/utils';

/**
 * A commitment the user made in an email
 */
export interface ExtractedCommitment {
  /** What the user committed to do */
  commitment: string;
  /** Deadline if mentioned (YYYY-MM-DD format) */
  deadline: string | null;
  /** Who the user committed to */
  recipient: string | null;
}

/**
 * Something the user is waiting for from others
 */
export interface ExtractedWaitingFor {
  /** What the user is waiting for */
  waitingFor: string;
  /** Who should provide it */
  fromWhom: string | null;
  /** Expected deadline if mentioned (YYYY-MM-DD format) */
  deadline: string | null;
}

/**
 * An action item extracted from the email
 */
export interface ExtractedActionItem {
  /** The specific action to take */
  action: string;
  /** Deadline if mentioned (YYYY-MM-DD format) */
  deadline: string | null;
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
  /** Category of action */
  category: 'respond' | 'schedule' | 'review' | 'follow_up' | 'other';
}

/**
 * Complete extraction result from an email
 */
export interface EmailExtractionResult {
  /** Commitments the user made */
  commitments: ExtractedCommitment[];
  /** Things the user is waiting for */
  waitingFor: ExtractedWaitingFor[];
  /** Action items that need attention */
  actionItems: ExtractedActionItem[];
  /** Whether this email needs a response */
  needsResponse: boolean;
  /** Urgency of response needed */
  responseUrgency: 'urgent' | 'normal' | 'low';
  /** Classification of email type */
  emailType: 'receipt' | 'notification' | 'request' | 'conversation' | 'newsletter' | 'alert';
}

@Injectable()
export class FollowUpExtractionService {
  private readonly logger = new Logger(FollowUpExtractionService.name);

  constructor(private readonly mistralService: MistralService) {}

  /**
   * Extract commitments, waiting-for items, and actions from email.
   * Uses LLM with JSON mode for reliable structured extraction.
   *
   * @param tenantId - Tenant ID for cost tracking
   * @param userId - User ID for cost tracking
   * @param subject - Email subject
   * @param body - Email body
   * @param isSentByUser - Whether the email was sent by the user (affects perspective)
   */
  async extractFromEmail(
    tenantId: string,
    userId: string,
    subject: string,
    body: string,
    isSentByUser: boolean,
  ): Promise<EmailExtractionResult> {
    const truncatedBody = body.slice(0, 2000);
    const perspective = isSentByUser ? 'I sent this email' : 'I received this email';

    const systemPrompt = `You are an expert Executive Assistant analyzing emails to extract actionable information.
Return ONLY valid JSON matching the exact schema below. No markdown, no explanation.`;

    const userPrompt = `Analyze this email and extract actionable information.

Context: ${perspective}

Subject: ${subject || '(no subject)'}
Body: ${truncatedBody}

Instructions:
1. Extract any commitments I made (things I said I would do)
2. Extract anything I'm waiting for from others
3. Extract action items that need attention
4. Determine if this needs a response and urgency level
5. Classify the email type

IMPORTANT for urgency:
- "urgent" ONLY if: explicit deadline today/tomorrow, security alert, or explicit ASAP
- Routine receipts, notifications, newsletters are NOT urgent
- Most emails are "normal" or "low" urgency

Return JSON:
{
  "commitments": [{"commitment": "what I committed to", "deadline": "YYYY-MM-DD or null", "recipient": "who I committed to or null"}],
  "waitingFor": [{"waitingFor": "what I'm waiting for", "fromWhom": "who should provide it or null", "deadline": "YYYY-MM-DD or null"}],
  "actionItems": [{"action": "specific action", "deadline": "YYYY-MM-DD or null", "priority": "high|medium|low", "category": "respond|schedule|review|follow_up|other"}],
  "needsResponse": boolean,
  "responseUrgency": "urgent|normal|low",
  "emailType": "receipt|notification|request|conversation|newsletter|alert"
}`;

    try {
      const response = await this.mistralService.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1, // Low temperature for consistent extraction
        maxTokens: 1024,
        timeoutMs: 15000,
        modelTier: 'fast',
        jsonMode: true,
        validationContext: 'EMAIL_CONTENT', // Lenient validation for email analysis
        telemetryContext: { tenantId, userId, promptName: 'follow-up-extraction' },
      });

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('No JSON found in extraction response');
        return this.emptyResult();
      }

      const result = JSON.parse(jsonMatch[0]);
      return this.validateAndNormalize(result);
    } catch (error) {
      this.logger.error(`Extraction failed: ${getErrorMessage(error)}`);
      return this.emptyResult();
    }
  }

  /**
   * Validate and normalize the extraction result
   */
  private validateAndNormalize(result: unknown): EmailExtractionResult {
    const r = result as Record<string, unknown>;

    return {
      commitments: this.normalizeCommitments(r.commitments),
      waitingFor: this.normalizeWaitingFor(r.waitingFor),
      actionItems: this.normalizeActionItems(r.actionItems),
      needsResponse: r.needsResponse === true,
      responseUrgency: this.normalizeUrgency(r.responseUrgency),
      emailType: this.normalizeEmailType(r.emailType),
    };
  }

  private normalizeCommitments(commitments: unknown): ExtractedCommitment[] {
    if (!Array.isArray(commitments)) return [];
    return commitments
      .filter((c): c is Record<string, unknown> => c && typeof c === 'object')
      .map((c) => ({
        commitment: typeof c.commitment === 'string' ? c.commitment : '',
        deadline: typeof c.deadline === 'string' ? c.deadline : null,
        recipient: typeof c.recipient === 'string' ? c.recipient : null,
      }))
      .filter((c) => c.commitment.length > 0);
  }

  private normalizeWaitingFor(waitingFor: unknown): ExtractedWaitingFor[] {
    if (!Array.isArray(waitingFor)) return [];
    return waitingFor
      .filter((w): w is Record<string, unknown> => w && typeof w === 'object')
      .map((w) => ({
        waitingFor: typeof w.waitingFor === 'string' ? w.waitingFor : '',
        fromWhom: typeof w.fromWhom === 'string' ? w.fromWhom : null,
        deadline: typeof w.deadline === 'string' ? w.deadline : null,
      }))
      .filter((w) => w.waitingFor.length > 0);
  }

  private normalizeActionItems(actionItems: unknown): ExtractedActionItem[] {
    if (!Array.isArray(actionItems)) return [];
    const validPriorities = ['high', 'medium', 'low'];
    const validCategories = ['respond', 'schedule', 'review', 'follow_up', 'other'];

    return actionItems
      .filter((a): a is Record<string, unknown> => a && typeof a === 'object')
      .map((a) => ({
        action: typeof a.action === 'string' ? a.action : '',
        deadline: typeof a.deadline === 'string' ? a.deadline : null,
        priority: validPriorities.includes(a.priority as string)
          ? (a.priority as 'high' | 'medium' | 'low')
          : 'medium',
        category: validCategories.includes(a.category as string)
          ? (a.category as 'respond' | 'schedule' | 'review' | 'follow_up' | 'other')
          : 'other',
      }))
      .filter((a) => a.action.length > 0);
  }

  private normalizeUrgency(urgency: unknown): 'urgent' | 'normal' | 'low' {
    if (urgency === 'urgent') return 'urgent';
    if (urgency === 'low') return 'low';
    return 'normal';
  }

  private normalizeEmailType(
    emailType: unknown,
  ): 'receipt' | 'notification' | 'request' | 'conversation' | 'newsletter' | 'alert' {
    const validTypes = ['receipt', 'notification', 'request', 'conversation', 'newsletter', 'alert'];
    if (typeof emailType === 'string' && validTypes.includes(emailType)) {
      return emailType as 'receipt' | 'notification' | 'request' | 'conversation' | 'newsletter' | 'alert';
    }
    return 'conversation';
  }

  /**
   * Return empty result for error cases
   */
  private emptyResult(): EmailExtractionResult {
    return {
      commitments: [],
      waitingFor: [],
      actionItems: [],
      needsResponse: false,
      responseUrgency: 'low',
      emailType: 'notification',
    };
  }
}
