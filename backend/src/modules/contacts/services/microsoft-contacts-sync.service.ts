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
   * Sync contacts from Microsoft Graph API
   */
  async syncContacts(providerId: string): Promise<number> {
    if (!this.contactsEnabled) {
      this.logger.warn(
        `Skipping Microsoft contacts sync for ${providerId} (CONTACTS_SYNC_ENABLED=false)`,
      );
      return 0;
    }
    const startTime = Date.now();
    this.logger.log(`Starting Microsoft Contacts sync for provider ${providerId}`);

    try {
      // Get provider and access token (handles refresh automatically)
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      if (!provider.supportsContacts) {
        throw new Error('Provider does not support contacts');
      }

      let contactsProcessed = 0;
      let newContacts = 0;
      let updatedContacts = 0;
      let nextLink: string | null = `${this.GRAPH_API_BASE}/me/contacts?$top=100`;
      const createdContactIds: string[] = [];
      const updatedContactIds: string[] = [];

      do {
        const response: any = await axios.get(nextLink, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const contacts = response.data.value || [];

        for (const contact of contacts) {
          try {
            const result = await this.processContact(provider, contact);
            contactsProcessed++;

            if (result.isNew) {
              newContacts++;
              createdContactIds.push(result.contactId);
            } else {
              updatedContacts++;
              updatedContactIds.push(result.contactId);
            }
          } catch (error: any) {
            this.logger.error(`Error processing contact: ${error.message}`);
          }
        }

        nextLink = response.data['@odata.nextLink'] || null;
      } while (nextLink);

      // Send bulk notifications after processing all contacts
      this.notifyContactsBulk(provider.tenantId, provider.id, {
        created: createdContactIds,
        updated: updatedContactIds,
      });

      const syncDuration = Date.now() - startTime;
      this.logger.log(
        `Microsoft Contacts sync completed for provider ${providerId}: ${contactsProcessed} contacts processed (${newContacts} new, ${updatedContacts} updated) in ${syncDuration}ms`,
      );

      return contactsProcessed;
    } catch (error: any) {
      this.logger.error(`Microsoft Contacts sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a single contact from Microsoft Graph API
   * Uses 2-table architecture: Contact (unified) + ProviderContact (provider reference)
   */
  private async processContact(provider: any, contact: any): Promise<{ contactId: string; isNew: boolean }> {
    const externalId = contact.id;

    // Extract email addresses
    const emails = contact.emailAddresses?.map((email: any) => ({
      value: email.address,
      type: email.name?.toLowerCase() || 'other',
      primary: false,
    }));

    // Extract phone numbers
    const phoneNumbers = [];
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
    const addresses = [];
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
        this.logger.warn(`Invalid birthday format: ${contact.birthday}`);
      }
    }

    // Check if ProviderContact already exists
    const existingProviderContact = await this.prisma.providerContact.findUnique({
      where: {
        providerId_externalId: {
          providerId: provider.id,
          externalId,
        },
      },
      include: { contact: true },
    });

    let unifiedContact;
    let isNew = false;

    if (existingProviderContact) {
      // ProviderContact exists, use its unified contact
      unifiedContact = existingProviderContact.contact;
    } else {
      // New contact - find or create unified contact by email
      isNew = true;
      const primaryEmail = emails?.[0]?.value;

      if (primaryEmail) {
        unifiedContact = await this.findUnifiedContactByEmail(
          provider.tenantId,
          primaryEmail,
        );
      }

      if (!unifiedContact) {
        // Create new unified contact
        unifiedContact = await this.prisma.contact.create({
          data: {
            tenantId: provider.tenantId,
            firstName: contact.givenName,
            lastName: contact.surname,
            displayName: contact.displayName,
            middleName: contact.middleName,
            nickname: contact.nickName,
            prefix: contact.title,
            emails: emails,
            phoneNumbers: phoneNumbers as any,
            addresses: addresses.length > 0 ? (addresses as any) : null,
            company: contact.companyName,
            jobTitle: contact.jobTitle,
            department: contact.department,
            birthday,
            notes: contact.personalNotes,
          },
        });
      } else {
        // Merge data into existing unified contact
        await this.mergeContactData(unifiedContact.id, {
          emails: emails,
          phoneNumbers: phoneNumbers as any,
          addresses: addresses.length > 0 ? (addresses as any) : null,
        });
      }
    }

    // Upsert provider contact
    await this.prisma.providerContact.upsert({
      where: {
        providerId_externalId: {
          providerId: provider.id,
          externalId,
        },
      },
      create: {
        contactId: unifiedContact.id,
        tenantId: provider.tenantId,
        providerId: provider.id,
        externalId,
        rawData: contact,
        firstName: contact.givenName,
        lastName: contact.surname,
        displayName: contact.displayName,
        middleName: contact.middleName,
        nickname: contact.nickName,
        prefix: contact.title,
        emails: emails,
        phoneNumbers: phoneNumbers as any,
        addresses: addresses.length > 0 ? (addresses as any) : null,
        company: contact.companyName,
        jobTitle: contact.jobTitle,
        department: contact.department,
        birthday,
        notes: contact.personalNotes,
        lastSyncedAt: new Date(),
      },
      update: {
        firstName: contact.givenName,
        lastName: contact.surname,
        displayName: contact.displayName,
        middleName: contact.middleName,
        nickname: contact.nickName,
        prefix: contact.title,
        emails: emails,
        phoneNumbers: phoneNumbers as any,
        addresses: addresses.length > 0 ? (addresses as any) : null,
        company: contact.companyName,
        jobTitle: contact.jobTitle,
        department: contact.department,
        birthday,
        notes: contact.personalNotes,
        rawData: contact,
        lastSyncedAt: new Date(),
        syncVersion: { increment: 1 },
      },
    });

    // Return contact metadata for bulk notification
    return {
      contactId: unifiedContact.id,
      isNew,
    };
  }

  /**
   * Find unified contact by email address
   * Uses efficient database query with JSON path filtering
   */
  private async findUnifiedContactByEmail(
    tenantId: string,
    email: string,
  ): Promise<Contact | null> {
    const normalizedEmail = email.toLowerCase();

    // Use raw query for efficient JSON array search (PostgreSQL)
    // This avoids loading all contacts into memory
    try {
      const contacts = await this.prisma.$queryRaw<Contact[]>`
        SELECT * FROM "Contact"
        WHERE "tenantId" = ${tenantId}
          AND "isDeleted" = false
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("emails") AS e
            WHERE LOWER(e->>'value') = ${normalizedEmail}
          )
        LIMIT 1
      `;

      return contacts.length > 0 ? contacts[0] : null;
    } catch (error) {
      // Fallback to in-memory search if raw query fails (e.g., different DB)
      this.logger.warn(`Raw query failed, using fallback search: ${error}`);
      const contacts = await this.prisma.contact.findMany({
        where: { tenantId, isDeleted: false },
        take: 500, // Limit to prevent memory issues
      });

      for (const contact of contacts) {
        if (contact.emails) {
          const emails = JSON.parse(JSON.stringify(contact.emails));
          if (Array.isArray(emails)) {
            const hasEmail = emails.some(
              (e: any) => e.value?.toLowerCase() === normalizedEmail,
            );
            if (hasEmail) {
              return contact;
            }
          }
        }
      }

      return null;
    }
  }

  /**
   * Merge contact data from provider into unified contact
   */
  private async mergeContactData(
    contactId: string,
    providerData: any,
  ): Promise<void> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) return;

    // Merge emails
    const existingEmails = contact.emails ? JSON.parse(JSON.stringify(contact.emails)) : [];
    const newEmails = providerData.emails || [];
    const allEmails = [...existingEmails, ...newEmails];
    const uniqueEmails = Array.from(
      new Map(allEmails.map((e: any) => [e.value?.toLowerCase(), e])).values(),
    );

    // Merge phone numbers
    const existingPhones = contact.phoneNumbers ? JSON.parse(JSON.stringify(contact.phoneNumbers)) : [];
    const newPhones = providerData.phoneNumbers || [];
    const allPhones = [...existingPhones, ...newPhones];
    const uniquePhones = Array.from(
      new Map(allPhones.map((p: any) => [p.value, p])).values(),
    );

    // Merge addresses
    const existingAddresses = contact.addresses ? JSON.parse(JSON.stringify(contact.addresses)) : [];
    const newAddresses = providerData.addresses || [];
    const allAddresses = [...existingAddresses, ...newAddresses];
    const uniqueAddresses = Array.from(
      new Map(allAddresses.map((a: any) => [JSON.stringify(a), a])).values(),
    );

    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        emails: uniqueEmails as any,
        phoneNumbers: uniquePhones as any,
        addresses: uniqueAddresses as any,
      },
    });
  }

  /**
   * Create a new contact in Microsoft
   */
  async createContact(providerId: string, data: any): Promise<{ id: string }> {
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
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
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
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
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
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
