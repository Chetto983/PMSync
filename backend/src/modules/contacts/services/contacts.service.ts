import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { Contact, Prisma } from '@prisma/client';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { GoogleContactsSyncService } from './google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './microsoft-contacts-sync.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { getRedisConnectionOptions } from '../../../common/config';
import { Redis } from 'ioredis';
import vCard from 'vcf';

// Type-safe interfaces for JSON fields
export interface EmailAddress {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface PhoneNumber {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  type?: string;
}

export interface SocialProfile {
  url: string;
  type?: string;
}

export interface ContactMetadata {
  source?: string;
  extractedAt?: string;
  createdAt?: string;
  importedAt?: string;
  [key: string]: unknown;
}

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
export class ContactsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactsService.name);
  private readonly maxContactsLimit: number;
  private readonly contactCountsCacheTtl: number;
  private readonly syncLockTtl: number;
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly googleContactsSync: GoogleContactsSyncService,
    private readonly microsoftContactsSync: MicrosoftContactsSyncService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly configService: ConfigService,
  ) {
    this.maxContactsLimit = this.configService.get<number>('CONTACTS_LIST_MAX_LIMIT', 500);
    this.contactCountsCacheTtl = this.configService.get<number>('CONTACTS_COUNTS_CACHE_TTL', 300); // 5 minutes
    this.syncLockTtl = this.configService.get<number>('CONTACTS_SYNC_LOCK_TTL', 300); // 5 minutes
  }

  async onModuleInit(): Promise<void> {
    try {
      const redisOptions = getRedisConnectionOptions();
      this.redis = new Redis(redisOptions);
      this.logger.log('Redis connection established for ContactsService');
    } catch (error) {
      this.logger.warn(`Failed to connect to Redis, running without caching: ${error}`);
      this.redis = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis && this.redis.status !== 'end') {
      await this.redis.quit();
      this.logger.log('Redis connection closed for ContactsService');
    }
  }

  /**
   * Acquire distributed lock for contact sync
   * Prevents multiple instances from syncing same provider simultaneously
   */
  private async acquireSyncLock(providerId: string): Promise<boolean> {
    if (!this.redis) return true; // Allow sync if Redis not available

    const lockKey = `contacts:sync:lock:${providerId}`;
    const result = await this.redis.set(lockKey, process.pid.toString(), 'EX', this.syncLockTtl, 'NX');
    return result === 'OK';
  }

  /**
   * Release distributed lock for contact sync
   */
  private async releaseSyncLock(providerId: string): Promise<void> {
    if (!this.redis) return;

    const lockKey = `contacts:sync:lock:${providerId}`;
    await this.redis.del(lockKey);
  }

  /**
   * Get cached contact counts or fetch from database
   */
  private async getCachedContactCounts(tenantId: string): Promise<{
    total: number;
    byProvider: Record<string, number>;
    withEmail: number;
    withPhone: number;
    starred: number;
  } | null> {
    if (!this.redis) return null;

    try {
      const cacheKey = `contacts:counts:${tenantId}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(`Failed to get cached contact counts: ${error}`);
    }
    return null;
  }

  /**
   * Cache contact counts
   */
  private async cacheContactCounts(
    tenantId: string,
    counts: {
      total: number;
      byProvider: Record<string, number>;
      withEmail: number;
      withPhone: number;
      starred: number;
    },
  ): Promise<void> {
    if (!this.redis) return;

    try {
      const cacheKey = `contacts:counts:${tenantId}`;
      await this.redis.setex(cacheKey, this.contactCountsCacheTtl, JSON.stringify(counts));
    } catch (error) {
      this.logger.warn(`Failed to cache contact counts: ${error}`);
    }
  }

  /**
   * Invalidate contact counts cache
   */
  private async invalidateContactCountsCache(tenantId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const cacheKey = `contacts:counts:${tenantId}`;
      await this.redis.del(cacheKey);
    } catch (error) {
      this.logger.warn(`Failed to invalidate contact counts cache: ${error}`);
    }
  }

  /**
   * List unified contacts for a tenant
   * Returns merged contacts with data from all providers
   */
  async listContacts(
    tenantId: string,
    filters: ListContactsFilters = {},
  ): Promise<{ contacts: ContactWithProviders[]; total: number }> {
    // Allow larger batches for faster bulk loading (max from config)
    const limit = filters.limit && filters.limit > 0 && filters.limit <= this.maxContactsLimit
      ? filters.limit
      : 100;
    const offset = filters.offset && filters.offset >= 0 ? filters.offset : 0;

    const where: Prisma.ContactWhereInput = {
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
   * Get contact counts for sidebar display
   * Efficiently queries counts from database with Redis caching
   */
  async getContactCounts(tenantId: string): Promise<{
    total: number;
    withEmail: number;
    withPhone: number;
    withCompany: number;
    byProvider: Array<{ providerId: string; count: number }>;
  }> {
    // Try to get from cache first
    const cached = await this.getCachedContactCounts(tenantId);
    if (cached) {
      // Convert cached format back to expected format
      return {
        total: cached.total,
        withEmail: cached.withEmail,
        withPhone: cached.withPhone,
        withCompany: 0, // Not in cache, will be computed if needed
        byProvider: Object.entries(cached.byProvider).map(([providerId, count]) => ({
          providerId,
          count,
        })),
      };
    }

    const baseWhere = { tenantId, isDeleted: false };

    // Run all counts in parallel for efficiency
    const [total, withEmail, withPhone, withCompany, providerCounts] = await Promise.all([
      // Total contacts
      this.prisma.contact.count({ where: baseWhere }),

      // Contacts with at least one email
      this.prisma.contact.count({
        where: {
          ...baseWhere,
          emails: { not: { equals: null } },
        },
      }),

      // Contacts with at least one phone number
      this.prisma.contact.count({
        where: {
          ...baseWhere,
          phoneNumbers: { not: { equals: null } },
        },
      }),

      // Contacts with company
      this.prisma.contact.count({
        where: {
          ...baseWhere,
          company: { not: null },
        },
      }),

      // Count by provider
      this.prisma.providerContact.groupBy({
        by: ['providerId'],
        where: {
          tenantId,
          contact: { isDeleted: false },
        },
        _count: { id: true },
      }),
    ]);

    const byProvider = providerCounts.map((pc) => ({
      providerId: pc.providerId,
      count: pc._count.id,
    }));

    // Cache the results
    const byProviderRecord: Record<string, number> = {};
    for (const { providerId, count } of byProvider) {
      byProviderRecord[providerId] = count;
    }
    await this.cacheContactCounts(tenantId, {
      total,
      byProvider: byProviderRecord,
      withEmail,
      withPhone,
      starred: 0, // Not computed in this query
    });

    return { total, withEmail, withPhone, withCompany, byProvider };
  }

  /**
   * Update and emit contact counts via WebSocket
   * Called after contact changes to update sidebar in real-time
   */
  async updateContactCounts(tenantId: string): Promise<void> {
    try {
      // Skip if no active WebSocket connections
      if (!this.realtimeEvents.hasTenantConnections(tenantId)) {
        return;
      }

      const counts = await this.getContactCounts(tenantId);
      this.realtimeEvents.emitContactCounts(tenantId, counts);
    } catch (error: any) {
      this.logger.warn(`Failed to update contact counts: ${error?.message}`);
    }
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
        emails: data.emails ? (data.emails as unknown as Prisma.InputJsonValue) : undefined,
        phoneNumbers: data.phoneNumbers ? (data.phoneNumbers as unknown as Prisma.InputJsonValue) : undefined,
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
        rawData: externalContact as Prisma.InputJsonValue,
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: data.displayName,
        emails: data.emails ? (data.emails as unknown as Prisma.InputJsonValue) : undefined,
        phoneNumbers: data.phoneNumbers ? (data.phoneNumbers as unknown as Prisma.InputJsonValue) : undefined,
        company: data.company,
        jobTitle: data.jobTitle,
        notes: data.notes,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`Contact created: ${contact.id}`);

    // Emit updated counts
    void this.updateContactCounts(tenantId);

    // Return with provider info
    return this.getContact(tenantId, contact.id);
  }

  /**
   * Update a unified contact (bidirectional sync)
   * Updates the contact locally AND syncs changes to all linked providers
   */
  async updateContact(
    tenantId: string,
    contactId: string,
    data: UpdateContactDto,
  ): Promise<ContactWithProviders> {
    this.logger.log(`Updating contact ${contactId} (bidirectional)`);

    // Get existing contact with provider links
    const contact = await this.getContact(tenantId, contactId);

    // Sync changes to all linked providers
    if (contact.providerContacts && contact.providerContacts.length > 0) {
      for (const providerContact of contact.providerContacts) {
        try {
          const provider = await this.prisma.providerConfig.findUnique({
            where: { id: providerContact.providerId },
          });

          if (provider?.isActive) {
            if (provider.providerType === 'google') {
              await this.googleContactsSync.updateContact(
                provider.id,
                providerContact.externalId,
                data,
              );
              this.logger.log(`Synced update to Google: ${providerContact.externalId}`);
            } else if (provider.providerType === 'microsoft') {
              await this.microsoftContactsSync.updateContact(
                provider.id,
                providerContact.externalId,
                data,
              );
              this.logger.log(`Synced update to Microsoft: ${providerContact.externalId}`);
            }
          }
        } catch (error: any) {
          this.logger.warn(`Failed to sync update to provider ${providerContact.providerId}: ${error.message}`);
          // Continue with local update even if provider sync fails
        }
      }
    }

    // Update unified contact locally
    const updated = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: data.displayName,
        company: data.company,
        jobTitle: data.jobTitle,
        notes: data.notes,
        tags: data.tags,
        emails: data.emails ? (data.emails as unknown as Prisma.InputJsonValue) : undefined,
        phoneNumbers: data.phoneNumbers ? (data.phoneNumbers as unknown as Prisma.InputJsonValue) : undefined,
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

    // Emit updated counts (in case company/email/phone changed)
    void this.updateContactCounts(tenantId);

    return updated;
  }

  /**
   * Delete a unified contact (bidirectional sync)
   * Deletes the contact from all linked providers AND marks local as deleted
   */
  async deleteContact(tenantId: string, contactId: string): Promise<void> {
    this.logger.log(`Deleting contact ${contactId} (bidirectional)`);

    // Get existing contact with provider links
    const contact = await this.getContact(tenantId, contactId);

    // Delete from all linked providers (external API calls - done outside transaction)
    if (contact.providerContacts && contact.providerContacts.length > 0) {
      for (const providerContact of contact.providerContacts) {
        try {
          const provider = await this.prisma.providerConfig.findUnique({
            where: { id: providerContact.providerId },
          });

          if (provider?.isActive) {
            if (provider.providerType === 'google') {
              await this.googleContactsSync.deleteContact(
                provider.id,
                providerContact.externalId,
              );
              this.logger.log(`Deleted from Google: ${providerContact.externalId}`);
            } else if (provider.providerType === 'microsoft') {
              await this.microsoftContactsSync.deleteContact(
                provider.id,
                providerContact.externalId,
              );
              this.logger.log(`Deleted from Microsoft: ${providerContact.externalId}`);
            }
          }
        } catch (error: any) {
          this.logger.warn(`Failed to delete from provider ${providerContact.providerId}: ${error.message}`);
          // Continue with local delete even if provider delete fails
        }
      }
    }

    // Soft delete unified contact and update provider contacts atomically
    await this.prisma.$transaction([
      this.prisma.contact.update({
        where: { id: contactId },
        data: {
          isDeleted: true,
          updatedAt: new Date(),
        },
      }),
      this.prisma.providerContact.updateMany({
        where: { contactId },
        data: {
          lastSyncedAt: new Date(),
        },
      }),
    ]);

    this.logger.log(`Contact deleted: ${contactId}`);

    // Emit real-time event for deletion
    this.realtimeEvents.emitContactDelete(tenantId, {
      contactId,
      reason: 'contact-deleted',
      timestamp: new Date().toISOString(),
    });

    // Emit updated counts
    void this.updateContactCounts(tenantId);
  }

  /**
   * Delete all contacts associated with a provider
   * Called when a provider is being deleted
   * @param providerId - Provider ID being deleted
   * @param tenantId - Tenant ID for authorization
   */
  async deleteProviderContacts(providerId: string, tenantId: string): Promise<void> {
    this.logger.log(`Deleting all contacts for provider ${providerId}`);

    // Verify provider belongs to tenant (defense in depth)
    const providerCheck = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true },
    });

    if (!providerCheck) {
      this.logger.warn(`Provider ${providerId} not found or doesn't belong to tenant ${tenantId}`);
      return;
    }

    // Get all contact IDs linked to this provider (for orphan detection)
    const providerContacts = await this.prisma.providerContact.findMany({
      where: { providerId },
      select: { contactId: true },
    });

    if (providerContacts.length === 0) {
      this.logger.log(`No contacts to delete for provider ${providerId}`);
      return;
    }

    const contactIds = [...new Set(providerContacts.map(pc => pc.contactId))];

    // Execute deletion and orphan cleanup in a single transaction (fixes race condition)
    await this.prisma.$transaction(async (tx) => {
      // Delete provider contact links
      await tx.providerContact.deleteMany({
        where: { providerId },
      });

      this.logger.log(`Deleted ${providerContacts.length} provider contact links for provider ${providerId}`);

      // Find orphaned contacts using a single aggregated query (fixes N+1)
      // Count remaining links for all affected contacts in one query
      const contactsWithLinks = await tx.providerContact.groupBy({
        by: ['contactId'],
        where: {
          contactId: { in: contactIds },
        },
        _count: { contactId: true },
      });

      // Build set of contacts that still have links
      const contactsWithRemainingLinks = new Set(contactsWithLinks.map(c => c.contactId));

      // Find orphaned contacts (no remaining links)
      const orphanedContactIds = contactIds.filter(id => !contactsWithRemainingLinks.has(id));

      // Delete orphaned contacts in bulk
      if (orphanedContactIds.length > 0) {
        await tx.contact.deleteMany({
          where: { id: { in: orphanedContactIds } },
        });
        this.logger.log(`Deleted ${orphanedContactIds.length} orphaned contacts`);
      }
    });

    this.logger.log(`Provider contacts cleanup completed for provider ${providerId}`);

    // Emit real-time events for bulk deletion
    this.realtimeEvents.emitContactSyncComplete(tenantId, {
      providerId,
      count: providerContacts.length,
    });

    // Emit updated counts
    void this.updateContactCounts(tenantId);
  }

  /**
   * Sync contacts from a provider
   * Delegates to provider-specific sync services
   * Uses Redis distributed locking to prevent concurrent syncs across instances
   * @param tenantId - Tenant ID for authorization (optional for backward compatibility)
   * @param providerId - Provider ID to sync contacts from
   */
  async syncContacts(providerId: string, tenantId?: string): Promise<number> {
    this.logger.log(`Syncing contacts for provider ${providerId}`);

    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider || !provider.supportsContacts) {
      throw new BadRequestException('Provider not found or does not support contacts');
    }

    // Tenant verification (defense in depth)
    if (tenantId && provider.tenantId !== tenantId) {
      throw new BadRequestException('Provider does not belong to this tenant');
    }

    // Acquire distributed lock to prevent concurrent syncs
    const lockAcquired = await this.acquireSyncLock(providerId);
    if (!lockAcquired) {
      this.logger.warn(`Sync already in progress for provider ${providerId}, skipping`);
      return 0;
    }

    try {
      let syncedCount = 0;

      if (provider.providerType === 'google') {
        syncedCount = await this.googleContactsSync.syncContacts(providerId);
      } else if (provider.providerType === 'microsoft') {
        syncedCount = await this.microsoftContactsSync.syncContacts(providerId);
      }

      this.logger.log(`Synced ${syncedCount} contacts for provider ${providerId}`);

      // Invalidate contact counts cache after sync
      await this.invalidateContactCountsCache(provider.tenantId);

      // Emit updated counts after sync
      void this.updateContactCounts(provider.tenantId);

      return syncedCount;
    } finally {
      // Always release lock
      await this.releaseSyncLock(providerId);
    }
  }

  /**
   * Helper: Find or create unified contact by email
   * Used by sync services to deduplicate contacts
   *
   * OPTIMIZED: Uses PostgreSQL JSONB search instead of loading all contacts (fixes N+1)
   */
  async findOrCreateUnifiedContact(
    tenantId: string,
    email: string,
    contactData: Partial<Contact>,
  ): Promise<Contact> {
    // Normalize email for case-insensitive search
    const normalizedEmail = email.toLowerCase();

    // Search for existing contact using PostgreSQL JSONB query (O(1) instead of O(n))
    // This searches within the emails JSON array for a matching value
    const existingContacts = await this.prisma.$queryRaw<Contact[]>`
      SELECT * FROM "Contact"
      WHERE tenant_id = ${tenantId}
      AND is_deleted = false
      AND emails IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(emails) AS email_obj
        WHERE LOWER(email_obj->>'value') = ${normalizedEmail}
      )
      LIMIT 1
    `;

    if (existingContacts.length > 0) {
      return existingContacts[0];
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
        emails: contactData.emails ? (contactData.emails as unknown as Prisma.InputJsonValue) : undefined,
        phoneNumbers: contactData.phoneNumbers ? (contactData.phoneNumbers as unknown as Prisma.InputJsonValue) : undefined,
        addresses: contactData.addresses ? (contactData.addresses as unknown as Prisma.InputJsonValue) : undefined,
        company: contactData.company,
        jobTitle: contactData.jobTitle,
        department: contactData.department,
        birthday: contactData.birthday,
        anniversary: contactData.anniversary,
        websites: contactData.websites ? (contactData.websites as unknown as Prisma.InputJsonValue) : undefined,
        socialProfiles: contactData.socialProfiles ? (contactData.socialProfiles as unknown as Prisma.InputJsonValue) : undefined,
        notes: contactData.notes,
        photoUrl: contactData.photoUrl,
        photoEtag: contactData.photoEtag,
        isDeleted: contactData.isDeleted ?? false,
        isStarred: contactData.isStarred ?? false,
        isFavorite: contactData.isFavorite ?? false,
        metadata: contactData.metadata ? (contactData.metadata as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  /**
   * Extract contacts from emails and create local contacts
   * Works for any provider type, including generic IMAP that don't have contacts API
   * @param tenantId - Tenant ID
   * @param providerId - Optional provider ID to filter emails
   * @param excludePublicDomains - Whether to exclude public domains like gmail.com
   */
  async extractContactsFromEmails(
    tenantId: string,
    providerId?: string,
    excludePublicDomains = true,
  ): Promise<{ created: number; skipped: number; total: number }> {
    this.logger.log(`Extracting contacts from emails for tenant ${tenantId}`);

    // Public domains to exclude
    const publicDomains = new Set([
      'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.it', 'hotmail.com',
      'hotmail.it', 'outlook.com', 'outlook.it', 'live.com', 'live.it',
      'icloud.com', 'me.com', 'mac.com', 'aol.com', 'msn.com',
      'libero.it', 'virgilio.it', 'alice.it', 'tin.it', 'tiscali.it',
      'fastwebnet.it', 'email.it', 'pec.it', 'aruba.it',
    ]);

    // Query all emails for this tenant
    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        ...(providerId && { providerId }),
      },
      select: {
        from: true,
        to: true,
        cc: true,
        bcc: true,
      },
    });

    // Extract unique email addresses with names
    const addressMap = new Map<string, { email: string; name?: string }>();

    // Helper to process address arrays
    const processAddressArray = (addresses: unknown) => {
      if (!addresses) return;
      const addrArray = Array.isArray(addresses) ? addresses : [];
      for (const addr of addrArray) {
        if (typeof addr === 'string') {
          const lower = addr.toLowerCase().trim();
          if (!addressMap.has(lower)) {
            addressMap.set(lower, { email: lower });
          }
        }
      }
    };

    for (const email of emails) {
      // From
      if (email.from) {
        const addr = email.from.toLowerCase().trim();
        if (!addressMap.has(addr)) {
          addressMap.set(addr, { email: addr });
        }
      }

      // To, CC, BCC (JSON arrays) - CON-2.3: Now processing BCC
      processAddressArray(email.to);
      processAddressArray(email.cc);
      processAddressArray(email.bcc);
    }

    // CON-2.4 FIX: Use database query to check existing emails instead of loading all contacts
    // Get candidate emails to check (filter by domain first to reduce query size)
    const candidateEmails = Array.from(addressMap.keys()).filter((emailAddr) => {
      const domain = emailAddr.split('@')[1];
      if (!domain) return false;
      if (excludePublicDomains && publicDomains.has(domain.toLowerCase())) return false;
      return true;
    });

    if (candidateEmails.length === 0) {
      this.logger.log('No candidate emails after filtering');
      return { created: 0, skipped: addressMap.size, total: addressMap.size };
    }

    // Check which emails already exist using PostgreSQL JSONB query (O(1) per batch, not O(n))
    const existingEmailsResult = await this.prisma.$queryRaw<{ email: string }[]>`
      SELECT DISTINCT LOWER(email_obj->>'value') as email
      FROM "Contact",
           jsonb_array_elements(emails) AS email_obj
      WHERE tenant_id = ${tenantId}
        AND is_deleted = false
        AND LOWER(email_obj->>'value') = ANY(${candidateEmails}::text[])
    `;
    const existingEmails = new Set(existingEmailsResult.map(r => r.email));

    // Prepare batch of contacts to create
    const contactsToCreate: Array<{
      tenantId: string;
      firstName?: string;
      lastName?: string;
      displayName: string;
      emails: Prisma.InputJsonValue;
      company?: string;
      metadata: Prisma.InputJsonValue;
    }> = [];

    let skipped = 0;

    for (const [emailAddr, info] of addressMap) {
      // Skip if already exists
      if (existingEmails.has(emailAddr)) {
        skipped++;
        continue;
      }

      // Extract domain
      const domain = emailAddr.split('@')[1];
      if (!domain) {
        skipped++;
        continue;
      }

      // Skip public domains if enabled
      if (excludePublicDomains && publicDomains.has(domain.toLowerCase())) {
        skipped++;
        continue;
      }

      // Parse name if available
      let firstName: string | undefined;
      let lastName: string | undefined;
      if (info.name) {
        const parts = info.name.trim().split(/\s+/);
        firstName = parts[0];
        lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
      }

      // Add to batch
      contactsToCreate.push({
        tenantId,
        firstName,
        lastName,
        displayName: info.name || emailAddr,
        emails: [{ value: emailAddr, type: 'work', primary: true }] as unknown as Prisma.InputJsonValue,
        company: domain.split('.')[0],
        metadata: { source: 'email_extraction', extractedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      });

      // Prevent duplicates within this run
      existingEmails.add(emailAddr);
    }

    // CON-1.3 FIX: Create all contacts in a single transaction
    let created = 0;
    if (contactsToCreate.length > 0) {
      try {
        const result = await this.prisma.contact.createMany({
          data: contactsToCreate,
          skipDuplicates: true,
        });
        created = result.count;
      } catch (error: any) {
        this.logger.error(`Failed to batch create contacts: ${error.message}`);
        // Rollback is automatic with createMany
        skipped += contactsToCreate.length;
      }
    }

    this.logger.log(`Contact extraction complete: ${created} created, ${skipped} skipped, ${addressMap.size} total`);

    // Emit updated counts
    void this.updateContactCounts(tenantId);

    return { created, skipped, total: addressMap.size };
  }

  /**
   * Create a local-only contact (no provider sync)
   * Useful for generic IMAP providers that don't support contacts API
   */
  async createLocalContact(
    tenantId: string,
    data: Omit<CreateContactDto, 'providerId'>,
  ): Promise<Contact> {
    this.logger.log(`Creating local contact for tenant ${tenantId}`);

    const contact = await this.prisma.contact.create({
      data: {
        tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || undefined,
        emails: data.emails ? (data.emails as unknown as Prisma.InputJsonValue) : undefined,
        phoneNumbers: data.phoneNumbers ? (data.phoneNumbers as unknown as Prisma.InputJsonValue) : undefined,
        company: data.company,
        jobTitle: data.jobTitle,
        notes: data.notes,
        metadata: { source: 'local', createdAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Local contact created: ${contact.id}`);

    // Emit updated counts
    void this.updateContactCounts(tenantId);

    return contact;
  }

  /**
   * Import contacts from vCard (.vcf) file content
   * Supports vCard 3.0 and 4.0 formats (Outlook, Apple, Google exports)
   * @param tenantId - Tenant ID
   * @param vcfContent - Raw vCard file content (can contain multiple contacts)
   */
  async importFromVCard(
    tenantId: string,
    vcfContent: string,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    this.logger.log(`Importing contacts from vCard for tenant ${tenantId}`);

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    try {
      // Parse vCard content - can contain multiple vCards
      const parsed = vCard.parse(vcfContent);

      // vCard.parse returns a single vCard or array, normalize to array
      const cards = Array.isArray(parsed) ? parsed : [parsed];

      // Get existing emails for deduplication
      const existingContacts = await this.prisma.contact.findMany({
        where: { tenantId, isDeleted: false },
        select: { emails: true },
      });

      const existingEmails = new Set<string>();
      for (const contact of existingContacts) {
        if (contact.emails && Array.isArray(contact.emails)) {
          for (const emailObj of contact.emails as unknown as EmailAddress[]) {
            if (emailObj?.value) {
              existingEmails.add(emailObj.value.toLowerCase());
            }
          }
        }
      }

      // Process each vCard
      for (const card of cards) {
        try {
          // Extract name
          const fnProp = card.get('fn');
          const nProp = card.get('n');

          let firstName: string | undefined;
          let lastName: string | undefined;
          let displayName: string | undefined;

          // FN (Full Name)
          if (fnProp) {
            const fnValue = Array.isArray(fnProp) ? fnProp[0] : fnProp;
            const fnResolved = fnValue?.valueOf?.() ?? fnValue?.value ?? fnValue;
            displayName = typeof fnResolved === 'string' ? fnResolved : '';
          }

          // N (Structured Name: family;given;middle;prefix;suffix)
          if (nProp) {
            const nValue = Array.isArray(nProp) ? nProp[0] : nProp;
            const nameStr = nValue?.valueOf?.() || nValue?.value || '';
            if (typeof nameStr === 'string') {
              const parts = nameStr.split(';');
              lastName = parts[0]?.trim() || undefined;
              firstName = parts[1]?.trim() || undefined;
            }
          }

          // Parse first/last from display name if not in N field
          if (displayName && !firstName && !lastName) {
            const nameParts = displayName.trim().split(/\s+/);
            firstName = nameParts[0];
            lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
          }

          // Extract emails
          const emailProp = card.get('email');
          const emails: Array<{ value: string; type?: string; primary?: boolean }> = [];

          if (emailProp) {
            const emailArray = Array.isArray(emailProp) ? emailProp : [emailProp];
            let hasPrimary = false;

            for (const email of emailArray) {
              const emailResolved = email?.valueOf?.() ?? email?.value ?? email;
              const emailValue = typeof emailResolved === 'string' ? emailResolved : '';
              if (emailValue && typeof emailValue === 'string') {
                // Get type from parameters
                const typeParam = email?.type || email?.params?.type;
                const type = Array.isArray(typeParam) ? typeParam[0] : typeParam;
                const isPref = email?.params?.pref === '1' || type?.toLowerCase()?.includes('pref');

                emails.push({
                  value: emailValue.toLowerCase().trim(),
                  type: type?.toString()?.toLowerCase()?.replace('pref,', '') || 'other',
                  primary: isPref && !hasPrimary,
                });
                if (isPref) hasPrimary = true;
              }
            }

            // Mark first as primary if none specified
            if (emails.length > 0 && !hasPrimary) {
              emails[0].primary = true;
            }
          }

          // Skip if no email
          if (emails.length === 0) {
            this.logger.debug(`Skipping vCard without email: ${displayName || 'Unknown'}`);
            skipped++;
            continue;
          }

          // Check for duplicates
          const isDuplicate = emails.some(e => existingEmails.has(e.value));
          if (isDuplicate) {
            this.logger.debug(`Skipping duplicate contact: ${emails[0].value}`);
            skipped++;
            continue;
          }

          // Extract phone numbers
          const telProp = card.get('tel');
          const phoneNumbers: Array<{ value: string; type?: string; primary?: boolean }> = [];

          if (telProp) {
            const telArray = Array.isArray(telProp) ? telProp : [telProp];
            for (const tel of telArray) {
              const telResolved = tel?.valueOf?.() ?? tel?.value ?? tel;
              const telValue = typeof telResolved === 'string' ? telResolved : '';
              if (telValue && typeof telValue === 'string') {
                const typeParam = tel?.type || tel?.params?.type;
                const type = Array.isArray(typeParam) ? typeParam[0] : typeParam;
                phoneNumbers.push({
                  value: telValue.replace(/\s+/g, ''),
                  type: type?.toString()?.toLowerCase() || 'other',
                  primary: phoneNumbers.length === 0,
                });
              }
            }
          }

          // Extract organization
          const orgProp = card.get('org');
          let company: string | undefined;
          if (orgProp) {
            const orgValue = Array.isArray(orgProp) ? orgProp[0] : orgProp;
            const orgResolved = orgValue?.valueOf?.() ?? orgValue?.value ?? orgValue;
            const orgStr = typeof orgResolved === 'string' ? orgResolved : '';
            if (orgStr) {
              company = orgStr.split(';')[0]?.trim() || undefined;
            }
          }

          // Extract job title
          const titleProp = card.get('title');
          let jobTitle: string | undefined;
          if (titleProp) {
            const titleValue = Array.isArray(titleProp) ? titleProp[0] : titleProp;
            const titleResolved = titleValue?.valueOf?.() ?? titleValue?.value ?? titleValue;
            jobTitle = typeof titleResolved === 'string' ? titleResolved : undefined;
          }

          // Extract notes
          const noteProp = card.get('note');
          let notes: string | undefined;
          if (noteProp) {
            const noteValue = Array.isArray(noteProp) ? noteProp[0] : noteProp;
            const noteResolved = noteValue?.valueOf?.() ?? noteValue?.value ?? noteValue;
            notes = typeof noteResolved === 'string' ? noteResolved : undefined;
          }

          // Extract birthday
          const bdayProp = card.get('bday');
          let birthday: Date | undefined;
          if (bdayProp) {
            const bdayValue = Array.isArray(bdayProp) ? bdayProp[0] : bdayProp;
            const bdayResolved = bdayValue?.valueOf?.() ?? bdayValue?.value ?? bdayValue;
            const bdayStr = typeof bdayResolved === 'string' ? bdayResolved : '';
            if (bdayStr) {
              try {
                birthday = new Date(bdayStr);
                if (isNaN(birthday.getTime())) birthday = undefined;
              } catch {
                birthday = undefined;
              }
            }
          }

          // Create contact
          await this.prisma.contact.create({
            data: {
              tenantId,
              firstName,
              lastName,
              displayName: displayName || `${firstName || ''} ${lastName || ''}`.trim() || emails[0].value,
              emails: emails as unknown as Prisma.InputJsonValue,
              phoneNumbers: phoneNumbers.length > 0 ? (phoneNumbers as unknown as Prisma.InputJsonValue) : undefined,
              company,
              jobTitle,
              notes,
              birthday,
              metadata: { source: 'vcard_import', importedAt: new Date().toISOString() } as Prisma.InputJsonValue,
            },
          });

          // Add to existing set to prevent duplicates within this import
          for (const email of emails) {
            existingEmails.add(email.value);
          }

          imported++;
          this.logger.debug(`Imported contact: ${displayName || emails[0].value}`);
        } catch (cardError: any) {
          const errMsg = `Failed to import contact: ${cardError.message}`;
          this.logger.warn(errMsg);
          errors.push(errMsg);
          skipped++;
        }
      }
    } catch (parseError: any) {
      const errMsg = `Failed to parse vCard file: ${parseError.message}`;
      this.logger.error(errMsg);
      errors.push(errMsg);
    }

    this.logger.log(`vCard import complete: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);

    // Emit updated counts
    void this.updateContactCounts(tenantId);

    return { imported, skipped, errors };
  }
}
