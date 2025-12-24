/**
 * Contacts Import Service
 *
 * Handles contact import operations:
 * - vCard (.vcf) file parsing and import
 * - Email address extraction from messages
 * - Local contact creation (no provider sync)
 *
 * Extracted from contacts.service.ts for single responsibility.
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Contact, Prisma } from '@prisma/client';
import vCard from 'vcf';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { CONTACTS_DEFAULTS, PUBLIC_EMAIL_DOMAINS, CONTACT_SOURCES } from '../contacts.constants';
import type { VCardImportResult, EmailExtractionResult } from '../contacts.types';
import type { CreateContactDto } from '../dto/contact.dto';

@Injectable()
export class ContactsImportService {
  private readonly logger = new Logger(ContactsImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) { }

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
        metadata: {
          source: CONTACT_SOURCES.LOCAL,
          createdAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Local contact created: ${contact.id}`);
    return contact;
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
  ): Promise<EmailExtractionResult> {
    this.logger.log(`Extracting contacts from emails for tenant ${tenantId}`);

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

      // To, CC, BCC (JSON arrays)
      processAddressArray(email.to);
      processAddressArray(email.cc);
      processAddressArray(email.bcc);
    }

    // Filter by domain first to reduce query size
    const candidateEmails = Array.from(addressMap.keys()).filter((emailAddr) => {
      const domain = emailAddr.split('@')[1];
      if (!domain) return false;
      if (excludePublicDomains && PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase())) return false;
      return true;
    });

    if (candidateEmails.length === 0) {
      this.logger.log('No candidate emails after filtering');
      return { created: 0, skipped: addressMap.size, total: addressMap.size };
    }

    // Check which emails already exist using PostgreSQL JSONB query (O(1) per batch)
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
      if (excludePublicDomains && PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase())) {
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
        metadata: {
          source: CONTACT_SOURCES.EMAIL_EXTRACTION,
          extractedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      });

      // Prevent duplicates within this run
      existingEmails.add(emailAddr);
    }

    // Create all contacts in a single transaction
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
        skipped += contactsToCreate.length;
      }
    }

    this.logger.log(`Contact extraction complete: ${created} created, ${skipped} skipped, ${addressMap.size} total`);

    return { created, skipped, total: addressMap.size };
  }

  /**
   * Import contacts from vCard (.vcf) file content
   * Supports vCard 3.0 and 4.0 formats (Outlook, Apple, Google exports)
   * @param tenantId - Tenant ID
   * @param vcfContent - Raw vCard file content (can contain multiple contacts)
   */
  async importFromVCard(tenantId: string, vcfContent: string): Promise<VCardImportResult> {
    this.logger.log(`Importing contacts from vCard for tenant ${tenantId}`);

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    // Batch validation: check content size and format before processing
    if (vcfContent.length > CONTACTS_DEFAULTS.VCARD_MAX_SIZE_BYTES) {
      const maxMB = CONTACTS_DEFAULTS.VCARD_MAX_SIZE_BYTES / 1024 / 1024;
      throw new BadRequestException(`vCard file too large. Maximum size: ${maxMB}MB`);
    }

    // Quick format validation - vCard must start with BEGIN:VCARD
    if (!vcfContent.trim().toUpperCase().startsWith('BEGIN:VCARD')) {
      throw new BadRequestException('Invalid vCard format: file must start with BEGIN:VCARD');
    }

    try {
      // Parse vCard content - can contain multiple vCards
      const parsed = vCard.parse(vcfContent);

      // vCard.parse returns a single vCard or array, normalize to array
      const cards = Array.isArray(parsed) ? parsed : [parsed];

      // Validate contact count before processing
      if (cards.length > CONTACTS_DEFAULTS.VCARD_MAX_CONTACTS) {
        throw new BadRequestException(
          `Too many contacts (${cards.length}). Maximum per import: ${CONTACTS_DEFAULTS.VCARD_MAX_CONTACTS}`,
        );
      }

      this.logger.log(`Parsed ${cards.length} vCards for import`);

      // OPTIMIZED: Get existing emails using PostgreSQL JSONB query instead of loading all contacts
      const existingEmails = await this.getExistingEmailsSet(tenantId);

      // Process each vCard
      for (const card of cards) {
        try {
          const result = await this.processVCard(card, tenantId, existingEmails);
          if (result.imported) {
            imported++;
            // Add imported emails to set to prevent duplicates within this import
            result.emails.forEach(email => existingEmails.add(email));
          } else {
            skipped++;
          }
        } catch (cardError: any) {
          const errMsg = `Failed to import contact: ${cardError.message}`;
          this.logger.warn(errMsg);
          errors.push(errMsg);
          skipped++;
        }
      }
    } catch (parseError: any) {
      if (parseError instanceof BadRequestException) {
        throw parseError;
      }
      const errMsg = `Failed to parse vCard file: ${parseError.message}`;
      this.logger.error(errMsg);
      errors.push(errMsg);
    }

    this.logger.log(`vCard import complete: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);

    return { imported, skipped, errors };
  }

  /**
   * Get set of existing emails for a tenant using optimized JSONB query
   * @private
   */
  private async getExistingEmailsSet(tenantId: string): Promise<Set<string>> {
    const existingContacts = await this.prisma.$queryRaw<{ email: string }[]>`
      SELECT DISTINCT LOWER(email_obj->>'value') as email
      FROM "Contact",
           jsonb_array_elements(emails) AS email_obj
      WHERE tenant_id = ${tenantId}
        AND is_deleted = false
    `;
    return new Set(existingContacts.map(r => r.email));
  }

  /**
   * Process a single vCard and create contact if valid
   * @private
   */
  private async processVCard(
    card: vCard,
    tenantId: string,
    existingEmails: Set<string>,
  ): Promise<{ imported: boolean; emails: string[] }> {
    // Extract name
    const { firstName, lastName, displayName } = this.extractNameFromVCard(card);

    // Extract emails
    const emails = this.extractEmailsFromVCard(card);

    // Skip if no email
    if (emails.length === 0) {
      this.logger.debug(`Skipping vCard without email: ${displayName || 'Unknown'}`);
      return { imported: false, emails: [] };
    }

    // Check for duplicates
    const isDuplicate = emails.some(e => existingEmails.has(e.value));
    if (isDuplicate) {
      this.logger.debug(`Skipping duplicate contact: ${emails[0].value}`);
      return { imported: false, emails: [] };
    }

    // Extract other fields
    const phoneNumbers = this.extractPhonesFromVCard(card);
    const company = this.extractOrgFromVCard(card);
    const jobTitle = this.extractFieldFromVCard(card, 'title');
    const notes = this.extractFieldFromVCard(card, 'note');
    const birthday = this.extractBirthdayFromVCard(card);

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
        metadata: {
          source: CONTACT_SOURCES.VCARD_IMPORT,
          importedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    this.logger.debug(`Imported contact: ${displayName || emails[0].value}`);
    return { imported: true, emails: emails.map(e => e.value) };
  }

  /**
   * Extract name fields from vCard
   * @private
   */
  private extractNameFromVCard(card: vCard): {
    firstName?: string;
    lastName?: string;
    displayName?: string;
  } {
    let firstName: string | undefined;
    let lastName: string | undefined;
    let displayName: string | undefined;

    // FN (Full Name)
    const fnProp = card.get('fn');
    if (fnProp) {
      const fnValue = Array.isArray(fnProp) ? fnProp[0] : fnProp;
      const fnResolved = fnValue?.valueOf?.() ?? fnValue?.value ?? fnValue;
      displayName = typeof fnResolved === 'string' ? fnResolved : '';
    }

    // N (Structured Name: family;given;middle;prefix;suffix)
    const nProp = card.get('n');
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

    return { firstName, lastName, displayName };
  }

  /**
   * Extract email addresses from vCard
   * @private
   */
  private extractEmailsFromVCard(card: vCard): Array<{ value: string; type?: string; primary?: boolean }> {
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

    return emails;
  }

  /**
   * Extract phone numbers from vCard
   * @private
   */
  private extractPhonesFromVCard(card: vCard): Array<{ value: string; type?: string; primary?: boolean }> {
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

    return phoneNumbers;
  }

  /**
   * Extract organization from vCard
   * @private
   */
  private extractOrgFromVCard(card: vCard): string | undefined {
    const orgProp = card.get('org');
    if (orgProp) {
      const orgValue = Array.isArray(orgProp) ? orgProp[0] : orgProp;
      const orgResolved = orgValue?.valueOf?.() ?? orgValue?.value ?? orgValue;
      const orgStr = typeof orgResolved === 'string' ? orgResolved : '';
      if (orgStr) {
        return orgStr.split(';')[0]?.trim() || undefined;
      }
    }
    return undefined;
  }

  /**
   * Extract simple text field from vCard
   * @private
   */
  private extractFieldFromVCard(card: vCard, fieldName: string): string | undefined {
    const prop = card.get(fieldName);
    if (prop) {
      const value = Array.isArray(prop) ? prop[0] : prop;
      const resolved = value?.valueOf?.() ?? value?.value ?? value;
      return typeof resolved === 'string' ? resolved : undefined;
    }
    return undefined;
  }

  /**
   * Extract birthday from vCard
   * @private
   */
  private extractBirthdayFromVCard(card: vCard): Date | undefined {
    const bdayProp = card.get('bday');
    if (bdayProp) {
      const bdayValue = Array.isArray(bdayProp) ? bdayProp[0] : bdayProp;
      const bdayResolved = bdayValue?.valueOf?.() ?? bdayValue?.value ?? bdayValue;
      const bdayStr = typeof bdayResolved === 'string' ? bdayResolved : '';
      if (bdayStr) {
        try {
          const birthday = new Date(bdayStr);
          if (!isNaN(birthday.getTime())) {
            return birthday;
          }
        } catch {
          // Invalid date format
        }
      }
    }
    return undefined;
  }
}
