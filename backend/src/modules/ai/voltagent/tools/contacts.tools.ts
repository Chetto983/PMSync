/**
 * Contacts Tools for VoltAgent
 *
 * Provides contact management operations as VoltAgent tools with Zod schemas.
 * Uses centralized locale system for translations.
 *
 * Performance optimizations (2025-12-14):
 * - Redis caching for contact metadata lookups (tenant-scoped)
 * - Memory fallback when Redis unavailable
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { getToolTranslations, type SupportedLocale } from '../locales';

/**
 * Contact metadata for caching
 */
interface ContactMetadata {
  id: string;
  displayName: string | null;
  emails: unknown;
}

/**
 * Cache configuration
 */
const CONTACT_METADATA_CACHE_TTL = 300; // 5 minutes

/**
 * Get contact metadata with Redis caching
 */
async function getContactMetadata(
  prisma: PrismaService,
  tenantId: string,
  contactId: string,
  cacheService?: CacheService,
): Promise<ContactMetadata | null> {
  const cacheKey = `${tenantId}:contact:${contactId}`;

  // Try Redis cache first
  if (cacheService?.isHealthy()) {
    try {
      const cached = await cacheService.get<ContactMetadata>(cacheKey, {
        namespace: CacheNamespace.CONTACT_METADATA,
      });
      if (cached) return cached;
    } catch {
      // Fall through to DB
    }
  }

  // Query database
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
    select: { id: true, displayName: true, emails: true },
  });

  // Cache the result
  if (contact && cacheService?.isHealthy()) {
    try {
      await cacheService.set(cacheKey, contact, {
        namespace: CacheNamespace.CONTACT_METADATA,
        ttl: CONTACT_METADATA_CACHE_TTL,
      });
    } catch {
      // Ignore cache errors
    }
  }

  return contact;
}

/**
 * Creates all contact-related tools for VoltAgent.
 *
 * @param prisma - Prisma service for database access
 * @param locale - User's locale for translations
 * @param tenantId - Tenant ID for data isolation
 * @param cacheService - Optional cache service for Redis caching
 */
export function createContactsTools(
  prisma: PrismaService,
  locale: SupportedLocale = 'en',
  tenantId: string,
  cacheService?: CacheService,
) {
  const t = getToolTranslations(locale);

  return [
    // ========================================================================
    // TOOL #1: search_contacts (read-only, kept as-is with special search logic)
    // ========================================================================
    createTool({
      name: 'search_contacts',
      description:
        'Search contacts by name, email, or other fields. Use to find contact information.',
      parameters: z.object({
        query: z.string().describe('Search query (name, email, company, etc.)'),
        limit: z.number().optional().describe('Maximum results (default 10)'),
      }),
      execute: async ({ query, limit }) => {
        const takeLimit = limit ?? 10;

        // First search by name/company fields using Prisma
        // Fetch more than needed since we'll filter for valid emails
        let contacts = await prisma.contact.findMany({
          where: {
            tenantId,
            OR: [
              { displayName: { contains: query, mode: 'insensitive' as const } },
              { firstName: { contains: query, mode: 'insensitive' as const } },
              { lastName: { contains: query, mode: 'insensitive' as const } },
              { company: { contains: query, mode: 'insensitive' as const } },
            ],
          },
          take: takeLimit * 3, // Fetch extra to account for filtering
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

        // If no results and query looks like email, search using raw SQL for JSON email field
        // Note: Contact model is mapped to 'unified_contacts' table in schema
        if (contacts.length === 0 && query.includes('@')) {
          const emailContacts = await prisma.$queryRaw`
            SELECT id, "displayName", "firstName", "lastName", emails, "phoneNumbers", company, "jobTitle"
            FROM unified_contacts
            WHERE "tenantId" = ${tenantId}
              AND emails::text ILIKE ${'%' + query + '%'}
            LIMIT ${takeLimit * 3}
          `;
          // Cast to match Prisma's generated types
          contacts = emailContacts as typeof contacts;
        }

        // Filter contacts to only include those with at least one valid email address
        // This is critical for email-sending workflows - contacts without email are useless
        const contactsWithEmail = contacts.filter((contact) => {
          if (!Array.isArray(contact.emails) || contact.emails.length === 0) {
            return false;
          }
          // Check if at least one email has a valid value
          return contact.emails.some((email: unknown) => {
            const emailObj = email as { value?: string };
            return emailObj?.value && emailObj.value.includes('@');
          });
        }).slice(0, takeLimit); // Apply limit after filtering

        return {
          success: true,
          data: contactsWithEmail,
          summary: t.contacts.found(contactsWithEmail.length, query),
        };
      },
    }),

    // ========================================================================
    // CONSOLIDATED TOOL #2: manage_contact
    // Combines: get_contact, create_contact, update_contact, delete_contact
    // Create/update/delete require HITL approval
    // ========================================================================
    createTool({
      name: 'manage_contact',
      description: `Manage contacts. CONSOLIDATED TOOL - handles get, create, update, delete operations.

Actions:
- "get": Get contact details (requires contactId)
- "create": Create new contact (requires email; optional name, phone, company, etc.)
- "update": Update contact (requires contactId; optional fields to update)
- "delete": Delete contact (requires contactId)

Create/update/delete require user approval (HITL).`,
      parameters: z.object({
        action: z.enum(['get', 'create', 'update', 'delete']).describe('Action to perform'),
        contactId: z.string().optional().describe('Contact ID (for get/update/delete)'),
        // Create/update params
        email: z.string().optional().describe('Primary email'),
        displayName: z.string().optional().describe('Display name'),
        firstName: z.string().optional().describe('First name'),
        lastName: z.string().optional().describe('Last name'),
        phone: z.string().optional().describe('Phone number'),
        company: z.string().optional().describe('Company name'),
        jobTitle: z.string().optional().describe('Job title'),
        notes: z.string().optional().describe('Additional notes'),
      }),
      execute: async (params) => {
        const { action, contactId, email, displayName, firstName, lastName, phone, company, jobTitle, notes } = params;

        switch (action) {
          case 'get': {
            if (!contactId) {
              return { success: false, error: 'get requires contactId' };
            }

            const contact = await prisma.contact.findFirst({
              where: { id: contactId, tenantId },
            });

            if (!contact) {
              return { success: false, error: t.contacts.notFound };
            }

            const primaryEmail = Array.isArray(contact.emails) && contact.emails.length > 0
              ? (contact.emails[0] as { value?: string })?.value
              : null;

            return {
              success: true,
              data: contact,
              summary: `${t.contacts.contact}: ${contact.displayName || primaryEmail || 'Unknown'}`,
            };
          }

          case 'create': {
            if (!email) {
              return { success: false, error: 'create requires email' };
            }

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
          }

          case 'update': {
            if (!contactId) {
              return { success: false, error: 'update requires contactId' };
            }

            const contact = await getContactMetadata(prisma, tenantId, contactId, cacheService);
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
          }

          case 'delete': {
            if (!contactId) {
              return { success: false, error: 'delete requires contactId' };
            }

            const contact = await getContactMetadata(prisma, tenantId, contactId, cacheService);
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
          }

          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      },
    }),

    // ========================================================================
    // DEPRECATED TOOLS - Now consolidated into manage_contact
    // ========================================================================
    // - get_contact → manage_contact(action='get')
    // - create_contact → manage_contact(action='create')
    // - update_contact → manage_contact(action='update')
    // - delete_contact → manage_contact(action='delete')
  ];
}
