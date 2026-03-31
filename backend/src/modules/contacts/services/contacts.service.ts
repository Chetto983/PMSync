/**
 * ContactsService - Facade for contact management.
 *
 * Delegates to:
 * - ContactCrudService: CRUD, counts, VIP operations
 * - ContactProviderOpsService: photo, email lookup, provider cleanup
 * - ContactSyncService: sync, find-or-create, import delegation
 *
 * Phase 43: Split from 1038-line monolith into focused sub-services.
 */
import { Injectable } from '@nestjs/common';
import { Contact } from '@prisma/client';
import { ContactCrudService } from './contact-crud.service';
import { ContactProviderOpsService } from './contact-provider-ops.service';
import { ContactSyncService } from './contact-sync.service';
import type { ContactWithProviders, ListContactsFilters, ContactCounts, VCardImportResult, EmailExtractionResult, ContactInteraction } from '../contacts.types';
import type { CreateContactDto, UpdateContactDto } from '../dto/contact.dto';

// Re-export types for backward compatibility
export type { EmailAddress, PhoneNumber, Address, SocialProfile, ContactMetadata, ContactWithProviders, ListContactsFilters } from '../contacts.types';

@Injectable()
export class ContactsService {
  constructor(
    private readonly crudService: ContactCrudService,
    private readonly providerOps: ContactProviderOpsService,
    private readonly syncService: ContactSyncService,
  ) {}

  // CRUD
  async listContacts(tenantId: string, filters?: ListContactsFilters): Promise<{ contacts: ContactWithProviders[]; total: number }> {
    return this.crudService.listContacts(tenantId, filters);
  }
  async getContact(tenantId: string, contactId: string): Promise<ContactWithProviders> {
    return this.crudService.getContact(tenantId, contactId);
  }
  async getContactCounts(tenantId: string): Promise<ContactCounts> {
    return this.crudService.getContactCounts(tenantId);
  }
  async updateContactCounts(tenantId: string): Promise<void> {
    return this.crudService.updateContactCounts(tenantId);
  }
  async createContact(tenantId: string, data: CreateContactDto): Promise<ContactWithProviders> {
    return this.crudService.createContact(tenantId, data);
  }
  async updateContact(tenantId: string, contactId: string, data: UpdateContactDto): Promise<ContactWithProviders> {
    return this.crudService.updateContact(tenantId, contactId, data);
  }
  async deleteContact(tenantId: string, contactId: string): Promise<void> {
    return this.crudService.deleteContact(tenantId, contactId);
  }
  async bulkDeleteContacts(tenantId: string, contactIds: string[]): Promise<number> {
    return this.crudService.bulkDeleteContacts(tenantId, contactIds);
  }

  // VIP
  async toggleVip(tenantId: string, contactId: string): Promise<ContactWithProviders> {
    return this.crudService.toggleVip(tenantId, contactId);
  }
  async listVipContacts(tenantId: string): Promise<{ contacts: ContactWithProviders[]; total: number }> {
    return this.crudService.listVipContacts(tenantId);
  }

  // Provider operations
  async getContactPhoto(tenantId: string, contactId: string): Promise<string | null> {
    return this.providerOps.getContactPhoto(tenantId, contactId);
  }
  async findContactsByEmails(tenantId: string, emails: string[]): Promise<Record<string, { contactId: string; photoUrl: string | null; displayName: string | null }>> {
    return this.providerOps.findContactsByEmails(tenantId, emails);
  }
  async deleteProviderContacts(providerId: string, tenantId: string): Promise<void> {
    return this.providerOps.deleteProviderContacts(providerId, tenantId);
  }
  async getContactHistory(tenantId: string, contactId: string, limit?: number): Promise<ContactInteraction[]> {
    return this.providerOps.getContactHistory(tenantId, contactId, limit);
  }

  // Sync & import
  async syncContacts(providerId: string, tenantId?: string): Promise<number> {
    return this.syncService.syncContacts(providerId, tenantId);
  }
  async findOrCreateUnifiedContact(tenantId: string, email: string, contactData: Partial<Contact>): Promise<Contact> {
    return this.syncService.findOrCreateUnifiedContact(tenantId, email, contactData);
  }
  async createLocalContact(tenantId: string, data: Omit<CreateContactDto, 'providerId'>): Promise<Contact> {
    return this.syncService.createLocalContact(tenantId, data);
  }
  async extractContactsFromEmails(tenantId: string, providerId?: string, excludePublicDomains?: boolean): Promise<EmailExtractionResult> {
    return this.syncService.extractContactsFromEmails(tenantId, providerId, excludePublicDomains);
  }
  async importFromVCard(tenantId: string, vcfContent: string): Promise<VCardImportResult> {
    return this.syncService.importFromVCard(tenantId, vcfContent);
  }
}
