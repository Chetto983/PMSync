import { Injectable, Logger } from '@nestjs/common';
import {
  IAiTool,
  IToolContext,
} from '../../../common/interfaces/tool-registry.interface';
import { ContactsService } from '../services/contacts.service';

/**
 * IAiTool wrapper for contact search.
 * Registered via OnModuleInit in ContactsModule.
 * AiChatModule discovers this through ToolRegistryService.
 *
 * Phase 32: Architecture decoupling -- domain modules own their tool metadata.
 */
@Injectable()
export class ContactsTool implements IAiTool {
  readonly name = 'search_contacts';
  readonly description =
    'Search contacts by name, email address, or company. ' +
    'Returns matching contacts with name, email, company, and phone numbers.';
  readonly parameters: Record<string, unknown> = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (name, email, or company)' },
      limit: { type: 'number', description: 'Max results (default 20, max 50)' },
    },
    required: ['query'],
  };

  private readonly logger = new Logger(ContactsTool.name);

  constructor(private readonly contactsService: ContactsService) {}

  async execute(
    input: Record<string, unknown>,
    context: IToolContext,
  ): Promise<unknown> {
    const query = input.query as string;
    const limit = Math.min((input.limit as number) ?? 20, 50);

    const { contacts, total } = await this.contactsService.listContacts(
      context.tenantId,
      { search: query, limit },
    );

    const mapped = contacts.map((c) => ({
      id: c.id,
      name: c.displayName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
      email: Array.isArray(c.emails)
        ? (c.emails as Array<{ value: string }>)[0]?.value
        : undefined,
      company: c.company,
      jobTitle: c.jobTitle,
    }));

    return { contacts: mapped, count: total };
  }
}
