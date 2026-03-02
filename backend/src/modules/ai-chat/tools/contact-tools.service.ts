import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContactsService } from '../../contacts/services/contacts.service';

/**
 * PII resolve function type -- provided by AiChatService closure.
 */
type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * ContactToolsService -- 3 contact tools for the AI chat pipeline.
 *
 * Tools: search_contacts, create_contact, update_contact
 *
 * Note: delete_contact uses needsApproval: true since it's destructive.
 * However, no delete tool is included per plan spec (only search/create/update).
 *
 * Phase 25: Tools & RAG
 */
@Injectable()
export class ContactToolsService {
  private readonly logger = new Logger(ContactToolsService.name);

  constructor(
    private readonly contactsService: ContactsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Returns all contact tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    _conversationId: string,
    piiResolve: PiiResolveFn,
  ) {
    return {
      search_contacts: this.buildSearchContacts(tenantId, piiResolve),
      create_contact: this.buildCreateContact(tenantId, piiResolve),
      update_contact: this.buildUpdateContact(tenantId, piiResolve),
    };
  }

  private buildSearchContacts(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Search contacts by name, email address, or company. ' +
        'Returns matching contacts with name, email, company, and phone numbers. ' +
        'Example: search_contacts({ query: "John from Acme" })',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Search query (name, email, or company)'),
        limit: z
          .number()
          .optional()
          .describe('Max results to return (default 20, max 50)'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;
        const limit = Math.min(resolved.limit ?? 20, 50);

        const { contacts, total } = await this.contactsService.listContacts(
          tenantId,
          { search: resolved.query, limit },
        );

        const mapped = contacts.map((c) => ({
          id: c.id,
          name: c.displayName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
          email: Array.isArray(c.emails)
            ? (c.emails as Array<{ value: string }>)[0]?.value
            : undefined,
          company: c.company,
          jobTitle: c.jobTitle,
          phoneNumbers: Array.isArray(c.phoneNumbers)
            ? (c.phoneNumbers as Array<{ value: string }>).map(
                (p) => p.value,
              )
            : [],
        }));

        return { contacts: mapped, count: total };
      },
    });
  }

  private buildCreateContact(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Create a new contact in the address book. ' +
        'At minimum, provide a name or email address. ' +
        'Example: create_contact({ firstName: "Jane", lastName: "Doe", email: "jane@acme.com", company: "Acme" })',
      inputSchema: z.object({
        firstName: z.string().optional().describe('Contact first name'),
        lastName: z.string().optional().describe('Contact last name'),
        email: z
          .string()
          .optional()
          .describe('Contact email address'),
        company: z.string().optional().describe('Company name'),
        jobTitle: z.string().optional().describe('Job title or role'),
        phone: z
          .string()
          .optional()
          .describe('Phone number'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        const provider = await this.getContactsProvider(tenantId);

        const emails = resolved.email
          ? [{ value: resolved.email, type: 'work', primary: true }]
          : undefined;
        const phoneNumbers = resolved.phone
          ? [{ value: resolved.phone, type: 'work', primary: true }]
          : undefined;

        const contact = await this.contactsService.createContact(tenantId, {
          providerId: provider.id,
          firstName: resolved.firstName,
          lastName: resolved.lastName,
          displayName:
            `${resolved.firstName ?? ''} ${resolved.lastName ?? ''}`.trim() ||
            resolved.email,
          emails,
          phoneNumbers,
          company: resolved.company,
          jobTitle: resolved.jobTitle,
        });

        return {
          id: contact.id,
          name: contact.displayName,
          email: resolved.email,
          company: contact.company,
          jobTitle: contact.jobTitle,
          status: 'created',
        };
      },
    });
  }

  private buildUpdateContact(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Update an existing contact\'s information. Provide the contact ID and fields to change. ' +
        'Example: update_contact({ contactId: "clx123abc", company: "New Corp", jobTitle: "VP" })',
      inputSchema: z.object({
        contactId: z.string().describe('The ID of the contact to update'),
        firstName: z.string().optional().describe('Updated first name'),
        lastName: z.string().optional().describe('Updated last name'),
        email: z.string().optional().describe('Updated email address'),
        company: z.string().optional().describe('Updated company name'),
        jobTitle: z.string().optional().describe('Updated job title'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        const updateData: Record<string, unknown> = {};
        if (resolved.firstName !== undefined)
          updateData.firstName = resolved.firstName;
        if (resolved.lastName !== undefined)
          updateData.lastName = resolved.lastName;
        if (resolved.company !== undefined)
          updateData.company = resolved.company;
        if (resolved.jobTitle !== undefined)
          updateData.jobTitle = resolved.jobTitle;
        if (resolved.email !== undefined) {
          updateData.emails = [
            { value: resolved.email, type: 'work', primary: true },
          ];
        }

        const contact = await this.contactsService.updateContact(
          tenantId,
          resolved.contactId,
          updateData as any,
        );

        return {
          id: contact.id,
          name: contact.displayName,
          company: contact.company,
          jobTitle: contact.jobTitle,
          status: 'updated',
        };
      },
    });
  }

  /**
   * Get the user's default active contacts provider.
   */
  private async getContactsProvider(tenantId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        tenantId,
        isActive: true,
        supportsContacts: true,
      },
    });

    if (!provider) {
      throw new Error('No active contacts provider found for tenant');
    }

    return provider;
  }
}
