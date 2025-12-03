import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { Contact } from '@prisma/client';

export type ContactRealtimeReason =
  | 'contact-created'
  | 'contact-updated'
  | 'contact-deleted'
  | 'sync-complete';

export interface MicrosoftContactsSyncResult {
  success: boolean;
  providerId: string;
  contactsProcessed: number;
  newContacts: number;
  updatedContacts: number;
  deletedContacts: number;
  syncDuration: number;
}

@Injectable()
export class MicrosoftContactsSyncService {
  private readonly logger = new Logger(MicrosoftContactsSyncService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
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
      this.logger.warn('MicrosoftContactsSyncService disabled via CONTACTS_SYNC_ENABLED=false');
    }
  }

  /**
   * Sync contacts from Microsoft Graph API (BULK OPTIMIZED)
   * Reduces database queries from O(n) to O(1) by batching operations
   */
  async syncContacts(providerId: string): Promise<number> {
    if (!this.contactsEnabled) {
      this.logger.warn(
        `Skipping Microsoft contacts sync for ${providerId} (CONTACTS_SYNC_ENABLED=false)`,
      );
      return 0;
    }
    const startTime = Date.now();
    this.logger.log(`Starting Microsoft Contacts sync (bulk) for provider ${providerId}`);

    try {
      // Get provider and access token (handles refresh automatically)
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      if (!provider.supportsContacts) {
        throw new Error('Provider does not support contacts');
      }

      // STEP 1: Fetch ALL contacts from Microsoft Graph API (collect all pages)
      const allMsContacts: any[] = [];
      let nextLink: string | null = `${this.GRAPH_API_BASE}/me/contacts?$top=999`;

      this.logger.log(`[Bulk Sync] Step 1/4: Fetching all contacts from Microsoft Graph API...`);
      do {
        const response: any = await axios.get(nextLink, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const contacts = response.data.value || [];
        allMsContacts.push(...contacts);
        nextLink = response.data['@odata.nextLink'] || null;
      } while (nextLink);

      this.logger.log(`[Bulk Sync] Fetched ${allMsContacts.length} contacts from Microsoft`);

      if (allMsContacts.length === 0) {
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

      for (let i = 0; i < allMsContacts.length; i += BATCH_SIZE) {
        const batch = allMsContacts.slice(i, i + BATCH_SIZE);
        const result = await this.processBatch(provider, batch, existingByExternalId);

        newContacts += result.newCount;
        updatedContacts += result.updatedCount;
        createdContactIds.push(...result.createdIds);
        updatedContactIds.push(...result.updatedIds);

        if (i + BATCH_SIZE < allMsContacts.length) {
          this.logger.debug(`[Bulk Sync] Processed ${i + batch.length}/${allMsContacts.length} contacts...`);
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
        `✅ Microsoft Contacts sync completed for provider ${providerId}: ${allMsContacts.length} contacts processed (${newContacts} new, ${updatedContacts} updated) in ${syncDuration}ms`,
      );

      return allMsContacts.length;
    } catch (error: any) {
      this.logger.error(`Microsoft Contacts sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a batch of contacts efficiently using transactions
   */
  private async processBatch(
    provider: any,
    batch: any[],
    existingByExternalId: Map<string, string>,
  ): Promise<{ newCount: number; updatedCount: number; createdIds: string[]; updatedIds: string[] }> {
    const newContacts: any[] = [];
    const newProviderContacts: any[] = [];
    const updateProviderContacts: any[] = [];

    // Pre-extract all emails for batch lookup
    const emailsToLookup: string[] = [];
    const contactDataMap = new Map<string, any>();

    for (const contact of batch) {
      const externalId = contact.id;
      const contactData = this.extractContactData(contact);
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
    for (const contact of batch) {
      const externalId = contact.id;
      const contactData = contactDataMap.get(externalId)!;
      const existingContactId = existingByExternalId.get(externalId);

      if (existingContactId) {
        // UPDATE existing contact
        updateProviderContacts.push({
          externalId,
          contactId: existingContactId,
          data: contactData,
          contact,
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
            contact,
          });
        } else {
          // Need to create new unified contact
          newContacts.push({
            externalId,
            data: contactData,
            contact,
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
            emails: c.data.emails,
            phoneNumbers: c.data.phoneNumbers,
            addresses: c.data.addresses,
            company: c.data.company,
            jobTitle: c.data.jobTitle,
            department: c.data.department,
            birthday: c.data.birthday,
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
              contact: newContacts[j].contact,
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
              rawData: pc.contact,
              firstName: pc.data.firstName,
              lastName: pc.data.lastName,
              displayName: pc.data.displayName,
              middleName: pc.data.middleName,
              nickname: pc.data.nickname,
              prefix: pc.data.prefix,
              emails: pc.data.emails,
              phoneNumbers: pc.data.phoneNumbers,
              addresses: pc.data.addresses,
              company: pc.data.company,
              jobTitle: pc.data.jobTitle,
              department: pc.data.department,
              birthday: pc.data.birthday,
              notes: pc.data.notes,
              lastSyncedAt: new Date(),
            })),
            skipDuplicates: true,
          });
        }

        // 3. Bulk update existing provider contacts using raw SQL
        if (updateProviderContacts.length > 0) {
          const now = new Date();
          const externalIds = updateProviderContacts.map((pc) => pc.externalId);

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
   * Extract contact data from Microsoft contact object
   */
  private extractContactData(contact: any): any {
    // Extract email addresses
    const emails = contact.emailAddresses?.map((email: any) => ({
      value: email.address,
      type: email.name?.toLowerCase() || 'other',
      primary: false,
    }));

    // Extract phone numbers
    const phoneNumbers: any[] = [];
    if (contact.mobilePhone) {
      phoneNumbers.push({ value: contact.mobilePhone, type: 'mobile', primary: true });
    }
    if (contact.businessPhones) {
      contact.businessPhones.forEach((phone: string) => {
        phoneNumbers.push({ value: phone, type: 'work', primary: false });
      });
    }
    if (contact.homePhones) {
      contact.homePhones.forEach((phone: string) => {
        phoneNumbers.push({ value: phone, type: 'home', primary: false });
      });
    }

    // Extract addresses
    const addresses: any[] = [];
    if (contact.homeAddress) {
      addresses.push({
        street: contact.homeAddress.street,
        city: contact.homeAddress.city,
        state: contact.homeAddress.state,
        postalCode: contact.homeAddress.postalCode,
        country: contact.homeAddress.countryOrRegion,
        type: 'home',
      });
    }
    if (contact.businessAddress) {
      addresses.push({
        street: contact.businessAddress.street,
        city: contact.businessAddress.city,
        state: contact.businessAddress.state,
        postalCode: contact.businessAddress.postalCode,
        country: contact.businessAddress.countryOrRegion,
        type: 'work',
      });
    }

    // Extract birthday
    let birthday = null;
    if (contact.birthday) {
      try {
        birthday = new Date(contact.birthday);
      } catch {
        // Invalid birthday format
      }
    }

    const primaryEmail = emails?.[0]?.value;

    return {
      firstName: contact.givenName,
      lastName: contact.surname,
      displayName: contact.displayName,
      middleName: contact.middleName,
      nickname: contact.nickName,
      prefix: contact.title,
      emails,
      phoneNumbers: phoneNumbers.length > 0 ? phoneNumbers : null,
      addresses: addresses.length > 0 ? addresses : null,
      company: contact.companyName,
      jobTitle: contact.jobTitle,
      department: contact.department,
      birthday,
      notes: contact.personalNotes,
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
   * Create a new contact in Microsoft
   */
  async createContact(providerId: string, data: any): Promise<{ id: string }> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(
      providerId,
    );

    const contact = {
      givenName: data.firstName,
      surname: data.lastName,
      displayName: data.displayName,
      emailAddresses: data.emails?.map((email: any) => ({
        address: email.value,
        name: email.type || 'other',
      })),
      mobilePhone: data.phoneNumbers?.find((p: any) => p.type === 'mobile')?.value,
      businessPhones: data.phoneNumbers
        ?.filter((p: any) => p.type === 'work')
        .map((p: any) => p.value),
      homePhones: data.phoneNumbers
        ?.filter((p: any) => p.type === 'home')
        .map((p: any) => p.value),
      companyName: data.company,
      jobTitle: data.jobTitle,
      personalNotes: data.notes,
    };

    const response = await axios.post(`${this.GRAPH_API_BASE}/me/contacts`, contact, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    return { id: response.data.id };
  }

  /**
   * Update a contact in Microsoft
   */
  async updateContact(
    providerId: string,
    externalId: string,
    data: any,
  ): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(
      providerId,
    );

    const contact: any = {};

    if (data.firstName) contact.givenName = data.firstName;
    if (data.lastName) contact.surname = data.lastName;
    if (data.displayName) contact.displayName = data.displayName;
    if (data.emails) {
      contact.emailAddresses = data.emails.map((email: any) => ({
        address: email.value,
        name: email.type || 'other',
      }));
    }
    if (data.phoneNumbers) {
      contact.mobilePhone = data.phoneNumbers.find((p: any) => p.type === 'mobile')
        ?.value;
      contact.businessPhones = data.phoneNumbers
        .filter((p: any) => p.type === 'work')
        .map((p: any) => p.value);
      contact.homePhones = data.phoneNumbers
        .filter((p: any) => p.type === 'home')
        .map((p: any) => p.value);
    }
    if (data.company) contact.companyName = data.company;
    if (data.jobTitle) contact.jobTitle = data.jobTitle;
    if (data.notes) contact.personalNotes = data.notes;

    await axios.patch(`${this.GRAPH_API_BASE}/me/contacts/${externalId}`, contact, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Delete a contact from Microsoft
   */
  async deleteContact(providerId: string, externalId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(
      providerId,
    );

    await axios.delete(`${this.GRAPH_API_BASE}/me/contacts/${externalId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
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
