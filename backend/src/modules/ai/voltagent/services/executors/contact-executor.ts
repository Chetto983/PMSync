/**
 * Contact Action Executor - Handles contact CRUD operations.
 * Phase 9c: Extracted from action-executor.service.ts (2026-01-23)
 *
 * Static methods to avoid additional DI complexity.
 * Dependencies passed via ContactExecutorDeps interface.
 */
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { AgentAction } from '../../interfaces/agent-action.interface';
import { AgentContext } from '../../interfaces/agent-context.interface';
import { ActionExecutionResult } from '../action-executor.service';
import { getLocale, actionSummaries as t } from '../../locales/action-summaries';
import { AiError, AiErrorCode } from '../../../errors';

/** Dependencies required for contact executor methods */
export interface ContactExecutorDeps {
  prisma: PrismaService;
  logger: Logger;
}

/**
 * Static executor for contact-related actions.
 * Keeps ActionExecutorService as thin orchestrator.
 */
export class ContactExecutor {
  /**
   * Create a new contact.
   */
  static async executeCreateContact(
    action: AgentAction,
    context: AgentContext,
    deps: ContactExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { name, firstName, lastName, email, phone, company, jobTitle, notes } = action.payload;

    // Note: Provider check removed for consistency with update/delete (P6 fix)
    // Contacts can be created locally; external sync happens separately

    const displayName = name || `${firstName || ''} ${lastName || ''}`.trim();
    const contact = await deps.prisma.contact.create({
      data: {
        tenantId: context.tenantId,
        displayName,
        firstName,
        lastName,
        emails: email ? [email] : [],
        phoneNumbers: phone ? [phone] : [],
        company,
        jobTitle,
        notes,
      },
    });

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { contactId: contact.id, contact },
      summary: t.contactCreated[lang](displayName),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Update an existing contact.
   */
  static async executeUpdateContact(
    action: AgentAction,
    context: AgentContext,
    deps: ContactExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { contactId, ...updates } = action.payload;

    // Get contact info for summary
    const existingContact = await deps.prisma.contact.findFirst({
      where: { id: contactId, tenantId: context.tenantId },
      select: { displayName: true },
    });

    await deps.prisma.contact.update({
      where: { id_tenantId: { id: contactId, tenantId: context.tenantId } },
      data: {
        displayName: updates.name,
        firstName: updates.firstName,
        lastName: updates.lastName,
        emails: updates.email ? [updates.email] : undefined,
        phoneNumbers: updates.phone ? [updates.phone] : undefined,
        company: updates.company,
        jobTitle: updates.jobTitle,
        notes: updates.notes,
      },
    });

    const lang = getLocale(context.preferences?.language);
    const contactName = updates.name || existingContact?.displayName || t.contact[lang];

    return {
      success: true,
      data: { contactId, updated: true },
      summary: t.contactUpdated[lang](contactName),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Delete a contact.
   */
  static async executeDeleteContact(
    action: AgentAction,
    context: AgentContext,
    deps: ContactExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { contactId } = action.payload;

    // Get contact info for summary before deleting
    const contact = await deps.prisma.contact.findFirst({
      where: { id: contactId, tenantId: context.tenantId },
      select: { displayName: true },
    });

    await deps.prisma.contact.delete({
      where: { id_tenantId: { id: contactId, tenantId: context.tenantId } },
    });

    const lang = getLocale(context.preferences?.language);
    const contactName = contact?.displayName || t.contact[lang];

    return {
      success: true,
      data: { contactId, deleted: true },
      summary: t.contactDeleted[lang](contactName),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Search contacts by query string.
   */
  static async executeSearchContacts(
    action: AgentAction,
    context: AgentContext,
    deps: ContactExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { query, limit = 20 } = action.payload;

    const contacts = await deps.prisma.contact.findMany({
      where: {
        tenantId: context.tenantId,
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { company: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { displayName: 'asc' },
    });

    const lang = getLocale(context.preferences?.language);
    const summary = contacts.length === 0
      ? t.contactsSearchNotFound[lang](query)
      : t.contactsSearchFound[lang](contacts.length, query);

    return {
      success: true,
      data: { contacts, count: contacts.length },
      summary,
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Merge multiple contacts into one.
   */
  static async executeMergeContacts(
    action: AgentAction,
    context: AgentContext,
    deps: ContactExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { contactIds, primaryId } = action.payload;

    if (!contactIds || contactIds.length < 2) {
      throw new AiError('Need at least 2 contacts to merge', AiErrorCode.INVALID_INPUT);
    }

    // Get all contacts to merge
    const contacts = await deps.prisma.contact.findMany({
      where: {
        id: { in: contactIds },
        tenantId: context.tenantId,
      },
    });

    if (contacts.length < 2) {
      throw new AiError('Could not find enough contacts to merge', AiErrorCode.INVALID_INPUT);
    }

    // Determine primary contact (first one or specified)
    const primaryContactId = primaryId || contactIds[0];
    const primaryContact = contacts.find((c) => c.id === primaryContactId);
    const secondaryContacts = contacts.filter((c) => c.id !== primaryContactId);

    if (!primaryContact) {
      throw new AiError('Primary contact not found', AiErrorCode.INVALID_INPUT);
    }

    // Merge data from secondary contacts into primary
    // Note: emails and phoneNumbers are stored as Json arrays in Prisma
    const primaryEmails = Array.isArray(primaryContact.emails) ? primaryContact.emails as string[] : [];
    const primaryPhones = Array.isArray(primaryContact.phoneNumbers) ? primaryContact.phoneNumbers as string[] : [];

    const mergedEmails = new Set<string>(primaryEmails);
    const mergedPhones = new Set<string>(primaryPhones);
    let mergedNotes = primaryContact.notes || '';

    for (const contact of secondaryContacts) {
      // Merge emails
      const contactEmails = Array.isArray(contact.emails) ? contact.emails as string[] : [];
      contactEmails.forEach((e: string) => mergedEmails.add(e));

      // Merge phone numbers
      const contactPhones = Array.isArray(contact.phoneNumbers) ? contact.phoneNumbers as string[] : [];
      contactPhones.forEach((p: string) => mergedPhones.add(p));

      // Merge notes
      if (contact.notes) {
        mergedNotes += mergedNotes ? `\n\n--- Merged from ${contact.displayName} ---\n${contact.notes}` : contact.notes;
      }
    }

    // Update primary contact with merged data
    const updatedContact = await deps.prisma.contact.update({
      where: { id_tenantId: { id: primaryContactId, tenantId: context.tenantId } },
      data: {
        emails: Array.from(mergedEmails),
        phoneNumbers: Array.from(mergedPhones),
        notes: mergedNotes || undefined,
        // Keep primary contact's name, company, etc. - don't overwrite
      },
    });

    // Delete secondary contacts
    const secondaryIds = secondaryContacts.map((c) => c.id);
    await deps.prisma.contact.deleteMany({
      where: {
        id: { in: secondaryIds },
        tenantId: context.tenantId,
      },
    });

    deps.logger.log(`Merged ${contacts.length} contacts into ${primaryContactId}, deleted ${secondaryIds.length} duplicates`);

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: {
        merged: true,
        primaryId: primaryContactId,
        mergedCount: secondaryIds.length,
        deletedIds: secondaryIds,
        updatedContact,
      },
      summary: t.contactsMerged[lang](contacts.length, updatedContact.displayName || t.contact[lang], secondaryIds.length),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Get a specific contact by ID, email, or name.
   */
  static async executeGetContact(
    action: AgentAction,
    context: AgentContext,
    deps: ContactExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { contactId, email, name } = action.payload;

    let contact;

    if (contactId) {
      // Direct lookup by ID
      contact = await deps.prisma.contact.findFirst({
        where: { id: contactId, tenantId: context.tenantId },
        include: { providerContacts: true },
      });
    } else if (email) {
      // Lookup by email - emails is stored as Json array
      contact = await deps.prisma.contact.findFirst({
        where: {
          tenantId: context.tenantId,
          emails: { array_contains: [email] },
        },
        include: { providerContacts: true },
      });

      // Fallback: Search in raw JSON if array_contains doesn't work
      if (!contact) {
        const contacts = await deps.prisma.contact.findMany({
          where: { tenantId: context.tenantId },
          include: { providerContacts: true },
        });
        contact = contacts.find((c) => {
          const emails = Array.isArray(c.emails) ? (c.emails as unknown as string[]) : [];
          return emails.some((e) => String(e).toLowerCase() === email.toLowerCase());
        });
      }
    } else if (name) {
      // Lookup by name (partial match)
      contact = await deps.prisma.contact.findFirst({
        where: {
          tenantId: context.tenantId,
          OR: [
            { displayName: { contains: name, mode: 'insensitive' } },
            { firstName: { contains: name, mode: 'insensitive' } },
            { lastName: { contains: name, mode: 'insensitive' } },
          ],
        },
        include: { providerContacts: true },
      });
    }

    const lang = getLocale(context.preferences?.language);

    if (!contact) {
      throw new AiError(t.contactNotFound[lang], AiErrorCode.INVALID_INPUT);
    }

    return {
      success: true,
      data: { contact },
      summary: t.contactFound[lang](contact.displayName || t.contact[lang]),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }
}
