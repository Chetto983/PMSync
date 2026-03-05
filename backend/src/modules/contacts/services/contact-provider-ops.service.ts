/**
 * ContactProviderOpsService - Provider-level contact operations.
 * Handles: getContactPhoto, findContactsByEmails, deleteProviderContacts.
 * Extracted from ContactsService (Phase 43 god-file split).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GoogleContactsSyncService } from './google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './microsoft-contacts-sync.service';
import { ContactCrudService } from './contact-crud.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

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
