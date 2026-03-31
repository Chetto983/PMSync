import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, people_v1 } from 'googleapis';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { BaseContactsSyncService, ExtractedContactData } from './base-contacts-sync.service';
import { ContactsError, ContactsErrorCode } from '../errors';
import { getContactsCircuitBreaker, withRetry } from '../utils';

// Re-export types for backward compatibility
export type { ContactRealtimeReason, ContactsSyncResult as GoogleContactsSyncResult } from './base-contacts-sync.service';

@Injectable()
export class GoogleContactsSyncService extends BaseContactsSyncService {
  protected readonly providerName = 'Google';
  protected readonly providerType = 'google' as const;

  constructor(
    prisma: PrismaService,
    providerTokenService: ProviderTokenService,
    realtimeEvents: RealtimeEventsService,
    configService: ConfigService,
    redisLock: RedisLockService,
  ) {
    super(prisma, providerTokenService, realtimeEvents, configService, redisLock);
  }

  /**
   * Fetch all contacts from Google People API with pagination
   */
  protected async fetchAllContacts(accessToken: string): Promise<people_v1.Schema$Person[]> {
    const peopleService = this.createPeopleClient(accessToken);
    const allContacts: people_v1.Schema$Person[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
      const response = await withRetry(
        () => peopleService.people.connections.list({
          resourceName: 'people/me',
          pageSize: 1000, // Max page size for efficiency
          pageToken,
          personFields:
            'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,photos,biographies,urls',
        }),
        { provider: 'google', operationName: 'fetchContacts', maxRetries: 3, logger: this.logger },
      );

      const connections = response.data.connections || [];
      allContacts.push(...connections);
      pageToken = response.data.nextPageToken || undefined;
      pageCount++;

      // T-0503: Inter-page delay to respect Google People API read quota (90 req/min/user)
      if (pageToken) {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    } while (pageToken);

    if (pageCount > 1) {
      this.logger.log(`Fetched ${allContacts.length} contacts across ${pageCount} pages`);
    }

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
    // T-0504: Skip default/placeholder Google photos (generic silhouette)
    const photo = person.photos?.[0];
    const isDefaultPhoto = photo?.default === true;
    const photoUrl = isDefaultPhoto ? null : (photo?.url ?? null);
    // Use photo URL as etag — Google embeds a unique hash in the URL that changes on photo update
    const photoEtag = photoUrl ?? null;
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
      photoEtag,
      notes: person.biographies?.[0]?.value,
      primaryEmail,
      etag: person.etag ?? null,
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
   * Update a contact in Google.
   * Fetches current etag first to prevent concurrent modification conflicts.
   * On 409 Conflict: re-fetches etag and retries once.
   */
  async updateContact(providerId: string, externalId: string, data: any): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
    const peopleService = this.createPeopleClient(accessToken);

    // Fetch current etag from provider contact record or from Google API
    let etag = await this.getStoredEtag(providerId, externalId);
    if (!etag) {
      etag = await this.fetchEtagFromGoogle(peopleService, externalId);
    }

    const buildPerson = (etagValue: string | null): people_v1.Schema$Person => ({
      etag: etagValue ?? undefined,
      names: data.firstName || data.lastName
        ? [{ givenName: data.firstName, familyName: data.lastName, displayName: data.displayName }]
        : undefined,
      emailAddresses: data.emails?.map((email: any) => ({ value: email.value, type: email.type || 'other' })),
      phoneNumbers: data.phoneNumbers?.map((phone: any) => ({ value: phone.value, type: phone.type || 'other' })),
      organizations: data.company ? [{ name: data.company, title: data.jobTitle }] : undefined,
      biographies: data.notes ? [{ value: data.notes }] : undefined,
    });

    const circuitBreaker = getContactsCircuitBreaker('google', 'updateContact');

    try {
      const response = await withRetry(
        async () => circuitBreaker.execute(() =>
          peopleService.people.updateContact({
            resourceName: externalId,
            updatePersonFields: 'names,emailAddresses,phoneNumbers,organizations,biographies',
            requestBody: buildPerson(etag),
          })
        ),
        { provider: 'google', operationName: 'updateContact', maxRetries: 2, logger: this.logger },
      );

      // Store updated etag for future operations
      const newEtag = response.data.etag ?? null;
      if (newEtag) {
        await this.storeEtag(providerId, externalId, newEtag);
      }
    } catch (error: any) {
      // Handle 409 Conflict: re-fetch etag and retry once
      if (error?.response?.status === 409 || error?.code === 409) {
        this.logger.warn(`Etag conflict for ${externalId}, re-fetching and retrying`);
        const freshEtag = await this.fetchEtagFromGoogle(peopleService, externalId);
        const response = await peopleService.people.updateContact({
          resourceName: externalId,
          updatePersonFields: 'names,emailAddresses,phoneNumbers,organizations,biographies',
          requestBody: buildPerson(freshEtag),
        });
        const newEtag = response.data.etag ?? null;
        if (newEtag) await this.storeEtag(providerId, externalId, newEtag);
        return;
      }
      throw error;
    }
  }

  /**
   * Get stored etag from ProviderContact record
   */
  private async getStoredEtag(providerId: string, externalId: string): Promise<string | null> {
    const pc = await this.prisma.providerContact.findUnique({
      where: { providerId_externalId: { providerId, externalId } },
      select: { eTag: true },
    });
    return pc?.eTag ?? null;
  }

  /**
   * Fetch current etag from Google People API
   */
  private async fetchEtagFromGoogle(peopleService: people_v1.People, resourceName: string): Promise<string | null> {
    try {
      const response = await peopleService.people.get({
        resourceName,
        personFields: 'names',
      });
      return response.data.etag ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Store etag in ProviderContact for future update operations
   */
  private async storeEtag(providerId: string, externalId: string, etag: string): Promise<void> {
    try {
      await this.prisma.providerContact.update({
        where: { providerId_externalId: { providerId, externalId } },
        data: { eTag: etag },
      });
    } catch {
      // Non-critical: if we can't store it, we'll fetch it next time
    }
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

  /**
   * Fetch contact photo from Google People API
   * Google returns photo URLs directly in contact object
   * Returns the photo URL or null if no photo
   */
  async getContactPhoto(providerId: string, externalId: string): Promise<string | null> {
    try {
      const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
      const peopleService = this.createPeopleClient(accessToken);

      // Fetch the contact with photo field
      const response = await withRetry(
        () => peopleService.people.get({
          resourceName: externalId,
          personFields: 'photos',
        }),
        { provider: 'google', operationName: 'getContactPhoto', maxRetries: 2, logger: this.logger },
      );

      const photoUrl = response.data.photos?.[0]?.url;
      if (!photoUrl) {
        return null;
      }

      // Google photo URLs are publicly accessible
      return photoUrl;
    } catch (error: any) {
      this.logger.warn(`Failed to fetch Google contact photo: ${error.message}`);
      return null;
    }
  }
}
