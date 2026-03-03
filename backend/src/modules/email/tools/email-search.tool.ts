import { Injectable, Logger } from '@nestjs/common';
import {
  IAiTool,
  IToolContext,
} from '../../../common/interfaces/tool-registry.interface';
import { EmailSearchService } from '../services/email-search.service';

/**
 * IAiTool wrapper for email search.
 * Registered via OnModuleInit in EmailModule.
 * AiChatModule discovers this through ToolRegistryService.
 *
 * Phase 32: Architecture decoupling -- domain modules own their tool metadata.
 */
@Injectable()
export class EmailSearchTool implements IAiTool {
  readonly name = 'search_emails';
  readonly description =
    'Search through the user\'s emails by keyword, sender, subject, or date. ' +
    'Returns matching emails with subject, sender, date, and AI triage data.';
  readonly parameters: Record<string, unknown> = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results (default 20, max 50)' },
    },
    required: ['query'],
  };

  private readonly logger = new Logger(EmailSearchTool.name);

  constructor(private readonly emailSearchService: EmailSearchService) {}

  async execute(
    input: Record<string, unknown>,
    context: IToolContext,
  ): Promise<unknown> {
    const query = input.query as string;
    const limit = Math.min((input.limit as number) ?? 20, 50);

    const emails = await this.emailSearchService.searchEmails(
      context.tenantId,
      query,
      undefined,
      limit,
    );

    const results = (Array.isArray(emails) ? emails : []).map((e: any) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      date: e.receivedAt ?? e.createdAt,
      snippet: e.snippet ?? e.bodyText?.slice(0, 120),
    }));

    return { results, count: results.length };
  }
}
