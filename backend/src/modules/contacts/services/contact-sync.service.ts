/**
 * ContactSyncService - Contact sync, find-or-create, and import delegation.
 * Handles: syncContacts, findOrCreateUnifiedContact, createLocalContact,
 *          extractContactsFromEmails, importFromVCard.
 * Extracted from ContactsService (Phase 43 god-file split).
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Contact, Prisma } from '@prisma/client';
import { GoogleContactsSyncService } from './google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './microsoft-contacts-sync.service';
import { ContactsCacheService } from './contacts-cache.service';
import { ContactsImportService } from './contacts-import.service';
import { ContactCrudService } from './contact-crud.service';
import type { VCardImportResult, EmailExtractionResult } from '../contacts.types';
import type { CreateContactDto } from '../dto/contact.dto';

@Injectable()
export class ContactSyncService {
  private readonly logger = new Logger(ContactSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleContactsSync: GoogleContactsSyncService,
    private readonly microsoftContactsSync: MicrosoftContactsSyncService,
    private readonly cacheService: ContactsCacheService,
    private readonly importService: ContactsImportService,
    private readonly crudService: ContactCrudService,
  ) {}

  async syncContacts(providerId: string, tenantId?: string): Promise<number> {
    this.logger.log(`Syncing contacts for provider ${providerId}`);
    const provider = await this.prisma.providerConfig.findUnique({ where: { id: providerId } });
    if (!provider || !provider.supportsContacts) throw new BadRequestException('Provider not found or does not support contacts');
    if (tenantId && provider.tenantId !== tenantId) throw new BadRequestException('Provider does not belong to this tenant');

    const lockAcquired = await this.cacheService.acquireSyncLock(providerId);
    if (!lockAcquired) { this.logger.warn(`Sync already in progress for provider ${providerId}, skipping`); return 0; }

    try {
      let syncedCount = 0;
      if (provider.providerType === 'google') syncedCount = await this.googleContactsSync.syncContacts(providerId);
      else if (provider.providerType === 'microsoft') syncedCount = await this.microsoftContactsSync.syncContacts(providerId);
      this.logger.log(`Synced ${syncedCount} contacts for provider ${providerId}`);
      await this.cacheService.invalidateContactCountsCache(provider.tenantId);
      void this.crudService.updateContactCounts(provider.tenantId);
      return syncedCount;
    } finally {
      await this.cacheService.releaseSyncLock(providerId);
    }
  }

  async findOrCreateUnifiedContact(tenantId: string, email: string, contactData: Partial<Contact>): Promise<Contact> {
    const normalizedEmail = email.toLowerCase();
    const existingContacts = await this.prisma.$queryRaw<Contact[]>`
      SELECT * FROM "unified_contacts"
      WHERE "tenantId" = ${tenantId} AND "isDeleted" = false AND emails IS NOT NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(emails) AS email_obj WHERE LOWER(email_obj->>'value') = ${normalizedEmail})
      LIMIT 1
    `;
    if (existingContacts.length > 0) return existingContacts[0];

    return this.prisma.contact.create({
      data: {
        tenantId, firstName: contactData.firstName, lastName: contactData.lastName,
        displayName: contactData.displayName, middleName: contactData.middleName,
        nickname: contactData.nickname, prefix: contactData.prefix, suffix: contactData.suffix,
        emails: contactData.emails ? (contactData.emails as unknown as Prisma.InputJsonValue) : undefined,
        phoneNumbers: contactData.phoneNumbers ? (contactData.phoneNumbers as unknown as Prisma.InputJsonValue) : undefined,
        addresses: contactData.addresses ? (contactData.addresses as unknown as Prisma.InputJsonValue) : undefined,
        company: contactData.company, jobTitle: contactData.jobTitle, department: contactData.department,
        birthday: contactData.birthday, anniversary: contactData.anniversary,
        websites: contactData.websites ? (contactData.websites as unknown as Prisma.InputJsonValue) : undefined,
        socialProfiles: contactData.socialProfiles ? (contactData.socialProfiles as unknown as Prisma.InputJsonValue) : undefined,
        notes: contactData.notes, photoUrl: contactData.photoUrl, photoEtag: contactData.photoEtag,
        isDeleted: contactData.isDeleted ?? false, isStarred: contactData.isStarred ?? false,
        isFavorite: contactData.isFavorite ?? false,
        metadata: contactData.metadata ? (contactData.metadata as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async createLocalContact(tenantId: string, data: Omit<CreateContactDto, 'providerId'>): Promise<Contact> {
    const contact = await this.importService.createLocalContact(tenantId, data);
    void this.crudService.updateContactCounts(tenantId);
    return contact;
  }

  async extractContactsFromEmails(tenantId: string, providerId?: string, excludePublicDomains = true): Promise<EmailExtractionResult> {
    const result = await this.importService.extractContactsFromEmails(tenantId, providerId, excludePublicDomains);
    void this.crudService.updateContactCounts(tenantId);
    return result;
  }

  async importFromVCard(tenantId: string, vcfContent: string): Promise<VCardImportResult> {
    const result = await this.importService.importFromVCard(tenantId, vcfContent);
    void this.crudService.updateContactCounts(tenantId);
    return result;
  }
}
