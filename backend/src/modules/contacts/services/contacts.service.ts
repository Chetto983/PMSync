import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { Contact, ProviderContact } from '@prisma/client';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { GoogleContactsSyncService } from './google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './microsoft-contacts-sync.service';

// Unified contact with provider sources
export interface ContactWithProviders extends Contact {
  providerContacts?: Array<{
    id: string;
    providerId: string;
    externalId: string;
    provider: {
      id: string;
      email: string;
      providerType: string;
      displayName: string | null;
    };
  }>;
}

export interface CreateContactDto {
  providerId: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  emails?: Array<{ value: string; type?: string; primary?: boolean }>;
  phoneNumbers?: Array<{ value: string; type?: string; primary?: boolean }>;
  company?: string;
  jobTitle?: string;
  notes?: string;
}

export interface UpdateContactDto {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  emails?: Array<{ value: string; type?: string; primary?: boolean }>;
  phoneNumbers?: Array<{ value: string; type?: string; primary?: boolean }>;
  company?: string;
  jobTitle?: string;
  notes?: string;
  tags?: string[];
}

export interface ListContactsFilters {
  providerId?: string;
  search?: string; // Search by name, email, company
  company?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly googleContactsSync: GoogleContactsSyncService,
    private readonly microsoftContactsSync: MicrosoftContactsSyncService,
  ) {}

  /**
   * List unified contacts for a tenant
   * Returns merged contacts with data from all providers
   */
  async listContacts(
    tenantId: string,
    filters: ListContactsFilters = {},
  ): Promise<{ contacts: ContactWithProviders[]; total: number }> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 50;
    const offset = filters.offset && filters.offset >= 0 ? filters.offset : 0;

    const where: any = {
      tenantId,
      isDeleted: false,
    };

    // Filter by provider - check if ANY providerContact has this providerId
    if (filters.providerId) {
      where.providerContacts = {
        some: {
          providerId: filters.providerId,
        },
      };
    }

    if (filters.company) {
      where.company = { contains: filters.company, mode: 'insensitive' };
    }

    // Search across multiple fields
    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { displayName: { contains: filters.search, mode: 'insensitive' } },
        { company: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: offset,
        take: limit,
        include: {
          providerContacts: {
            select: {
              id: true,
              providerId: true,
              externalId: true,
              provider: {
                select: {
                  id: true,
                  email: true,
                  providerType: true,
                  displayName: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { contacts, total };
  }

  /**
   * Get a single unified contact by ID with all provider sources
   */
  async getContact(tenantId: string, contactId: string): Promise<ContactWithProviders> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        tenantId,
        isDeleted: false,
      },
      include: {
        providerContacts: {
          select: {
            id: true,
            providerId: true,
            externalId: true,
            provider: {
              select: {
                id: true,
                email: true,
                providerType: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    return contact;
  }

  /**
   * Create a new contact (bidirectional sync)
   * Creates the contact locally (unified + provider) AND in the provider's service
   */
  async createContact(tenantId: string, data: CreateContactDto): Promise<ContactWithProviders> {
    this.logger.log(`Creating contact for tenant ${tenantId}`);

    // Get provider config
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: data.providerId,
        tenantId,
        isActive: true,
        supportsContacts: true,
      },
    });

    if (!provider) {
      throw new BadRequestException('Provider not found or does not support contacts');
    }

    // Create contact in provider's service
    let externalContact;
    if (provider.providerType === 'google') {
      externalContact = await this.googleContactsSync.createContact(provider.id, data);
    } else if (provider.providerType === 'microsoft') {
      externalContact = await this.microsoftContactsSync.createContact(provider.id, data);
    } else {
      throw new BadRequestException(`Provider type ${provider.providerType} not supported`);
    }

    // Create unified contact
    const contact = await this.prisma.contact.create({
      data: {
        tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: data.displayName,
        emails: data.emails as any,
        phoneNumbers: data.phoneNumbers as any,
        company: data.company,
        jobTitle: data.jobTitle,
        notes: data.notes,
      },
    });

    // Create provider contact reference
    await this.prisma.providerContact.create({
      data: {
        contactId: contact.id,
        tenantId,
        providerId: provider.id,
        externalId: externalContact.id,
        rawData: externalContact,
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: data.displayName,
        emails: data.emails as any,
        phoneNumbers: data.phoneNumbers as any,
        company: data.company,
        jobTitle: data.jobTitle,
        notes: data.notes,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`Contact created: ${contact.id}`);

    // Return with provider info
    return this.getContact(tenantId, contact.id);
  }

  /**
   * Update a unified contact (user-enriched fields)
   * Note: This updates the unified contact, not provider contacts
   * Use sync services to update provider contacts
   */
  async updateContact(
    tenantId: string,
    contactId: string,
    data: UpdateContactDto,
  ): Promise<ContactWithProviders> {
    this.logger.log(`Updating contact ${contactId}`);

    // Get existing contact
    await this.getContact(tenantId, contactId);

    // Update unified contact (user-enriched data)
    const updated = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        ...data,
        emails: data.emails as any,
        phoneNumbers: data.phoneNumbers as any,
        updatedAt: new Date(),
      },
      include: {
        providerContacts: {
          select: {
            id: true,
            providerId: true,
            externalId: true,
            provider: {
              select: {
                id: true,
                email: true,
                providerType: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(`Contact updated: ${contactId}`);
    return updated;
  }

  /**
   * Delete a unified contact (soft delete)
   * This marks the unified contact as deleted
   * Provider contacts remain for sync purposes
   */
  async deleteContact(tenantId: string, contactId: string): Promise<void> {
    this.logger.log(`Deleting contact ${contactId}`);

    // Get existing contact
    await this.getContact(tenantId, contactId);

    // Soft delete unified contact
    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Contact deleted: ${contactId}`);
  }

  /**
   * Sync contacts from a provider
   * Delegates to provider-specific sync services
   */
  async syncContacts(providerId: string): Promise<number> {
    this.logger.log(`Syncing contacts for provider ${providerId}`);

    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider || !provider.supportsContacts) {
      throw new BadRequestException('Provider not found or does not support contacts');
    }

    let syncedCount = 0;

    if (provider.providerType === 'google') {
      syncedCount = await this.googleContactsSync.syncContacts(providerId);
    } else if (provider.providerType === 'microsoft') {
      syncedCount = await this.microsoftContactsSync.syncContacts(providerId);
    }

    this.logger.log(`Synced ${syncedCount} contacts for provider ${providerId}`);
    return syncedCount;
  }

  /**
   * Helper: Find or create unified contact by email
   * Used by sync services to deduplicate contacts
   */
  async findOrCreateUnifiedContact(
    tenantId: string,
    email: string,
    contactData: Partial<Contact>,
  ): Promise<Contact> {
    // Search for existing unified contact with this email
    const existingContacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        isDeleted: false,
      },
    });

    // Check if any contact has this email in their emails array
    for (const contact of existingContacts) {
      if (contact.emails) {
        const emails = JSON.parse(JSON.stringify(contact.emails));
        if (Array.isArray(emails)) {
          const hasEmail = emails.some(
            (e: any) => e.value?.toLowerCase() === email.toLowerCase(),
          );
          if (hasEmail) {
            return contact;
          }
        }
      }
    }

    // No existing contact found, create new unified contact
    return this.prisma.contact.create({
      data: {
        tenantId,
        firstName: contactData.firstName,
        lastName: contactData.lastName,
        displayName: contactData.displayName,
        middleName: contactData.middleName,
        nickname: contactData.nickname,
        prefix: contactData.prefix,
        suffix: contactData.suffix,
        emails: contactData.emails as any,
        phoneNumbers: contactData.phoneNumbers as any,
        addresses: contactData.addresses as any,
        company: contactData.company,
        jobTitle: contactData.jobTitle,
        department: contactData.department,
        birthday: contactData.birthday,
        anniversary: contactData.anniversary,
        websites: contactData.websites as any,
        socialProfiles: contactData.socialProfiles as any,
        notes: contactData.notes,
        photoUrl: contactData.photoUrl,
        photoEtag: contactData.photoEtag,
        isDeleted: contactData.isDeleted ?? false,
        isStarred: contactData.isStarred ?? false,
        isFavorite: contactData.isFavorite ?? false,
        metadata: contactData.metadata as any,
      },
    });
  }
}
