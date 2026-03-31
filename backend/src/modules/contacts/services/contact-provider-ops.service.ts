/**
 * ContactProviderOpsService - Provider-level contact operations.
 * Handles: getContactPhoto, findContactsByEmails, getContactHistory, deleteProviderContacts.
 * Extracted from ContactsService (Phase 43 god-file split).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GoogleContactsSyncService } from './google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './microsoft-contacts-sync.service';
import { ContactCrudService } from './contact-crud.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import type { ContactInteraction } from '../contacts.types';

@Injectable()
export class ContactProviderOpsService {
  private readonly logger = new Logger(ContactProviderOpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleContactsSync: GoogleContactsSyncService,
    private readonly microsoftContactsSync: MicrosoftContactsSyncService,
    private readonly crudService: ContactCrudService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async getContactPhoto(tenantId: string, contactId: string): Promise<string | null> {
    const contact = await this.crudService.getContact(tenantId, contactId);
    // T-0504: Return cached photo URL — avoids redundant provider API calls
    if (contact.photoUrl) return contact.photoUrl;

    if (contact.providerContacts?.length) {
      for (const pc of contact.providerContacts) {
        try {
          const provider = await this.prisma.providerConfig.findUnique({ where: { id: pc.providerId } });
          if (provider?.isActive) {
            let photoUrl: string | null = null;
            if (provider.providerType === 'google') photoUrl = await this.googleContactsSync.getContactPhoto(provider.id, pc.externalId);
            else if (provider.providerType === 'microsoft') photoUrl = await this.microsoftContactsSync.getContactPhoto(provider.id, pc.externalId);
            if (photoUrl) {
              void this.prisma.contact.update({ where: { id_tenantId: { id: contactId, tenantId } }, data: { photoUrl } }).catch((err) => this.logger.warn(`Failed to cache contact photo URL: ${err.message}`));
              return photoUrl;
            }
          }
        } catch (error: any) { this.logger.warn(`Failed to fetch photo from provider: ${error.message}`); }
      }
    }
    return null;
  }

  async findContactsByEmails(
    tenantId: string,
    emails: string[],
  ): Promise<Record<string, { contactId: string; photoUrl: string | null; displayName: string | null }>> {
    if (!emails.length) return {};
    const normalizedEmails = [...new Set(emails.map((e) => e.toLowerCase()))];
    const contacts = await this.prisma.$queryRaw<Array<{ id: string; displayName: string | null; photoUrl: string | null; emails: Array<{ value: string }> }>>`
      SELECT id, "displayName", "photoUrl", emails FROM "unified_contacts"
      WHERE "tenantId" = ${tenantId} AND "isDeleted" = false AND emails IS NOT NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(emails) AS email_obj WHERE LOWER(email_obj->>'value') = ANY(${normalizedEmails}::text[]))
    `;
    const result: Record<string, { contactId: string; photoUrl: string | null; displayName: string | null }> = {};
    for (const contact of contacts) {
      if (contact.emails) {
        for (const emailObj of contact.emails) {
          const ne = emailObj.value.toLowerCase();
          if (normalizedEmails.includes(ne)) { result[ne] = { contactId: contact.id, photoUrl: contact.photoUrl, displayName: contact.displayName }; }
        }
      }
    }
    return result;
  }

  /**
   * Get interaction history for a contact by matching their email addresses
   * against the Email and CalendarEvent tables.
   */
  async getContactHistory(tenantId: string, contactId: string, limit = 50): Promise<ContactInteraction[]> {
    const contact = await this.crudService.getContact(tenantId, contactId);

    // Extract email addresses from contact's JSON emails field
    const contactEmails: string[] = [];
    if (contact.emails && Array.isArray(contact.emails)) {
      for (const e of contact.emails as Array<{ value?: string }>) {
        if (e.value) contactEmails.push(e.value.toLowerCase());
      }
    }

    if (contactEmails.length === 0) return [];

    const interactions: ContactInteraction[] = [];
    const contactName = contact.displayName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null;

    // 1. Query emails sent TO the contact (user sent them)
    const sentEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        isDeleted: false,
        folder: { in: ['SENT', '[Gmail]/Sent Mail', 'Sent Items', 'Sent'] },
        to: { hasSome: contactEmails },
      },
      select: { id: true, subject: true, sentAt: true, receivedAt: true, aiSentiment: true, to: true },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });

    for (const email of sentEmails) {
      const matchedEmail = email.to.find((t) => contactEmails.includes(t.toLowerCase())) || contactEmails[0];
      interactions.push({
        id: `email-sent-${email.id}`,
        type: 'EMAIL_SENT',
        date: (email.sentAt || email.receivedAt).toISOString(),
        summary: email.subject || null,
        sentiment: email.aiSentiment || null,
        sourceType: 'email',
        emailId: email.id,
        contactEmail: matchedEmail,
        contactName,
      });
    }

    // 2. Query emails received FROM the contact
    // Email.from may be "Name <email>" or plain "email" format
    const fromConditions = contactEmails.map((e) => ({ from: { contains: e, mode: 'insensitive' as const } }));
    const receivedEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        isDeleted: false,
        OR: fromConditions,
      },
      select: { id: true, subject: true, from: true, sentAt: true, receivedAt: true, aiSentiment: true },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    for (const email of receivedEmails) {
      const fromLower = email.from.toLowerCase();
      const matchedEmail = contactEmails.find((e) => fromLower.includes(e)) || contactEmails[0];
      interactions.push({
        id: `email-recv-${email.id}`,
        type: 'EMAIL_RECEIVED',
        date: (email.receivedAt || email.sentAt || new Date()).toISOString(),
        summary: email.subject || null,
        sentiment: email.aiSentiment || null,
        sourceType: 'email',
        emailId: email.id,
        contactEmail: matchedEmail,
        contactName,
      });
    }

    // 3. Query calendar events where contact is an attendee
    // attendees is JSON: [{email, displayName, responseStatus}]
    const calendarEvents = await this.prisma.$queryRaw<
      Array<{ id: string; title: string; startTime: Date; attendees: unknown }>
    >`
      SELECT id, title, "startTime", attendees
      FROM "calendar_events"
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = false
        AND "isCancelled" = false
        AND attendees IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(attendees::jsonb) AS att
          WHERE LOWER(att->>'email') = ANY(${contactEmails}::text[])
        )
      ORDER BY "startTime" DESC
      LIMIT ${limit}
    `;

    for (const event of calendarEvents) {
      interactions.push({
        id: `meeting-${event.id}`,
        type: 'MEETING',
        date: event.startTime.toISOString(),
        summary: event.title || null,
        sentiment: null,
        sourceType: 'calendar',
        emailId: null,
        contactEmail: contactEmails[0],
        contactName,
      });
    }

    // Sort all interactions by date descending, take limit
    interactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return interactions.slice(0, limit);
  }

  async deleteProviderContacts(providerId: string, tenantId: string): Promise<void> {
    this.logger.log(`Deleting all contacts for provider ${providerId}`);
    const providerCheck = await this.prisma.providerConfig.findFirst({ where: { id: providerId, tenantId }, select: { id: true } });
    if (!providerCheck) { this.logger.warn(`Provider ${providerId} not found or doesn't belong to tenant ${tenantId}`); return; }

    const providerContacts = await this.prisma.providerContact.findMany({ where: { providerId }, select: { contactId: true } });
    if (providerContacts.length === 0) { this.logger.log(`No contacts to delete for provider ${providerId}`); return; }

    const contactIds = [...new Set(providerContacts.map((pc) => pc.contactId))];
    await this.prisma.$transaction(async (tx) => {
      await tx.providerContact.deleteMany({ where: { providerId } });
      this.logger.log(`Deleted ${providerContacts.length} provider contact links for provider ${providerId}`);
      const contactsWithLinks = await tx.providerContact.groupBy({ by: ['contactId'], where: { contactId: { in: contactIds } }, _count: { contactId: true } });
      const contactsWithRemainingLinks = new Set(contactsWithLinks.map((c) => c.contactId));
      const orphanedContactIds = contactIds.filter((id) => !contactsWithRemainingLinks.has(id));
      if (orphanedContactIds.length > 0) {
        await tx.contact.deleteMany({ where: { id: { in: orphanedContactIds } } });
        this.logger.log(`Deleted ${orphanedContactIds.length} orphaned contacts`);
      }
    });
    this.realtimeEvents.emitContactSyncComplete(tenantId, { providerId, count: providerContacts.length });
    void this.crudService.updateContactCounts(tenantId);
  }
}
