/**
 * Contacts Tools for VoltAgent
 *
 * Provides contact management operations as VoltAgent tools with Zod schemas.
 * Uses centralized locale system for translations.
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import { getToolTranslations, type SupportedLocale } from '../locales';

/**
 * Creates all contact-related tools for VoltAgent.
 */
export function createContactsTools(
  prisma: PrismaService,
  locale: SupportedLocale = 'en',
  tenantId: string,
) {
  const t = getToolTranslations(locale);

  return [
    // ========== SEARCH CONTACTS ==========
    createTool({
      name: 'search_contacts',
      description:
        'Search contacts by name, email, or other fields. Use to find contact information.',
      parameters: z.object({
        query: z.string().describe('Search query (name, email, company, etc.)'),
        limit: z.number().optional().describe('Maximum results (default 10)'),
      }),
      execute: async ({ query, limit }) => {
        const contacts = await prisma.contact.findMany({
          where: {
            tenantId,
            OR: [
              { displayName: { contains: query, mode: 'insensitive' as const } },
              { firstName: { contains: query, mode: 'insensitive' as const } },
              { lastName: { contains: query, mode: 'insensitive' as const } },
              { company: { contains: query, mode: 'insensitive' as const } },
            ],
          },
          take: limit ?? 10,
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            emails: true,
            phoneNumbers: true,
            company: true,
            jobTitle: true,
          },
        });

        return {
          success: true,
          data: contacts,
          summary: t.contacts.found(contacts.length, query),
        };
      },
    }),

    // ========== GET CONTACT ==========
    createTool({
      name: 'get_contact',
      description: 'Get detailed information about a specific contact.',
      parameters: z.object({
        contactId: z.string().describe('ID of the contact'),
      }),
      execute: async ({ contactId }) => {
        const contact = await prisma.contact.findFirst({
          where: {
            id: contactId,
            tenantId,
          },
        });

        if (!contact) {
          return { success: false, error: t.contacts.notFound };
        }

        // Extract primary email from emails JSON array
        const primaryEmail = Array.isArray(contact.emails) && contact.emails.length > 0
          ? (contact.emails[0] as { value?: string })?.value
          : null;

        return {
          success: true,
          data: contact,
          summary: `${t.contacts.contact}: ${contact.displayName || primaryEmail || 'Unknown'}`,
        };
      },
    }),

    // ========== CREATE CONTACT ==========
    createTool({
      name: 'create_contact',
      description: 'Create a new contact.',
      parameters: z.object({
        email: z.string().email().describe('Primary email address'),
        displayName: z.string().optional().describe('Display name'),
        firstName: z.string().optional().describe('First name'),
        lastName: z.string().optional().describe('Last name'),
        phone: z.string().optional().describe('Phone number'),
        company: z.string().optional().describe('Company name'),
        jobTitle: z.string().optional().describe('Job title'),
        notes: z.string().optional().describe('Additional notes'),
      }),
      execute: async ({ email, displayName, firstName, lastName, phone, company, jobTitle, notes }) => {
        const name = displayName || `${firstName || ''} ${lastName || ''}`.trim() || email;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'CREATE_CONTACT',
          severity: 'LOW',
          payload: {
            emails: [{ value: email, type: 'primary' }],
            displayName: name,
            firstName,
            lastName,
            phoneNumbers: phone ? [{ value: phone, type: 'primary' }] : [],
            company,
            jobTitle,
            notes,
          },
          summary: t.contacts.created(name),
        };
      },
    }),

    // ========== UPDATE CONTACT ==========
    createTool({
      name: 'update_contact',
      description: 'Update an existing contact.',
      parameters: z.object({
        contactId: z.string().describe('ID of the contact to update'),
        email: z.string().email().optional().describe('New primary email'),
        displayName: z.string().optional().describe('New display name'),
        firstName: z.string().optional().describe('New first name'),
        lastName: z.string().optional().describe('New last name'),
        phone: z.string().optional().describe('New phone number'),
        company: z.string().optional().describe('New company'),
        jobTitle: z.string().optional().describe('New job title'),
        notes: z.string().optional().describe('New notes'),
      }),
      execute: async ({ contactId, email, displayName, firstName, lastName, phone, company, jobTitle, notes }) => {
        const contact = await prisma.contact.findFirst({
          where: {
            id: contactId,
            tenantId,
          },
          select: { displayName: true, emails: true },
        });

        if (!contact) {
          return { success: false, error: t.contacts.notFound };
        }

        const primaryEmail = Array.isArray(contact.emails) && contact.emails.length > 0
          ? (contact.emails[0] as { value?: string })?.value
          : null;

        return {
          success: true,
          requiresApproval: true,
          actionType: 'UPDATE_CONTACT',
          severity: 'LOW',
          payload: {
            contactId,
            ...(email ? { emails: [{ value: email, type: 'primary' }] } : {}),
            displayName,
            firstName,
            lastName,
            ...(phone ? { phoneNumbers: [{ value: phone, type: 'primary' }] } : {}),
            company,
            jobTitle,
            notes,
          },
          summary: t.contacts.updated(contact.displayName || primaryEmail || 'Unknown'),
        };
      },
    }),

    // ========== DELETE CONTACT ==========
    createTool({
      name: 'delete_contact',
      description: 'Delete a contact.',
      parameters: z.object({
        contactId: z.string().describe('ID of the contact to delete'),
      }),
      execute: async ({ contactId }) => {
        const contact = await prisma.contact.findFirst({
          where: {
            id: contactId,
            tenantId,
          },
          select: { displayName: true, emails: true },
        });

        if (!contact) {
          return { success: false, error: t.contacts.notFound };
        }

        const primaryEmail = Array.isArray(contact.emails) && contact.emails.length > 0
          ? (contact.emails[0] as { value?: string })?.value
          : null;

        return {
          success: true,
          requiresApproval: true,
          actionType: 'DELETE_CONTACT',
          severity: 'MEDIUM',
          payload: { contactId },
          summary: t.contacts.deleted(contact.displayName || primaryEmail || 'Unknown'),
        };
      },
    }),
  ];
}
