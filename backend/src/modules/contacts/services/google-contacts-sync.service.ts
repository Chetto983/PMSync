import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, people_v1 } from 'googleapis';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { BaseContactsSyncService, ExtractedContactData } from './base-contacts-sync.service';
import { ContactsError, ContactsErrorCode } from '../errors';
import { getContactsCircuitBreaker, withRetry } from '../utils';

// Re-export types for backward compatibility
export type { ContactRealtimeReason, ContactsSyncResult as GoogleContactsSyncResult } from './base-contacts-sync.service';

@Injectable()
export class GoogleContactsSyncService extends BaseContactsSyncService {
  protected readonly providerName = 'Google';

  constructor(
    prisma: PrismaService,
    providerTokenService: ProviderTokenService,
    realtimeEvents: RealtimeEventsService,
    configService: ConfigService,
  ) {
    super(prisma, providerTokenService, realtimeEvents, configService);
  }

  /**
   * Fetch all contacts from Google People API with pagination
   */
  protected async fetchAllContacts(accessToken: string): Promise<people_v1.Schema$Person[]> {
    const peopleService = this.createPeopleClient(accessToken);
    const allContacts: people_v1.Schema$Person[] = [];
    let pageToken: string | undefined;

    do {
      const response = await withRetry(() => peopleService.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000, // Max page size for efficiency
        pageToken,
        personFields:
          'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,photos,biographies,urls',
      }));

      const connections = response.data.connections || [];
      allContacts.push(...connections);
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return allContacts;
  }

  /**
   * Get external ID from Google Person object
   */
  protected getExternalId(rawContact: people_v1.Schema$Person): string {
    if (!rawContact.resourceName) {
      throw new ContactsError(
        'Google contact missing resourceName',
        ContactsErrorCode.CONTACT_MISSING_ID,
        { provider: 'google', retryable: false },
      );
    }
    return rawContact.resourceName;
  }

  /**
   * Extract contact data from Google Person object
   */
  protected extractContactData(person: people_v1.Schema$Person): ExtractedContactData {
    const names = person.names?.[0];
    const emails = person.emailAddresses?.map((email) => ({
      value: email.value || '',
      type: email.type || 'other',
      primary: email.metadata?.primary || false,
    }));

    const phoneNumbers = person.phoneNumbers?.map((phone) => ({
      value: phone.value || '',
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
      phoneNumbers: phoneNumbers && phoneNumbers.length > 0 ? phoneNumbers : null,
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
   * Create a new contact in Google
   */
  async createContact(providerId: string, data: any): Promise<{ id: string }> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
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

    const circuitBreaker = getContactsCircuitBreaker('google', 'createContact');

    const response = await withRetry(
      async () => circuitBreaker.execute(() =>
        peopleService.people.createContact({
          requestBody: person,
        })
      ),
      { provider: 'google', operationName: 'createContact', maxRetries: 2, logger: this.logger },
    );

    if (!response.data.resourceName) {
      throw new ContactsError(
        'Google API returned contact without resourceName',
        ContactsErrorCode.API_INVALID_RESPONSE,
        { provider: 'google', retryable: false },
      );
    }

    return { id: response.data.resourceName };
  }

  /**
   * Update a contact in Google
   */
  async updateContact(providerId: string, externalId: string, data: any): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
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

    const circuitBreaker = getContactsCircuitBreaker('google', 'updateContact');

    await withRetry(
      async () => circuitBreaker.execute(() =>
        peopleService.people.updateContact({
          resourceName: externalId,
          updatePersonFields: 'names,emailAddresses,phoneNumbers,organizations,biographies',
          requestBody: person,
        })
      ),
      { provider: 'google', operationName: 'updateContact', maxRetries: 2, logger: this.logger },
    );
  }

  /**
   * Delete a contact from Google
   */
  async deleteContact(providerId: string, externalId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
    const peopleService = this.createPeopleClient(accessToken);

    const circuitBreaker = getContactsCircuitBreaker('google', 'deleteContact');

    await withRetry(
      async () => circuitBreaker.execute(() =>
        peopleService.people.deleteContact({
          resourceName: externalId,
        })
      ),
      { provider: 'google', operationName: 'deleteContact', maxRetries: 2, logger: this.logger },
    );
  }

  /**
   * Create Google People API client
   */
  private createPeopleClient(accessToken: string): people_v1.People {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    return google.people({ version: 'v1', auth: oauth2Client });
  }
}
