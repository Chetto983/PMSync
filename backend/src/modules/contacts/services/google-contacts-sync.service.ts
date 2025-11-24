import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, people_v1 } from 'googleapis';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

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
   * Sync contacts from Google People API
   */
  async syncContacts(providerId: string): Promise<number> {
    if (!this.contactsEnabled) {
      this.logger.warn(`Skipping Google contacts sync for ${providerId} (CONTACTS_SYNC_ENABLED=false)`);
      return 0;
    }
    const startTime = Date.now();
    this.logger.log(`Starting Google Contacts sync for provider ${providerId}`);

    try {
      // Get provider and access token (handles refresh automatically)
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      if (!provider.supportsContacts) {
        throw new Error('Provider does not support contacts');
      }

      const peopleService = this.createPeopleClient(accessToken);

      let contactsProcessed = 0;
      let newContacts = 0;
      let updatedContacts = 0;
      let pageToken: string | undefined;
      const createdContactIds: string[] = [];
      const updatedContactIds: string[] = [];

      do {
        const response = await peopleService.people.connections.list({
          resourceName: 'people/me',
          pageSize: 100,
          pageToken,
          personFields:
            'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,photos,biographies,urls',
        });

        const connections = response.data.connections || [];

        for (const person of connections) {
          try {
            const result = await this.processContact(provider, person);
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

        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);

      // Send bulk notifications after processing all contacts
      this.notifyContactsBulk(provider.tenantId, provider.id, {
        created: createdContactIds,
        updated: updatedContactIds,
      });

      const syncDuration = Date.now() - startTime;
      this.logger.log(
        `Google Contacts sync completed for provider ${providerId}: ${contactsProcessed} contacts processed (${newContacts} new, ${updatedContacts} updated) in ${syncDuration}ms`,
      );

      return contactsProcessed;
    } catch (error: any) {
      this.logger.error(`Google Contacts sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a single contact from Google People API
   */
  private async processContact(
    provider: any,
    person: people_v1.Schema$Person,
  ): Promise<{ contactId: string; isNew: boolean }> {
    const externalId = person.resourceName!;

    // Extract contact data
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
      const primaryEmail = emails?.find((e) => e.primary)?.value || emails?.[0]?.value;

      if (primaryEmail) {
        // Try to find existing unified contact with this email
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
            firstName: names?.givenName,
            lastName: names?.familyName,
            displayName: names?.displayName,
            middleName: names?.middleName,
            prefix: names?.honorificPrefix,
            suffix: names?.honorificSuffix,
            emails: emails as any,
            phoneNumbers: phoneNumbers as any,
            company: organization?.name,
            jobTitle: organization?.title,
            department: organization?.department,
            birthday,
            photoUrl,
            notes: person.biographies?.[0]?.value,
          },
        });
      } else {
        // Merge data into existing unified contact
        await this.mergeContactData(unifiedContact.id, {
          emails: emails as any,
          phoneNumbers: phoneNumbers as any,
          company: organization?.name,
          jobTitle: organization?.title,
          photoUrl,
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
        rawData: person as any,
        firstName: names?.givenName,
        lastName: names?.familyName,
        displayName: names?.displayName,
        middleName: names?.middleName,
        prefix: names?.honorificPrefix,
        suffix: names?.honorificSuffix,
        emails: emails as any,
        phoneNumbers: phoneNumbers as any,
        company: organization?.name,
        jobTitle: organization?.title,
        department: organization?.department,
        birthday,
        photoUrl,
        notes: person.biographies?.[0]?.value,
        metadata: person as any,
        lastSyncedAt: new Date(),
      },
      update: {
        firstName: names?.givenName,
        lastName: names?.familyName,
        displayName: names?.displayName,
        middleName: names?.middleName,
        prefix: names?.honorificPrefix,
        suffix: names?.honorificSuffix,
        emails: emails as any,
        phoneNumbers: phoneNumbers as any,
        company: organization?.name,
        jobTitle: organization?.title,
        department: organization?.department,
        birthday,
        photoUrl,
        notes: person.biographies?.[0]?.value,
        rawData: person as any,
        metadata: person as any,
        lastSyncedAt: new Date(),
        syncVersion: { increment: 1 },
      },
    });

    // Return unified contact ID for notifications
    return {
      contactId: unifiedContact.id,
      isNew,
    };
  }

  /**
   * Find unified contact by email address
   */
  private async findUnifiedContactByEmail(
    tenantId: string,
    email: string,
  ): Promise<any | null> {
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId, isDeleted: false },
    });

    for (const contact of contacts) {
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

    return null;
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
    const existingEmails = contact.emails
      ? JSON.parse(JSON.stringify(contact.emails))
      : [];
    const newEmails = providerData.emails || [];
    const allEmails = [...existingEmails, ...newEmails];
    const uniqueEmails = Array.from(
      new Map(allEmails.map((e: any) => [e.value?.toLowerCase(), e])).values(),
    );

    // Merge phone numbers
    const existingPhones = contact.phoneNumbers
      ? JSON.parse(JSON.stringify(contact.phoneNumbers))
      : [];
    const newPhones = providerData.phoneNumbers || [];
    const allPhones = [...existingPhones, ...newPhones];
    const uniquePhones = Array.from(
      new Map(allPhones.map((p: any) => [p.value, p])).values(),
    );

    // Update unified contact with merged data
    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        emails: uniqueEmails as any,
        phoneNumbers: uniquePhones as any,
        // Only update these if not already set
        company: contact.company || providerData.company,
        jobTitle: contact.jobTitle || providerData.jobTitle,
        photoUrl: contact.photoUrl || providerData.photoUrl,
      },
    });
  }

  /**
   * Create a new contact in Google
   */
  async createContact(providerId: string, data: any): Promise<{ id: string }> {
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
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
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
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
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
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
