/**
 * Contacts Service
 *
 * Core contact management service handling:
 * - CRUD operations (list, get, create, update, delete)
 * - Contact counts with caching
 * - Bidirectional sync with providers (Google, Microsoft)
 * - Provider contact cleanup
 *
 * Refactored to use extracted services:
 * - ContactsCacheService: Redis caching and distributed locking
 * - ContactsImportService: vCard and email extraction
 *
 * @see contacts-cache.service.ts
 * @see contacts-import.service.ts
 */

import { Injectable, Logger, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { Contact, Prisma } from '@prisma/client';
import { GoogleContactsSyncService } from './google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './microsoft-contacts-sync.service';
import { ContactsCacheService } from './contacts-cache.service';
import { ContactsImportService } from './contacts-import.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { ContactEmbeddingQueueService } from '../../ai/services/contact-embedding.queue';
// TODO Phase 24: Rebuild AttentionScoreService with new AiChatService
// import { AttentionScoreService } from '../../ai/voltagent/services/attention-score.service';
type AttentionScoreService = any;
import { CONTACTS_DEFAULTS } from '../contacts.constants';
import type {
  ContactWithProviders,
  ListContactsFilters,
  ContactCounts,
  VCardImportResult,
  EmailExtractionResult,
} from '../contacts.types';
import type { CreateContactDto, UpdateContactDto } from '../dto/contact.dto';

// Re-export types for backward compatibility
export type {
  EmailAddress,
  PhoneNumber,
  Address,
  SocialProfile,
  ContactMetadata,
  ContactWithProviders,
  ListContactsFilters,
} from '../contacts.types';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);
  private readonly maxContactsLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleContactsSync: GoogleContactsSyncService,
    private readonly microsoftContactsSync: MicrosoftContactsSyncService,
    private readonly cacheService: ContactsCacheService,
    private readonly importService: ContactsImportService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly configService: ConfigService,
    private readonly contactEmbeddingQueue: ContactEmbeddingQueueService,
    // TODO Phase 24: Rebuild AttentionScoreService with new AiChatService
    @Optional() @Inject('AttentionScoreService') private readonly attentionScoreService?: AttentionScoreService,
  ) {
    this.maxContactsLimit = this.configService.get<number>(
      'CONTACTS_LIST_MAX_LIMIT',
      CONTACTS_DEFAULTS.MAX_CONTACTS_LIMIT,
    );
  }

  // =============================================================================
  // CRUD Operations
  // =============================================================================

  /**
   * List unified contacts for a tenant
   * Returns merged contacts with data from all providers
   */
  async listContacts(
    tenantId: string,
    filters: ListContactsFilters = {},
  ): Promise<{ contacts: ContactWithProviders[]; total: number }> {
    // Allow larger batches for faster bulk loading (max from config)
    const limit =
      filters.limit && filters.limit > 0 && filters.limit <= this.maxContactsLimit
        ? filters.limit
        : CONTACTS_DEFAULTS.DEFAULT_PAGE_SIZE;
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
   * Get contact counts for sidebar display
   * Efficiently queries counts from database with Redis caching
   */
  async getContactCounts(tenantId: string): Promise<ContactCounts> {
    // Try to get from cache first
    const cached = await this.cacheService.getCachedContactCounts(tenantId);
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
    await this.cacheService.cacheContactCounts(tenantId, {
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

  // =============================================================================
  // Bidirectional Sync Operations (Create/Update/Delete)
  // =============================================================================

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
        phoneNumbers: data.phoneNumbers
          ? (data.phoneNumbers as unknown as Prisma.InputJsonValue)
          : undefined,
        company: data.company,
        jobTitle: data.jobTitle,
        notes: data.notes,
        isVip: data.isVip ?? false,
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
        phoneNumbers: data.phoneNumbers
          ? (data.phoneNumbers as unknown as Prisma.InputJsonValue)
          : undefined,
        company: data.company,
        jobTitle: data.jobTitle,
        notes: data.notes,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`Contact created: ${contact.id}`);

    // Emit updated counts
    void this.updateContactCounts(tenantId);

    // Queue contact embedding for RAG search
    void this.contactEmbeddingQueue.enqueue({
      tenantId,
      contactId: contact.id,
      displayName: contact.displayName,
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      jobTitle: contact.jobTitle,
      notes: contact.notes,
      tags: contact.tags,
      emails: data.emails as { value: string; type?: string }[] | undefined,
      phoneNumbers: data.phoneNumbers as { value: string; type?: string }[] | undefined,
    });

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
          this.logger.warn(
            `Failed to sync update to provider ${providerContact.providerId}: ${error.message}`,
          );
          // Continue with local update even if provider sync fails
        }
      }
    }

    // Update unified contact locally
    const updated = await this.prisma.contact.update({
      where: { id_tenantId: { id: contactId, tenantId } },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: data.displayName,
        company: data.company,
        jobTitle: data.jobTitle,
        notes: data.notes,
        tags: data.tags,
        emails: data.emails ? (data.emails as unknown as Prisma.InputJsonValue) : undefined,
        phoneNumbers: data.phoneNumbers
          ? (data.phoneNumbers as unknown as Prisma.InputJsonValue)
          : undefined,
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

    // Queue contact embedding update for RAG search
    void this.contactEmbeddingQueue.enqueue({
      tenantId,
      contactId: updated.id,
      displayName: updated.displayName,
      firstName: updated.firstName,
      lastName: updated.lastName,
      company: updated.company,
      jobTitle: updated.jobTitle,
      notes: updated.notes,
      tags: updated.tags,
      emails: updated.emails as { value: string; type?: string }[] | null,
      phoneNumbers: updated.phoneNumbers as { value: string; type?: string }[] | null,
    });

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
              await this.googleContactsSync.deleteContact(provider.id, providerContact.externalId);
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
          this.logger.warn(
            `Failed to delete from provider ${providerContact.providerId}: ${error.message}`,
          );
          // Continue with local delete even if provider delete fails
        }
      }
    }

    // Soft delete unified contact and update provider contacts atomically
    await this.prisma.$transaction([
      this.prisma.contact.update({
        where: { id_tenantId: { id: contactId, tenantId } },
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

  // =============================================================================
  // VIP Operations
  // =============================================================================

  /**
   * Toggle VIP status for a contact
   */
  async toggleVip(tenantId: string, contactId: string): Promise<ContactWithProviders> {
    this.logger.log(`Toggling VIP status for contact ${contactId}`);

    // Get existing contact
    const contact = await this.getContact(tenantId, contactId);

    // Toggle VIP status
    const updated = await this.prisma.contact.update({
      where: { id_tenantId: { id: contactId, tenantId } },
      data: { isVip: !contact.isVip },
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

    // Invalidate VIP cache so AttentionScoreService picks up the change immediately
    if (this.attentionScoreService) {
      this.attentionScoreService.clearVipCache(tenantId);
      this.logger.debug(`Cleared VIP cache for tenant ${tenantId} after VIP toggle`);
    }

    this.logger.log(`Contact ${contactId} VIP status set to ${updated.isVip}`);
    return updated;
  }

  /**
   * List all VIP contacts for a tenant
   */
  async listVipContacts(tenantId: string): Promise<{ contacts: ContactWithProviders[]; total: number }> {
    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where: {
          tenantId,
          isVip: true,
          isDeleted: false,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
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
      this.prisma.contact.count({
        where: { tenantId, isVip: true, isDeleted: false },
      }),
    ]);

    return { contacts, total };
  }

  // =============================================================================
  // Provider Operations
  // =============================================================================

  /**
   * Get contact photo from provider
   * Fetches photo from the appropriate provider (Google/Microsoft) based on provider contact
   * Returns the photo URL (Google) or base64 data URL (Microsoft)
   *
   * @param tenantId - Tenant ID for authorization
   * @param contactId - Unified contact ID
   * @returns Photo URL or base64 data URL, null if no photo
   */
  async getContactPhoto(tenantId: string, contactId: string): Promise<string | null> {
    // Get contact with provider links
    const contact = await this.getContact(tenantId, contactId);

    // First check if unified contact has a photoUrl (from sync)
    if (contact.photoUrl) {
      return contact.photoUrl;
    }

    // Try to fetch photo from provider contacts
    if (contact.providerContacts && contact.providerContacts.length > 0) {
      for (const providerContact of contact.providerContacts) {
        try {
          const provider = await this.prisma.providerConfig.findUnique({
            where: { id: providerContact.providerId },
          });

          if (provider?.isActive) {
            let photoUrl: string | null = null;

            if (provider.providerType === 'google') {
              photoUrl = await this.googleContactsSync.getContactPhoto(
                provider.id,
                providerContact.externalId,
              );
            } else if (provider.providerType === 'microsoft') {
              photoUrl = await this.microsoftContactsSync.getContactPhoto(
                provider.id,
                providerContact.externalId,
              );
            }

            // Return first successful photo
            if (photoUrl) {
              // Optionally cache the photo URL in unified contact for future requests
              void this.prisma.contact.update({
                where: { id_tenantId: { id: contactId, tenantId } },
                data: { photoUrl },
              }).catch((err) => {
                this.logger.warn(`Failed to cache contact photo URL: ${err.message}`);
              });

              return photoUrl;
            }
          }
        } catch (error: any) {
          this.logger.warn(`Failed to fetch photo from provider: ${error.message}`);
          // Continue trying other providers
        }
      }
    }

    return null;
  }

  /**
   * Batch lookup contacts by email addresses
   * Returns a map of email address -> { contactId, photoUrl, displayName }
   * Used for populating sender photos in email list
   *
   * @param tenantId - Tenant ID for authorization
   * @param emails - Array of email addresses to look up
   * @returns Map of email -> contact info (photo, name)
   */
  async findContactsByEmails(
    tenantId: string,
    emails: string[],
  ): Promise<Record<string, { contactId: string; photoUrl: string | null; displayName: string | null }>> {
    if (!emails.length) {
      return {};
    }

    // Normalize emails and deduplicate
    const normalizedEmails = [...new Set(emails.map((e) => e.toLowerCase()))];

    // Batch query using PostgreSQL JSONB - efficient O(n) for n contacts
    const contacts = await this.prisma.$queryRaw<
      Array<{
        id: string;
        displayName: string | null;
        photoUrl: string | null;
        emails: Array<{ value: string }>;
      }>
    >`
      SELECT id, "displayName", "photoUrl", emails
      FROM "unified_contacts"
      WHERE "tenantId" = ${tenantId}
      AND "isDeleted" = false
      AND emails IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(emails) AS email_obj
        WHERE LOWER(email_obj->>'value') = ANY(${normalizedEmails}::text[])
      )
    `;

    // Build email -> contact info map
    const result: Record<string, { contactId: string; photoUrl: string | null; displayName: string | null }> = {};

    for (const contact of contacts) {
      if (contact.emails) {
        for (const emailObj of contact.emails) {
          const normalizedEmail = emailObj.value.toLowerCase();
          if (normalizedEmails.includes(normalizedEmail)) {
            result[normalizedEmail] = {
              contactId: contact.id,
              photoUrl: contact.photoUrl,
              displayName: contact.displayName,
            };
          }
        }
      }
    }

    return result;
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

    const contactIds = [...new Set(providerContacts.map((pc) => pc.contactId))];

    // Execute deletion and orphan cleanup in a single transaction (fixes race condition)
    await this.prisma.$transaction(async (tx) => {
      // Delete provider contact links
      await tx.providerContact.deleteMany({
        where: { providerId },
      });

      this.logger.log(
        `Deleted ${providerContacts.length} provider contact links for provider ${providerId}`,
      );

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
      const contactsWithRemainingLinks = new Set(contactsWithLinks.map((c) => c.contactId));

      // Find orphaned contacts (no remaining links)
      const orphanedContactIds = contactIds.filter((id) => !contactsWithRemainingLinks.has(id));

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
    const lockAcquired = await this.cacheService.acquireSyncLock(providerId);
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
      await this.cacheService.invalidateContactCountsCache(provider.tenantId);

      // Emit updated counts after sync
      void this.updateContactCounts(provider.tenantId);

      return syncedCount;
    } finally {
      // Always release lock
      await this.cacheService.releaseSyncLock(providerId);
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
      SELECT * FROM "unified_contacts"
      WHERE "tenantId" = ${tenantId}
      AND "isDeleted" = false
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
        emails: contactData.emails
          ? (contactData.emails as unknown as Prisma.InputJsonValue)
          : undefined,
        phoneNumbers: contactData.phoneNumbers
          ? (contactData.phoneNumbers as unknown as Prisma.InputJsonValue)
          : undefined,
        addresses: contactData.addresses
          ? (contactData.addresses as unknown as Prisma.InputJsonValue)
          : undefined,
        company: contactData.company,
        jobTitle: contactData.jobTitle,
        department: contactData.department,
        birthday: contactData.birthday,
        anniversary: contactData.anniversary,
        websites: contactData.websites
          ? (contactData.websites as unknown as Prisma.InputJsonValue)
          : undefined,
        socialProfiles: contactData.socialProfiles
          ? (contactData.socialProfiles as unknown as Prisma.InputJsonValue)
          : undefined,
        notes: contactData.notes,
        photoUrl: contactData.photoUrl,
        photoEtag: contactData.photoEtag,
        isDeleted: contactData.isDeleted ?? false,
        isStarred: contactData.isStarred ?? false,
        isFavorite: contactData.isFavorite ?? false,
        metadata: contactData.metadata
          ? (contactData.metadata as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  // =============================================================================
  // Delegated Import Operations
  // =============================================================================

  /**
   * Create a local-only contact (no provider sync)
   * Delegates to ContactsImportService
   */
  async createLocalContact(
    tenantId: string,
    data: Omit<CreateContactDto, 'providerId'>,
  ): Promise<Contact> {
    const contact = await this.importService.createLocalContact(tenantId, data);
    void this.updateContactCounts(tenantId);
    return contact;
  }

  /**
   * Extract contacts from emails
   * Delegates to ContactsImportService
   */
  async extractContactsFromEmails(
    tenantId: string,
    providerId?: string,
    excludePublicDomains = true,
  ): Promise<EmailExtractionResult> {
    const result = await this.importService.extractContactsFromEmails(
      tenantId,
      providerId,
      excludePublicDomains,
    );
    void this.updateContactCounts(tenantId);
    return result;
  }

  /**
   * Import contacts from vCard file
   * Delegates to ContactsImportService
   */
  async importFromVCard(tenantId: string, vcfContent: string): Promise<VCardImportResult> {
    const result = await this.importService.importFromVCard(tenantId, vcfContent);
    void this.updateContactCounts(tenantId);
    return result;
  }
}
