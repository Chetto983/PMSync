import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, people_v1 } from 'googleapis';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { Contact } from '@prisma/client';

export type ContactRealtimeReason =
  | 'contact-created'
  | 'contact-updated'
  | 'contact-deleted'
  | 'sync-complete';

export interface GoogleContactsSyncResult {
  success: boolean;
  providerId: string;
  contactsProcessed: number;
  newContacts: number;
  updatedContacts: number;
  deletedContacts: number;
  syncDuration: number;
}

@Injectable()
export class GoogleContactsSyncService {
  private readonly logger = new Logger(GoogleContactsSyncService.name);
  private readonly contactsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerTokenService: ProviderTokenService,
    private realtimeEvents: RealtimeEventsService,
    private readonly configService: ConfigService,
  ) {
    this.contactsEnabled =
      (this.configService.get<string>('CONTACTS_SYNC_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.contactsEnabled) {
      this.logger.warn('GoogleContactsSyncService disabled via CONTACTS_SYNC_ENABLED=false');
    }
  }

  /**
   * Sync contacts from Google People API (BULK OPTIMIZED)
   * Reduces database queries from O(n) to O(1) by batching operations
   */
  async syncContacts(providerId: string): Promise<number> {
    if (!this.contactsEnabled) {
      this.logger.warn(`Skipping Google contacts sync for ${providerId} (CONTACTS_SYNC_ENABLED=false)`);
      return 0;
    }
    const startTime = Date.now();
    this.logger.log(`Starting Google Contacts sync (bulk) for provider ${providerId}`);

    try {
      // Get provider and access token (handles refresh automatically)
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      if (!provider.supportsContacts) {
        throw new Error('Provider does not support contacts');
      }

      const peopleService = this.createPeopleClient(accessToken);

      // STEP 1: Fetch ALL contacts from Google API (collect all pages)
      const allGoogleContacts: people_v1.Schema$Person[] = [];
      let pageToken: string | undefined;

      this.logger.log(`[Bulk Sync] Step 1/4: Fetching all contacts from Google API...`);
      do {
        const response = await peopleService.people.connections.list({
          resourceName: 'people/me',
          pageSize: 1000, // Max page size for efficiency
          pageToken,
          personFields:
            'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,photos,biographies,urls',
        });

        const connections = response.data.connections || [];
        allGoogleContacts.push(...connections);
        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);

      this.logger.log(`[Bulk Sync] Fetched ${allGoogleContacts.length} contacts from Google`);

      if (allGoogleContacts.length === 0) {
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

      for (let i = 0; i < allGoogleContacts.length; i += BATCH_SIZE) {
        const batch = allGoogleContacts.slice(i, i + BATCH_SIZE);
        const result = await this.processBatch(provider, batch, existingByExternalId);

        newContacts += result.newCount;
        updatedContacts += result.updatedCount;
        createdContactIds.push(...result.createdIds);
        updatedContactIds.push(...result.updatedIds);

        if (i + BATCH_SIZE < allGoogleContacts.length) {
          this.logger.debug(`[Bulk Sync] Processed ${i + batch.length}/${allGoogleContacts.length} contacts...`);
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
        `✅ Google Contacts sync completed for provider ${providerId}: ${allGoogleContacts.length} contacts processed (${newContacts} new, ${updatedContacts} updated) in ${syncDuration}ms`,
      );

      return allGoogleContacts.length;
    } catch (error: any) {
      this.logger.error(`Google Contacts sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a batch of contacts efficiently using transactions
   */
  private async processBatch(
    provider: any,
    batch: people_v1.Schema$Person[],
    existingByExternalId: Map<string, string>,
  ): Promise<{ newCount: number; updatedCount: number; createdIds: string[]; updatedIds: string[] }> {
    const newContacts: any[] = [];
    const newProviderContacts: any[] = [];
    const updateProviderContacts: any[] = [];

    // Pre-extract all emails for batch lookup
    const emailsToLookup: string[] = [];
    const contactDataMap = new Map<string, any>();

    for (const person of batch) {
      const externalId = person.resourceName!;
      const contactData = this.extractContactData(person);
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
    for (const person of batch) {
      const externalId = person.resourceName!;
      const contactData = contactDataMap.get(externalId)!;
      const existingContactId = existingByExternalId.get(externalId);

      if (existingContactId) {
        // UPDATE existing contact
        updateProviderContacts.push({
          externalId,
          contactId: existingContactId,
          data: contactData,
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
            person,
          });
        } else {
          // Need to create new unified contact
          newContacts.push({
            externalId,
            data: contactData,
            person,
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
        // This is more efficient than Promise.all with individual creates
        if (newContacts.length > 0) {
          const unifiedToCreate = newContacts.map((c) => ({
            tenantId: provider.tenantId,
            firstName: c.data.firstName,
            lastName: c.data.lastName,
            displayName: c.data.displayName,
            middleName: c.data.middleName,
            prefix: c.data.prefix,
            suffix: c.data.suffix,
            emails: c.data.emails,
            phoneNumbers: c.data.phoneNumbers,
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
              person: newContacts[j].person,
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
              rawData: pc.person,
              firstName: pc.data.firstName,
              lastName: pc.data.lastName,
              displayName: pc.data.displayName,
              middleName: pc.data.middleName,
              prefix: pc.data.prefix,
              suffix: pc.data.suffix,
              emails: pc.data.emails,
              phoneNumbers: pc.data.phoneNumbers,
              company: pc.data.company,
              jobTitle: pc.data.jobTitle,
              department: pc.data.department,
              birthday: pc.data.birthday,
              photoUrl: pc.data.photoUrl,
              notes: pc.data.notes,
              metadata: pc.person,
              lastSyncedAt: new Date(),
            })),
            skipDuplicates: true,
          });
        }

        // 3. Bulk update existing provider contacts using raw SQL
        // This is much faster than individual updates for large datasets
        if (updateProviderContacts.length > 0) {
          const now = new Date();
          const externalIds = updateProviderContacts.map((pc) => pc.externalId);

          // Bulk update using raw SQL for efficiency
          await tx.$executeRaw`
            UPDATE "provider_contacts"
            SET "lastSyncedAt" = ${now},
                "syncVersion" = "syncVersion" + 1
            WHERE "providerId" = ${provider.id}
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
   * Extract contact data from Google Person object
   */
  private extractContactData(person: people_v1.Schema$Person): any {
    const names = person.names?.[0];
    const emails = person.emailAddresses?.map((email) => ({
      value: email.value,
      type: email.type || 'other',
      primary: email.metadata?.primary || false,
    }));

    const phoneNumbers = person.phoneNumbers?.map((phone) => ({
      value: phone.value,
      type: phone.type || 'other',
      primary: phone.metadata?.primary || false,
    }));

    const organization = person.organizations?.[0];
    const photoUrl = person.photos?.[0]?.url;
    const birthday = person.birthdays?.[0]?.date
      ? new Date(
          person.birthdays[0].date.year || 1900,
          (person.birthdays[0].date.month || 1) - 1,
          person.birthdays[0].date.day || 1,
        )
      : null;

    const primaryEmail = emails?.find((e) => e.primary)?.value || emails?.[0]?.value;

    return {
      firstName: names?.givenName,
      lastName: names?.familyName,
      displayName: names?.displayName,
      middleName: names?.middleName,
      prefix: names?.honorificPrefix,
      suffix: names?.honorificSuffix,
      emails,
      phoneNumbers,
      company: organization?.name,
      jobTitle: organization?.title,
      department: organization?.department,
      birthday,
      photoUrl,
      notes: person.biographies?.[0]?.value,
      primaryEmail,
    };
  }

  /**
   * Batch find unified contacts by email addresses (ONE query)
   */
  private async batchFindUnifiedContactsByEmail(
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
        if (contact.emails) {
          const contactEmails = JSON.parse(JSON.stringify(contact.emails)) as any[];
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
   * Create a new contact in Google
   */
  async createContact(providerId: string, data: any): Promise<{ id: string }> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(
      providerId,
    );
    const peopleService = this.createPeopleClient(accessToken);

    const person: people_v1.Schema$Person = {
      names: [
        {
          givenName: data.firstName,
          familyName: data.lastName,
          displayName: data.displayName,
        },
      ],
      emailAddresses: data.emails?.map((email: any) => ({
        value: email.value,
        type: email.type || 'other',
      })),
      phoneNumbers: data.phoneNumbers?.map((phone: any) => ({
        value: phone.value,
        type: phone.type || 'other',
      })),
      organizations: data.company
        ? [
            {
              name: data.company,
              title: data.jobTitle,
            },
          ]
        : undefined,
      biographies: data.notes ? [{ value: data.notes }] : undefined,
    };

    const response = await peopleService.people.createContact({
      requestBody: person,
    });

    return { id: response.data.resourceName! };
  }

  /**
   * Update a contact in Google
   */
  async updateContact(providerId: string, externalId: string, data: any): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(
      providerId,
    );
    const peopleService = this.createPeopleClient(accessToken);

    const person: people_v1.Schema$Person = {
      names: data.firstName || data.lastName
        ? [
            {
              givenName: data.firstName,
              familyName: data.lastName,
              displayName: data.displayName,
            },
          ]
        : undefined,
      emailAddresses: data.emails?.map((email: any) => ({
        value: email.value,
        type: email.type || 'other',
      })),
      phoneNumbers: data.phoneNumbers?.map((phone: any) => ({
        value: phone.value,
        type: phone.type || 'other',
      })),
      organizations: data.company
        ? [
            {
              name: data.company,
              title: data.jobTitle,
            },
          ]
        : undefined,
      biographies: data.notes ? [{ value: data.notes }] : undefined,
    };

    await peopleService.people.updateContact({
      resourceName: externalId,
      updatePersonFields:
        'names,emailAddresses,phoneNumbers,organizations,biographies',
      requestBody: person,
    });
  }

  /**
   * Delete a contact from Google
   */
  async deleteContact(providerId: string, externalId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(
      providerId,
    );
    const peopleService = this.createPeopleClient(accessToken);

    await peopleService.people.deleteContact({
      resourceName: externalId,
    });
  }

  /**
   * Create Google People API client
   */
  private createPeopleClient(accessToken: string): people_v1.People {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    return google.people({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Notify bulk contact changes via WebSocket
   */
  private notifyContactsBulk(
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to emit bulk contact events for ${tenantId}: ${message}`);
    }
  }

  /**
   * Notify contact change via SSE and WebSocket
   */
  private notifyContactChange(
    tenantId: string,
    providerId: string,
    reason: ContactRealtimeReason,
    payload?: { contactId?: string; externalId?: string },
  ): void {
    try {
      // Emit WebSocket event
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to emit contact event for ${tenantId}: ${message}`);
    }
  }
}
