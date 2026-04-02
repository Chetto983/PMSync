import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CrmSuggestionService } from './crm-suggestion.service';

interface SuggestionRule {
  type: string;
  condition: (email: EmailTriageData, hasTicket: boolean) => boolean;
  confidence: number;
  buildEntityData: (email: EmailTriageData) => Record<string, unknown>;
}

interface EmailTriageData {
  id: string;
  tenantId: string;
  subject: string | null;
  snippet: string | null;
  from: string | null;
  aiCategory: string | null;
  aiActionability: string | null;
  aiIntent: string | null;
  contactId: string | null;
  dealId: string | null;
}

function extractEmailAddress(from: string | null): string | null {
  if (!from) return null;
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from.trim();
}

const SUGGESTION_RULES: SuggestionRule[] = [
  {
    type: 'ticket',
    condition: (email, hasTicket) =>
      email.aiCategory === 'support' && !hasTicket,
    confidence: 0.8,
    buildEntityData: (email) => ({
      subject: email.subject,
      sourceEmailId: email.id,
      contactId: email.contactId,
      title: 'Create support ticket',
      reasoning: 'Email categorized as support with no linked ticket',
    }),
  },
  {
    type: 'deal',
    condition: (email) =>
      email.aiCategory === 'sales' && !email.dealId,
    confidence: 0.7,
    buildEntityData: (email) => ({
      title: email.subject || 'New Deal',
      sourceEmailId: email.id,
      contactId: email.contactId,
      reasoning: 'Email categorized as sales with no linked deal',
    }),
  },
  {
    type: 'task',
    condition: (email) => email.aiActionability === 'todo',
    confidence: 0.75,
    buildEntityData: (email) => ({
      title: email.subject || 'Follow-up task',
      description: email.snippet,
      emailId: email.id,
      contactId: email.contactId,
      reasoning: 'Email requires action',
    }),
  },
  {
    type: 'link',
    condition: (email) => !email.contactId,
    confidence: 0.6,
    buildEntityData: (email) => ({
      emailAddress: extractEmailAddress(email.from),
      emailId: email.id,
      title: 'Link to contact',
      reasoning: 'No contact linked to this email',
    }),
  },
];

@Injectable()
export class EmailSuggestionGeneratorService {
  private readonly logger = new Logger(EmailSuggestionGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suggestionService: CrmSuggestionService,
  ) {}

  /**
   * Returns existing pending suggestions for an email, or generates
   * new ones from triage fields if none have ever been created.
   */
  async getOrGenerate(tenantId: string, emailId: string) {
    // Check if any suggestions already exist for this email (any status)
    const existingAll = await this.prisma.crmSuggestion.findMany({
      where: { tenantId, sourceEmailId: emailId },
    });

    if (existingAll.length > 0) {
      // Return only pending ones (dismissed/accepted are hidden)
      return existingAll.filter((s) => s.status === 'pending');
    }

    // No suggestions ever created for this email — generate from rules
    return this.generateFromRules(tenantId, emailId);
  }

  private async generateFromRules(tenantId: string, emailId: string) {
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
      select: {
        id: true,
        tenantId: true,
        subject: true,
        snippet: true,
        from: true,
        aiCategory: true,
        aiActionability: true,
        aiIntent: true,
        contactId: true,
        dealId: true,
      },
    });

    if (!email) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }

    // Check for existing ticket linked to this email
    const linkedTicket = await this.prisma.ticket.findFirst({
      where: { tenantId, emailId },
      select: { id: true },
    });
    const hasTicket = !!linkedTicket;

    const created = [];

    for (const rule of SUGGESTION_RULES) {
      if (rule.condition(email, hasTicket)) {
        const suggestion = await this.suggestionService.create(tenantId, {
          type: rule.type,
          entityData: rule.buildEntityData(email),
          sourceEmailId: emailId,
          sourceType: 'email_triage',
          confidence: rule.confidence,
        });
        created.push(suggestion);
        this.logger.debug(
          `Generated ${rule.type} suggestion for email ${emailId}`,
        );
      }
    }

    this.logger.log(
      `Generated ${created.length} suggestions for email ${emailId}`,
    );
    return created;
  }
}
