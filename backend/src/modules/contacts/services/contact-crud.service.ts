/**
 * ContactCrudService - Contact CRUD, counts, VIP operations.
 * Extracted from ContactsService (Phase 43 god-file split).
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { GoogleContactsSyncService } from './google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './microsoft-contacts-sync.service';
import { ContactsCacheService } from './contacts-cache.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { ContactEmbeddingQueueService } from '../../ai/services/contact-embedding.queue';
import { ContactUpdatedEvent } from '../../../common/events/contact.events';
import { CONTACTS_DEFAULTS } from '../contacts.constants';
import type { ContactWithProviders, ListContactsFilters, ContactCounts } from '../contacts.types';
import type { CreateContactDto, UpdateContactDto } from '../dto/contact.dto';

@Injectable()
export class ContactCrudService {
  private readonly logger = new Logger(ContactCrudService.name);
  private readonly maxContactsLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleContactsSync: GoogleContactsSyncService,
    private readonly microsoftContactsSync: MicrosoftContactsSyncService,
    private readonly cacheService: ContactsCacheService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly configService: ConfigService,
    private readonly contactEmbeddingQueue: ContactEmbeddingQueueService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.maxContactsLimit = this.configService.get<number>('CONTACTS_LIST_MAX_LIMIT', CONTACTS_DEFAULTS.MAX_CONTACTS_LIMIT);
  }

  async listContacts(tenantId: string, filters: ListContactsFilters = {}): Promise<{ contacts: ContactWithProviders[]; total: number }> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= this.maxContactsLimit ? filters.limit : CONTACTS_DEFAULTS.DEFAULT_PAGE_SIZE;
    const offset = filters.offset && filters.offset >= 0 ? filters.offset : 0;
    const where: Prisma.ContactWhereInput = { tenantId, isDeleted: false };
    if (filters.providerId) { where.providerContacts = { some: { providerId: filters.providerId } }; }
    if (filters.company) { where.company = { contains: filters.company, mode: 'insensitive' }; }
    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { displayName: { contains: filters.search, mode: 'insensitive' } },
        { company: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: offset, take: limit, include: { providerContacts: { select: { id: true, providerId: true, externalId: true, provider: { select: { id: true, email: true, providerType: true, displayName: true } } } } } }),
      this.prisma.contact.count({ where }),
    ]);
    return { contacts, total };
  }

  async getContact(tenantId: string, contactId: string): Promise<ContactWithProviders> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId, isDeleted: false },
      include: { providerContacts: { select: { id: true, providerId: true, externalId: true, provider: { select: { id: true, email: true, providerType: true, displayName: true } } } } },
    });
    if (!contact) throw new NotFoundException(`Contact ${contactId} not found`);
    return contact;
  }

  async getContactCounts(tenantId: string): Promise<ContactCounts> {
    const cached = await this.cacheService.getCachedContactCounts(tenantId);
    if (cached) {
      return { total: cached.total, withEmail: cached.withEmail, withPhone: cached.withPhone, withCompany: 0, byProvider: Object.entries(cached.byProvider).map(([providerId, count]) => ({ providerId, count })) };
    }
    const baseWhere = { tenantId, isDeleted: false };
    const [total, withEmail, withPhone, withCompany, providerCounts] = await Promise.all([
      this.prisma.contact.count({ where: baseWhere }),
      this.prisma.contact.count({ where: { ...baseWhere, emails: { not: { equals: null } } } }),
      this.prisma.contact.count({ where: { ...baseWhere, phoneNumbers: { not: { equals: null } } } }),
      this.prisma.contact.count({ where: { ...baseWhere, company: { not: null } } }),
      this.prisma.providerContact.groupBy({ by: ['providerId'], where: { tenantId, contact: { isDeleted: false } }, _count: { id: true } }),
    ]);
    const byProvider = providerCounts.map((pc) => ({ providerId: pc.providerId, count: pc._count.id }));
    const byProviderRecord: Record<string, number> = {};
    for (const { providerId, count } of byProvider) byProviderRecord[providerId] = count;
    await this.cacheService.cacheContactCounts(tenantId, { total, byProvider: byProviderRecord, withEmail, withPhone, starred: 0 });
    return { total, withEmail, withPhone, withCompany, byProvider };
  }

  async updateContactCounts(tenantId: string): Promise<void> {
    try {
      if (!this.realtimeEvents.hasTenantConnections(tenantId)) return;
      const counts = await this.getContactCounts(tenantId);
      this.realtimeEvents.emitContactCounts(tenantId, counts);
    } catch (error: any) { this.logger.warn(`Failed to update contact counts: ${error?.message}`); }
  }

  async createContact(tenantId: string, data: CreateContactDto): Promise<ContactWithProviders> {
    const provider = await this.prisma.providerConfig.findFirst({ where: { id: data.providerId, tenantId, isActive: true, supportsContacts: true } });
    if (!provider) throw new BadRequestException('Provider not found or does not support contacts');
    let externalContact;
    if (provider.providerType === 'google') { externalContact = await this.googleContactsSync.createContact(provider.id, data); }
    else if (provider.providerType === 'microsoft') { externalContact = await this.microsoftContactsSync.createContact(provider.id, data); }
    else { throw new BadRequestException(`Provider type ${provider.providerType} not supported`); }
    const contact = await this.prisma.contact.create({
      data: { tenantId, firstName: data.firstName, lastName: data.lastName, displayName: data.displayName, emails: data.emails ? (data.emails as unknown as Prisma.InputJsonValue) : undefined, phoneNumbers: data.phoneNumbers ? (data.phoneNumbers as unknown as Prisma.InputJsonValue) : undefined, company: data.company, jobTitle: data.jobTitle, notes: data.notes, isVip: data.isVip ?? false },
    });
    await this.prisma.providerContact.create({
      data: { contactId: contact.id, tenantId, providerId: provider.id, externalId: externalContact.id, rawData: externalContact as Prisma.InputJsonValue, firstName: data.firstName, lastName: data.lastName, displayName: data.displayName, emails: data.emails ? (data.emails as unknown as Prisma.InputJsonValue) : undefined, phoneNumbers: data.phoneNumbers ? (data.phoneNumbers as unknown as Prisma.InputJsonValue) : undefined, company: data.company, jobTitle: data.jobTitle, notes: data.notes, lastSyncedAt: new Date() },
    });
    this.eventEmitter.emit(ContactUpdatedEvent.eventName, new ContactUpdatedEvent(tenantId, '', contact.id, ['created'], new Date()));
    void this.updateContactCounts(tenantId);
    void this.contactEmbeddingQueue.enqueue({ tenantId, contactId: contact.id, displayName: contact.displayName, firstName: contact.firstName, lastName: contact.lastName, company: contact.company, jobTitle: contact.jobTitle, notes: contact.notes, tags: contact.tags, emails: data.emails as { value: string; type?: string }[] | undefined, phoneNumbers: data.phoneNumbers as { value: string; type?: string }[] | undefined });
    return this.getContact(tenantId, contact.id);
  }

  async updateContact(tenantId: string, contactId: string, data: UpdateContactDto): Promise<ContactWithProviders> {
    const contact = await this.getContact(tenantId, contactId);
    if (contact.providerContacts?.length) {
      for (const pc of contact.providerContacts) {
        try {
          const prov = await this.prisma.providerConfig.findUnique({ where: { id: pc.providerId } });
          if (prov?.isActive) {
            if (prov.providerType === 'google') await this.googleContactsSync.updateContact(prov.id, pc.externalId, data);
            else if (prov.providerType === 'microsoft') await this.microsoftContactsSync.updateContact(prov.id, pc.externalId, data);
          }
        } catch (error: any) { this.logger.warn(`Failed to sync update to provider ${pc.providerId}: ${error.message}`); }
      }
    }
    const updated = await this.prisma.contact.update({
      where: { id_tenantId: { id: contactId, tenantId } },
      data: { firstName: data.firstName, lastName: data.lastName, displayName: data.displayName, company: data.company, jobTitle: data.jobTitle, notes: data.notes, tags: data.tags, emails: data.emails ? (data.emails as unknown as Prisma.InputJsonValue) : undefined, phoneNumbers: data.phoneNumbers ? (data.phoneNumbers as unknown as Prisma.InputJsonValue) : undefined, updatedAt: new Date() },
      include: { providerContacts: { select: { id: true, providerId: true, externalId: true, provider: { select: { id: true, email: true, providerType: true, displayName: true } } } } },
    });
    const changedFields = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
    this.eventEmitter.emit(ContactUpdatedEvent.eventName, new ContactUpdatedEvent(tenantId, '', contactId, changedFields, new Date()));
    void this.updateContactCounts(tenantId);
    void this.contactEmbeddingQueue.enqueue({ tenantId, contactId: updated.id, displayName: updated.displayName, firstName: updated.firstName, lastName: updated.lastName, company: updated.company, jobTitle: updated.jobTitle, notes: updated.notes, tags: updated.tags, emails: updated.emails as { value: string; type?: string }[] | null, phoneNumbers: updated.phoneNumbers as { value: string; type?: string }[] | null });
    return updated;
  }

  async deleteContact(tenantId: string, contactId: string): Promise<void> {
    const contact = await this.getContact(tenantId, contactId);
    if (contact.providerContacts?.length) {
      for (const pc of contact.providerContacts) {
        try {
          const prov = await this.prisma.providerConfig.findUnique({ where: { id: pc.providerId } });
          if (prov?.isActive) {
            if (prov.providerType === 'google') await this.googleContactsSync.deleteContact(prov.id, pc.externalId);
            else if (prov.providerType === 'microsoft') await this.microsoftContactsSync.deleteContact(prov.id, pc.externalId);
          }
        } catch (error: any) { this.logger.warn(`Failed to delete from provider ${pc.providerId}: ${error.message}`); }
      }
    }
    await this.prisma.$transaction([
      this.prisma.contact.update({ where: { id_tenantId: { id: contactId, tenantId } }, data: { isDeleted: true, updatedAt: new Date() } }),
      this.prisma.providerContact.updateMany({ where: { contactId }, data: { lastSyncedAt: new Date() } }),
    ]);
    this.realtimeEvents.emitContactDelete(tenantId, { contactId, reason: 'contact-deleted', timestamp: new Date().toISOString() });
    void this.updateContactCounts(tenantId);
  }

  async toggleVip(tenantId: string, contactId: string): Promise<ContactWithProviders> {
    const contact = await this.getContact(tenantId, contactId);
    const updated = await this.prisma.contact.update({
      where: { id_tenantId: { id: contactId, tenantId } },
      data: { isVip: !contact.isVip },
      include: { providerContacts: { select: { id: true, providerId: true, externalId: true, provider: { select: { id: true, email: true, providerType: true, displayName: true } } } } },
    });
    this.logger.log(`Contact ${contactId} VIP status set to ${updated.isVip}`);
    return updated;
  }

  async listVipContacts(tenantId: string): Promise<{ contacts: ContactWithProviders[]; total: number }> {
    const where = { tenantId, isVip: true, isDeleted: false };
    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], include: { providerContacts: { select: { id: true, providerId: true, externalId: true, provider: { select: { id: true, email: true, providerType: true, displayName: true } } } } } }),
      this.prisma.contact.count({ where }),
    ]);
    return { contacts, total };
  }
}
