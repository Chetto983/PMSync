import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContactsService } from '../../contacts/services/contacts.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

/**
 * PII resolve function type -- provided by AiChatService closure.
 */
type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/** Zod schemas for contact tools */
const schemas = {
  search_contacts: z.object({
    query: z.string().describe('Search query (name, email, or company)'),
    limit: z.number().optional().describe('Max results to return (default 20, max 50)'),
  }),
  create_contact: z.object({
    firstName: z.string().optional().describe('Contact first name'),
    lastName: z.string().optional().describe('Contact last name'),
    email: z.string().optional().describe('Contact email address'),
    company: z.string().optional().describe('Company name'),
    jobTitle: z.string().optional().describe('Job title or role'),
    phone: z.string().optional().describe('Phone number'),
  }),
  update_contact: z.object({
    contactId: z.string().describe('The ID of the contact to update'),
    firstName: z.string().optional().describe('Updated first name'),
    lastName: z.string().optional().describe('Updated last name'),
    email: z.string().optional().describe('Updated email address'),
    company: z.string().optional().describe('Updated company name'),
    jobTitle: z.string().optional().describe('Updated job title'),
  }),
  delete_contact: z.object({
    contactId: z.string().describe('The ID of the contact to delete'),
  }),
};

/**
 * ContactToolsService -- 4 contact tools for the AI chat pipeline.
 *
 * Tools: search_contacts, create_contact, update_contact, delete_contact
 *
 * Phase 25: Tools & RAG
 * Phase 77: Added delete_contact with needsApproval: true
 */
@Injectable()
export class ContactToolsService implements OnModuleInit {
  private readonly logger = new Logger(ContactToolsService.name);

  constructor(
    private readonly contactsService: ContactsService,
    private readonly prisma: PrismaService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      { name: 'search_contacts', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: schemas.search_contacts },
      { name: 'create_contact', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.create_contact },
      { name: 'update_contact', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.update_contact },
      { name: 'delete_contact', riskLevel: 'HIGH' as const, requiresApproval: true, inputSchema: schemas.delete_contact },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name,
        description: t.name,
        parameters: {},
        execute: noop,
        domain: 'contacts',
        riskLevel: t.riskLevel,
        requiresApproval: t.requiresApproval,
        inputSchema: t.inputSchema,
      });
    }
  }

  /**
   * Returns all contact tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    piiResolve: PiiResolveFn,
  ) {
    return {
      search_contacts: this.buildSearchContacts(tenantId, piiResolve),
      create_contact: this.buildCreateContact(tenantId, piiResolve),
      update_contact: this.buildUpdateContact(tenantId, piiResolve),
      delete_contact: this.buildDeleteContact(tenantId, piiResolve),
    };
  }

  private buildSearchContacts(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Search contacts by name, email address, or company. ' +
        'ALWAYS use this before composing emails to verify recipient addresses. ' +
        'Also use before create_contact to check if the contact already exists. ' +
        'Returns: array of { id, name, email, company, jobTitle, phoneNumbers }.',
      inputSchema: schemas.search_contacts,
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

        return truncateToolResult({ contacts: mapped, count: total });
      },
    });
  }

  private buildCreateContact(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Add a new contact to the address book. Provide at least a name or email address. ' +
        'ALWAYS search_contacts first to check if the contact already exists — avoid duplicates. ' +
        'Returns: { id, name, email, company, jobTitle, status: "created" }.',
      inputSchema: schemas.create_contact,
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

        return truncateToolResult({
          id: contact.id,
          name: contact.displayName,
          email: resolved.email,
          company: contact.company,
          jobTitle: contact.jobTitle,
          status: 'created',
        });
      },
    });
  }

  private buildUpdateContact(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Update an existing contact. Provide the contact ID and only the fields to change. ' +
        'ALWAYS use search_contacts first to find the contact and confirm the ID. ' +
        'Returns: { id, name, company, jobTitle, status: "updated" }.',
      inputSchema: schemas.update_contact,
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

        return truncateToolResult({
          id: contact.id,
          name: contact.displayName,
          company: contact.company,
          jobTitle: contact.jobTitle,
          status: 'updated',
        });
      },
    });
  }

  private buildDeleteContact(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Permanently delete a contact from the address book. This action CANNOT be undone. ' +
        'Use ONLY when the user explicitly asks to delete a contact. ' +
        'ALWAYS use search_contacts first to confirm the contact exists and get the ID. ' +
        'Returns: { contactId, deleted: true }. Requires user approval before execution.',
      inputSchema: schemas.delete_contact,
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        await this.contactsService.deleteContact(tenantId, resolved.contactId);
        return truncateToolResult({ contactId: resolved.contactId, deleted: true });
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
