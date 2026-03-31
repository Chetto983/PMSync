import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { Contact, ProviderConfig } from '@prisma/client';
import { getErrorMessage } from '../../../common/utils';
import { ContactsError, ContactsErrorCode } from '../errors/contacts-error';

export type ContactRealtimeReason =
  | 'contact-created'
  | 'contact-updated'
  | 'contact-deleted'
  | 'sync-complete';

export interface ContactsSyncResult {
  success: boolean;
  providerId: string;
  contactsProcessed: number;
  newContacts: number;
  updatedContacts: number;
  deletedContacts: number;
  syncDuration: number;
}

/**
 * Provider-agnostic contact data structure
 * Note: Fields use `| null` to accommodate provider APIs that return null
 */
export interface ExtractedContactData {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  middleName?: string | null;
  nickname?: string | null;
  prefix?: string | null;
  suffix?: string | null;
  emails?: Array<{ value: string; type: string; primary: boolean }>;
  phoneNumbers?: Array<{ value: string; type: string; primary: boolean }> | null;
  addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    type: string;
  }> | null;
  company?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  birthday?: Date | null;
  photoUrl?: string | null;
  notes?: string | null;
  primaryEmail?: string | null;
  etag?: string | null;
}

/**
 * Base abstract class for contacts sync services
 *
 * Provides shared logic for:
 * - Bulk sync flow (fetch all → batch process → notify)
 * - Batch processing with transactions
 * - Email-based unified contact lookup
 * - Real-time notifications
 *
 * Provider-specific implementations must provide:
 * - fetchAllContacts() - Fetch all contacts from provider API
 * - extractContactData() - Convert provider format to ExtractedContactData
 * - createProviderContact() - Create contact via provider API
 * - updateProviderContact() - Update contact via provider API
 * - deleteProviderContact() - Delete contact via provider API
 */
export abstract class BaseContactsSyncService {
  protected readonly logger: Logger;
  protected readonly contactsEnabled: boolean;
  protected abstract readonly providerName: string;
  /** Provider type for rate limiting (must match 'google' | 'microsoft') */
  protected abstract readonly providerType: 'google' | 'microsoft';

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly providerTokenService: ProviderTokenService,
    protected readonly realtimeEvents: RealtimeEventsService,
    protected readonly configService: ConfigService,
    protected readonly redisLock: RedisLockService,
  ) {
    this.logger = new Logger(this.constructor.name);
    this.contactsEnabled =
      (this.configService.get<string>('CONTACTS_SYNC_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.contactsEnabled) {
      this.logger.warn(`${this.constructor.name} disabled via CONTACTS_SYNC_ENABLED=false`);
    }
  }

  /**
   * Abstract method: Fetch all contacts from provider API
   * Must handle pagination internally
   */
  protected abstract fetchAllContacts(accessToken: string): Promise<any[]>;

  /**
   * Abstract method: Extract contact ID from provider-specific format
   */
  protected abstract getExternalId(rawContact: any): string;

  /**
   * Abstract method: Convert provider-specific format to ExtractedContactData
   */
  protected abstract extractContactData(rawContact: any): ExtractedContactData;

  /**
   * Abstract method: Create contact via provider API
   */
  abstract createContact(providerId: string, data: any): Promise<{ id: string }>;

  /**
   * Abstract method: Update contact via provider API
   */
  abstract updateContact(providerId: string, externalId: string, data: any): Promise<void>;

  /**
   * Abstract method: Delete contact via provider API
   */
  abstract deleteContact(providerId: string, externalId: string): Promise<void>;

  /**
   * Sync contacts from provider API (BULK OPTIMIZED)
   * Reduces database queries from O(n) to O(1) by batching operations
   */
  async syncContacts(providerId: string): Promise<number> {
    if (!this.contactsEnabled) {
      this.logger.warn(`Skipping ${this.providerName} contacts sync for ${providerId} (CONTACTS_SYNC_ENABLED=false)`);
      return 0;
    }

    const startTime = Date.now();
    this.logger.log(`Starting ${this.providerName} Contacts sync (bulk) for provider ${providerId}`);

    try {
      // RATE LIMIT CHECK: Prevent API throttling
      const isAllowed = await this.redisLock.checkProviderRateLimit(providerId, this.providerType);
      if (!isAllowed) {
        const status = await this.redisLock.getRateLimitStatus(providerId, this.providerType);
        this.logger.warn(
          `Rate limited for provider ${providerId} (${this.providerType}). Retry in ${status.remainingSeconds}s`,
        );
        throw new ContactsError(
          `Rate limit exceeded - retry in ${status.remainingSeconds} seconds`,
          ContactsErrorCode.API_RATE_LIMITED,
          { provider: this.providerType, retryable: true },
        );
      }

      // Get provider and access token (handles refresh automatically)
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

      if (!provider.supportsContacts) {
        throw new ContactsError(
          'Provider does not support contacts',
          ContactsErrorCode.PROVIDER_NOT_SUPPORTED,
          { provider: provider.providerType as any, retryable: false }
        );
      }

      // STEP 1: Fetch ALL contacts from provider API (collect all pages)
      this.logger.log(`[Bulk Sync] Step 1/4: Fetching all contacts from ${this.providerName} API...`);
      const allContacts = await this.fetchAllContacts(accessToken);

      this.logger.log(`[Bulk Sync] Fetched ${allContacts.length} contacts from ${this.providerName}`);

      if (allContacts.length === 0) {
        return 0;
      }

      // STEP 2: Fetch ALL existing provider contacts in ONE query
      this.logger.log(`[Bulk Sync] Step 2/4: Fetching existing provider contacts...`);
      const existingProviderContacts = await this.prisma.providerContact.findMany({
        where: { providerId: provider.id },
        select: { externalId: true, contactId: true },
      });
      const existingByExternalId = new Map(
        existingProviderContacts.map((pc) => [pc.externalId, pc.contactId]),
      );
      this.logger.log(`[Bulk Sync] Found ${existingProviderContacts.length} existing provider contacts`);

      // STEP 3: Process contacts in bulk batches
      this.logger.log(`[Bulk Sync] Step 3/4: Processing contacts in bulk...`);
      const BATCH_SIZE = 500;
      let newContacts = 0;
      let updatedContacts = 0;
      const createdContactIds: string[] = [];
      const updatedContactIds: string[] = [];

      for (let i = 0; i < allContacts.length; i += BATCH_SIZE) {
        const batch = allContacts.slice(i, i + BATCH_SIZE);
        const result = await this.processBatch(provider, batch, existingByExternalId);

        newContacts += result.newCount;
        updatedContacts += result.updatedCount;
        createdContactIds.push(...result.createdIds);
        updatedContactIds.push(...result.updatedIds);

        if (i + BATCH_SIZE < allContacts.length) {
          this.logger.debug(`[Bulk Sync] Processed ${i + batch.length}/${allContacts.length} contacts...`);
        }
      }

      // STEP 4: Send bulk notifications
      this.logger.log(`[Bulk Sync] Step 4/4: Sending notifications...`);
      this.notifyContactsBulk(provider.tenantId, provider.id, {
        created: createdContactIds,
        updated: updatedContactIds,
      });

      const syncDuration = Date.now() - startTime;
      this.logger.log(
        `✅ ${this.providerName} Contacts sync completed for provider ${providerId}: ${allContacts.length} contacts processed (${newContacts} new, ${updatedContacts} updated) in ${syncDuration}ms`,
      );

      return allContacts.length;
    } catch (error: any) {
      this.logger.error(`${this.providerName} Contacts sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a batch of contacts efficiently using transactions
   */
  protected async processBatch(
    provider: ProviderConfig,
    batch: any[],
    existingByExternalId: Map<string, string>,
  ): Promise<{ newCount: number; updatedCount: number; createdIds: string[]; updatedIds: string[] }> {
    const newContacts: any[] = [];
    const newProviderContacts: any[] = [];
    const updateProviderContacts: any[] = [];

    // Pre-extract all emails for batch lookup
    const emailsToLookup: string[] = [];
    const contactDataMap = new Map<string, ExtractedContactData>();

    for (const rawContact of batch) {
      const externalId = this.getExternalId(rawContact);
      const contactData = this.extractContactData(rawContact);
      contactDataMap.set(externalId, contactData);

      // Only need email lookup for new contacts
      if (!existingByExternalId.has(externalId) && contactData.primaryEmail) {
        emailsToLookup.push(contactData.primaryEmail.toLowerCase());
      }
    }

    // Batch lookup existing unified contacts by email (ONE query)
    const existingUnifiedByEmail = await this.batchFindUnifiedContactsByEmail(
      provider.tenantId,
      emailsToLookup,
    );

    // Now process each contact
    for (const rawContact of batch) {
      const externalId = this.getExternalId(rawContact);
      const contactData = contactDataMap.get(externalId)!;
      const existingContactId = existingByExternalId.get(externalId);

      if (existingContactId) {
        // UPDATE existing contact
        updateProviderContacts.push({
          externalId,
          contactId: existingContactId,
          data: contactData,
          rawContact,
        });
      } else {
        // NEW contact - check if unified contact exists by email
        const existingUnified = contactData.primaryEmail
          ? existingUnifiedByEmail.get(contactData.primaryEmail.toLowerCase())
          : null;

        if (existingUnified) {
          // Link to existing unified contact
          newProviderContacts.push({
            externalId,
            contactId: existingUnified.id,
            data: contactData,
            rawContact,
          });
        } else {
          // Need to create new unified contact
          newContacts.push({
            externalId,
            data: contactData,
            rawContact,
          });
        }
      }
    }

    // Execute bulk operations in transaction
    const createdIds: string[] = [];
    const updatedIds: string[] = [];

    await this.prisma.$transaction(
      async (tx) => {
        // 1. Create new unified contacts using createManyAndReturn (Prisma 5.14+)
        if (newContacts.length > 0) {
          const unifiedToCreate = newContacts.map((c) => ({
            tenantId: provider.tenantId,
            firstName: c.data.firstName,
            lastName: c.data.lastName,
            displayName: c.data.displayName,
            middleName: c.data.middleName,
            nickname: c.data.nickname,
            prefix: c.data.prefix,
            suffix: c.data.suffix,
            emails: c.data.emails,
            phoneNumbers: c.data.phoneNumbers,
            addresses: c.data.addresses,
            company: c.data.company,
            jobTitle: c.data.jobTitle,
            department: c.data.department,
            birthday: c.data.birthday,
            photoUrl: c.data.photoUrl,
            notes: c.data.notes,
          }));

          // Use createManyAndReturn for bulk insert with returned IDs
          const createdUnified = await tx.contact.createManyAndReturn({
            data: unifiedToCreate,
            select: { id: true },
          });

          // Map external IDs to created contact IDs
          for (let j = 0; j < newContacts.length; j++) {
            const unifiedId = createdUnified[j].id;
            createdIds.push(unifiedId);
            newProviderContacts.push({
              externalId: newContacts[j].externalId,
              contactId: unifiedId,
              data: newContacts[j].data,
              rawContact: newContacts[j].rawContact,
            });
          }
        }

        // 2. Create new provider contacts (batch insert)
        if (newProviderContacts.length > 0) {
          await tx.providerContact.createMany({
            data: newProviderContacts.map((pc) => ({
              contactId: pc.contactId,
              tenantId: provider.tenantId,
              providerId: provider.id,
              externalId: pc.externalId,
              rawData: pc.rawContact,
              firstName: pc.data.firstName,
              lastName: pc.data.lastName,
              displayName: pc.data.displayName,
              middleName: pc.data.middleName,
              nickname: pc.data.nickname,
              prefix: pc.data.prefix,
              suffix: pc.data.suffix,
              emails: pc.data.emails,
              phoneNumbers: pc.data.phoneNumbers,
              addresses: pc.data.addresses,
              company: pc.data.company,
              jobTitle: pc.data.jobTitle,
              department: pc.data.department,
              birthday: pc.data.birthday,
              photoUrl: pc.data.photoUrl,
              notes: pc.data.notes,
              eTag: pc.data.etag ?? null,
              metadata: pc.rawContact,
              lastSyncedAt: new Date(),
            })),
            skipDuplicates: true,
          });
        }

        // 3. Bulk update existing provider contacts using raw SQL
        // CITUS: tenantId MUST be in WHERE clause for shard routing
        if (updateProviderContacts.length > 0) {
          const now = new Date();
          const externalIds = updateProviderContacts.map((pc) => pc.externalId);

          await tx.$executeRaw`
            UPDATE "provider_contacts"
            SET "lastSyncedAt" = ${now},
                "syncVersion" = "syncVersion" + 1
            WHERE "tenantId" = ${provider.tenantId}
              AND "providerId" = ${provider.id}
              AND "externalId" = ANY(${externalIds}::text[])
          `;

          updatedIds.push(...updateProviderContacts.map((pc) => pc.contactId));
        }
      },
      {
        timeout: 60000, // 60 second timeout for large batches
      },
    );

    return {
      newCount: createdIds.length,
      updatedCount: updatedIds.length,
      createdIds,
      updatedIds,
    };
  }

  /**
   * Batch find unified contacts by email addresses (ONE query)
   */
  protected async batchFindUnifiedContactsByEmail(
    tenantId: string,
    emails: string[],
  ): Promise<Map<string, Contact>> {
    if (emails.length === 0) return new Map();

    const uniqueEmails = [...new Set(emails)];

    try {
      // Use raw query for efficient batch email lookup
      const contacts = await this.prisma.$queryRaw<Contact[]>`
        SELECT * FROM "unified_contacts"
        WHERE "tenantId" = ${tenantId}
          AND "isDeleted" = false
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("emails") AS e
            WHERE LOWER(e->>'value') = ANY(${uniqueEmails}::text[])
          )
      `;

      // Map contacts by email for O(1) lookup
      const resultMap = new Map<string, Contact>();
      for (const contact of contacts) {
        if (contact.emails && Array.isArray(contact.emails)) {
          // Direct type assertion - no CPU-intensive JSON.parse(JSON.stringify) needed
          const contactEmails = contact.emails as Array<{ value?: string }>;
          for (const e of contactEmails) {
            if (e.value) {
              resultMap.set(e.value.toLowerCase(), contact);
            }
          }
        }
      }

      return resultMap;
    } catch (error) {
      this.logger.warn(`Batch email lookup failed, returning empty: ${error}`);
      return new Map();
    }
  }

  /**
   * Notify bulk contact changes via WebSocket
   */
  protected notifyContactsBulk(
    tenantId: string,
    providerId: string,
    payload: { created: string[]; updated: string[] },
  ): void {
    try {
      // Emit bulk notifications for created contacts
      if (payload.created.length > 0) {
        payload.created.forEach((contactId) => {
          this.realtimeEvents.emitContactNew(tenantId, {
            providerId,
            reason: 'contact-created',
            contactId,
          });
        });
        this.logger.debug(`Emitted ${payload.created.length} contact-created events for provider ${providerId}`);
      }

      // Emit bulk notifications for updated contacts
      if (payload.updated.length > 0) {
        payload.updated.forEach((contactId) => {
          this.realtimeEvents.emitContactUpdate(tenantId, {
            providerId,
            reason: 'contact-updated',
            contactId,
          });
        });
        this.logger.debug(`Emitted ${payload.updated.length} contact-updated events for provider ${providerId}`);
      }
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.debug(`Failed to emit bulk contact events for ${tenantId}: ${message}`);
    }
  }

  /**
   * Notify contact change via WebSocket
   */
  protected notifyContactChange(
    tenantId: string,
    providerId: string,
    reason: ContactRealtimeReason,
    payload?: { contactId?: string; externalId?: string },
  ): void {
    try {
      switch (reason) {
        case 'contact-created':
          this.realtimeEvents.emitContactNew(tenantId, {
            providerId,
            reason: 'contact-created',
            ...payload,
          });
          break;
        case 'contact-updated':
          this.realtimeEvents.emitContactUpdate(tenantId, {
            providerId,
            reason: 'contact-updated',
            ...payload,
          });
          break;
        case 'contact-deleted':
          this.realtimeEvents.emitContactDelete(tenantId, {
            providerId,
            reason: 'contact-deleted',
            ...payload,
          });
          break;
        case 'sync-complete':
          this.realtimeEvents.emitSyncStatus(tenantId, {
            providerId,
            status: 'completed',
          });
          break;
      }
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.debug(`Failed to emit contact event for ${tenantId}: ${message}`);
    }
  }
}
