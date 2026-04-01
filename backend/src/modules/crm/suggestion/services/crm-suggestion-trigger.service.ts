import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CrmSuggestionService } from './crm-suggestion.service';
import { isFreemailDomain } from '../freemail-domains';

/**
 * Post-triage hook: analyzes triaged emails and creates CRM suggestions.
 * Called fire-and-forget from EmailTriageService after triage completes.
 */
@Injectable()
export class CrmSuggestionTriggerService {
  private readonly logger = new Logger(CrmSuggestionTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suggestionService: CrmSuggestionService,
  ) {}

  /**
   * Main entry point — called after email triage completes.
   * Runs all detectors in parallel (fire-and-forget from caller).
   */
  async processTriagedEmail(
    tenantId: string,
    emailId: string,
    from: string,
    subject: string,
  ): Promise<void> {
    const domain = this.extractDomain(from);
    if (!domain) return;

    await Promise.allSettled([
      this.detectAccount(tenantId, emailId, domain),
      this.detectDeal(tenantId, emailId, subject, domain),
      this.detectTicket(tenantId, emailId, subject),
    ]);
  }

  // ---- T-1905: Email → Account auto-discovery ----

  private async detectAccount(
    tenantId: string,
    emailId: string,
    domain: string,
  ): Promise<void> {
    if (isFreemailDomain(domain)) return;

    // Check if CRM account already exists with this domain
    const existing = await this.prisma.crmAccount.findFirst({
      where: {
        tenantId,
        website: domain,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) return;

    await this.suggestionService.create(tenantId, {
      type: 'account',
      entityData: {
        name: this.domainToCompanyName(domain),
        website: domain,
      },
      sourceEmailId: emailId,
      sourceType: 'email_triage',
      confidence: 0.7,
    });

    this.logger.debug(`Account suggestion created for domain ${domain}`);
  }

  // ---- T-1906: Email → Deal detection ----

  private static readonly DEAL_KEYWORDS_IT = [
    'preventivo', 'quotazione', 'proposta', 'offerta',
    'contratto', 'fattura', 'rinnovo', 'ordine',
  ];
  private static readonly DEAL_KEYWORDS_EN = [
    'quote', 'proposal', 'pricing', 'invoice',
    'contract', 'renewal', 'purchase order', 'estimate',
  ];
  private static readonly DEAL_KEYWORDS = [
    ...CrmSuggestionTriggerService.DEAL_KEYWORDS_IT,
    ...CrmSuggestionTriggerService.DEAL_KEYWORDS_EN,
  ];

  private async detectDeal(
    tenantId: string,
    emailId: string,
    subject: string,
    domain: string,
  ): Promise<void> {
    const lower = subject.toLowerCase();
    const matchCount = CrmSuggestionTriggerService.DEAL_KEYWORDS.filter(
      (kw) => lower.includes(kw),
    ).length;

    if (matchCount === 0) return;

    // Confidence: 0.4 for 1 match, 0.6 for 2, 0.8 for 3+
    const confidence = Math.min(0.4 + (matchCount - 1) * 0.2, 0.9);

    // Try to find linked contact + account
    const contact = await this.findContactByDomain(tenantId, domain);

    await this.suggestionService.create(tenantId, {
      type: 'deal',
      entityData: {
        title: subject,
        sourceEmailId: emailId,
        contactId: contact?.id ?? null,
        accountId: contact?.accountId ?? null,
        value: null,
      },
      sourceEmailId: emailId,
      sourceType: 'email_triage',
      confidence,
    });

    this.logger.debug(
      `Deal suggestion created: "${subject}" (confidence=${confidence})`,
    );
  }

  // ---- T-1907: Email → Ticket auto-creation ----

  private static readonly TICKET_KEYWORDS_IT = [
    'problema', 'errore', 'non funziona', 'aiuto',
    'guasto', 'reclamo', 'assistenza', 'supporto',
  ];
  private static readonly TICKET_KEYWORDS_EN = [
    'bug', 'issue', 'help', 'not working', 'broken',
    'error', 'problem', 'support', 'urgent',
  ];
  private static readonly TICKET_KEYWORDS = [
    ...CrmSuggestionTriggerService.TICKET_KEYWORDS_IT,
    ...CrmSuggestionTriggerService.TICKET_KEYWORDS_EN,
  ];
  private static readonly URGENCY_KEYWORDS = [
    'urgente', 'urgent', 'critico', 'critical', 'asap',
    'bloccato', 'blocked', 'down',
  ];

  private async detectTicket(
    tenantId: string,
    emailId: string,
    subject: string,
  ): Promise<void> {
    const lower = subject.toLowerCase();
    const matchCount = CrmSuggestionTriggerService.TICKET_KEYWORDS.filter(
      (kw) => lower.includes(kw),
    ).length;

    if (matchCount === 0) return;

    const hasUrgency = CrmSuggestionTriggerService.URGENCY_KEYWORDS.some(
      (kw) => lower.includes(kw),
    );
    const priority = hasUrgency ? 'high' : 'medium';
    const confidence = Math.min(0.4 + (matchCount - 1) * 0.2, 0.9);

    await this.suggestionService.create(tenantId, {
      type: 'ticket',
      entityData: {
        subject,
        sourceEmailId: emailId,
        priority,
        contactId: null,
      },
      sourceEmailId: emailId,
      sourceType: 'email_triage',
      confidence,
    });

    this.logger.debug(
      `Ticket suggestion created: "${subject}" (priority=${priority})`,
    );
  }

  // ---- Helpers ----

  private extractDomain(from: string): string | null {
    // "John <john@example.com>" → "example.com"
    const match = from.match(/@([^>\s]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  private domainToCompanyName(domain: string): string {
    // "acme-corp.com" → "Acme Corp"
    return domain
      .replace(/\.(com|net|org|io|co|it|de|fr|es|uk|eu)$/i, '')
      .replace(/[-_.]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private async findContactByDomain(
    tenantId: string,
    domain: string,
  ): Promise<{ id: string; accountId: string | null } | null> {
    // Contact emails are JSONB: [{value: "user@example.com"}, ...]
    const contacts = await this.prisma.$queryRaw<
      Array<{ id: string }>
    >`
      SELECT id FROM "unified_contacts"
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = false
        AND emails IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(emails) AS e
          WHERE LOWER(e->>'value') LIKE ${'%@' + domain.toLowerCase()}
        )
      LIMIT 1
    `;

    if (!contacts.length) return null;

    const contact = contacts[0];
    const link = await this.prisma.accountContact.findFirst({
      where: { contactId: contact.id, tenantId },
      select: { accountId: true },
    });

    return { id: contact.id, accountId: link?.accountId ?? null };
  }
}
