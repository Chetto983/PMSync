import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { BaseContactsSyncService, ExtractedContactData } from './base-contacts-sync.service';

// Re-export types for backward compatibility
export type { ContactRealtimeReason, ContactsSyncResult as MicrosoftContactsSyncResult } from './base-contacts-sync.service';

@Injectable()
export class MicrosoftContactsSyncService extends BaseContactsSyncService {
  protected readonly providerName = 'Microsoft';
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    prisma: PrismaService,
    providerTokenService: ProviderTokenService,
    realtimeEvents: RealtimeEventsService,
    configService: ConfigService,
  ) {
    super(prisma, providerTokenService, realtimeEvents, configService);
  }

  /**
   * Fetch all contacts from Microsoft Graph API with pagination
   */
  protected async fetchAllContacts(accessToken: string): Promise<any[]> {
    const allContacts: any[] = [];
    let nextLink: string | null = `${this.GRAPH_API_BASE}/me/contacts?$top=999`;

    do {
      const response: any = await axios.get(nextLink, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const contacts = response.data.value || [];
      allContacts.push(...contacts);
      nextLink = response.data['@odata.nextLink'] || null;
    } while (nextLink);

    return allContacts;
  }

  /**
   * Get external ID from Microsoft contact object
   */
  protected getExternalId(rawContact: any): string {
    return rawContact.id;
  }

  /**
   * Extract contact data from Microsoft contact object
   */
  protected extractContactData(contact: any): ExtractedContactData {
    // Extract email addresses
    const emails = contact.emailAddresses?.map((email: any) => ({
      value: email.address,
      type: email.name?.toLowerCase() || 'other',
      primary: false,
    }));

    // Extract phone numbers
    const phoneNumbers: Array<{ value: string; type: string; primary: boolean }> = [];
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
    const addresses: Array<{
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      type: string;
    }> = [];
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
    let birthday: Date | null = null;
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
   * Create a new contact in Microsoft
   */
  async createContact(providerId: string, data: any): Promise<{ id: string }> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

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
  async updateContact(providerId: string, externalId: string, data: any): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

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
      contact.mobilePhone = data.phoneNumbers.find((p: any) => p.type === 'mobile')?.value;
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
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    await axios.delete(`${this.GRAPH_API_BASE}/me/contacts/${externalId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
