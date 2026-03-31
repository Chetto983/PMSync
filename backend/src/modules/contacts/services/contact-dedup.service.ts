/**
 * ContactDedupService - Duplicate detection and contact merging.
 *
 * Sprint 09 (T-0901): Addresses CON-H3, CON-L1, CON-L2.
 *
 * Detection strategy:
 * 1. Exact email match (primary dedup key)
 * 2. Fuzzy name match via PostgreSQL similarity() with threshold 0.6
 * 3. Phone number normalization + exact match
 *
 * Merge transfers all relations (provider links, deals, accounts, embeddings)
 * to the primary contact, then soft-deletes the secondary.
 */
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContactUpdatedEvent } from '../../../common/events/contact.events';
import type { ContactWithProviders, EmailAddress, PhoneNumber } from '../contacts.types';

/** How a duplicate was detected */
export type DuplicateMatchType = 'email_exact' | 'name_fuzzy' | 'phone_exact';

/** A candidate duplicate contact */
export interface DuplicateCandidate {
  contactId: string;
  displayName: string | null;
  emails: EmailAddress[] | null;
  phoneNumbers: PhoneNumber[] | null;
  matchType: DuplicateMatchType;
  /** 0-1 confidence score (1 = exact match) */
  confidence: number;
}

/** Field selections for merge — which contact's value to keep */
export interface MergeFieldSelections {
  firstName?: 'primary' | 'secondary';
  lastName?: 'primary' | 'secondary';
  displayName?: 'primary' | 'secondary';
  company?: 'primary' | 'secondary';
  jobTitle?: 'primary' | 'secondary';
  notes?: 'primary' | 'secondary';
  birthday?: 'primary' | 'secondary';
}

@Injectable()
export class ContactDedupService {
  private readonly logger = new Logger(ContactDedupService.name);

  /** Minimum similarity() threshold for fuzzy name matching */
  private readonly NAME_SIMILARITY_THRESHOLD = 0.6;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Find duplicate candidates for a given contact (or contact-like input).
   * Checks: exact email, fuzzy name, normalized phone.
   */
  async findDuplicates(
    tenantId: string,
    contact: {
      emails?: EmailAddress[] | null;
      phoneNumbers?: PhoneNumber[] | null;
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    },
    /** Exclude this contact ID from results (useful when checking an existing contact) */
    excludeContactId?: string,
  ): Promise<DuplicateCandidate[]> {
    const candidates = new Map<string, DuplicateCandidate>();

    // 1. Exact email match
    const emailValues = (contact.emails ?? []).map((e) => e.value.toLowerCase().trim()).filter(Boolean);
    if (emailValues.length > 0) {
      const emailDups = await this.prisma.$queryRaw<
        Array<{ id: string; displayName: string | null; emails: unknown; phoneNumbers: unknown }>
      >`
        SELECT c.id, c."displayName", c.emails, c."phoneNumbers"
        FROM "unified_contacts" c,
             jsonb_array_elements(c.emails) AS email_obj
        WHERE c."tenantId" = ${tenantId}
          AND c."isDeleted" = false
          ${excludeContactId ? Prisma.sql`AND c.id != ${excludeContactId}` : Prisma.empty}
          AND LOWER(email_obj->>'value') = ANY(${emailValues}::text[])
        GROUP BY c.id
      `;

      for (const row of emailDups) {
        candidates.set(row.id, {
          contactId: row.id,
          displayName: row.displayName,
          emails: row.emails as EmailAddress[] | null,
          phoneNumbers: row.phoneNumbers as PhoneNumber[] | null,
          matchType: 'email_exact',
          confidence: 1.0,
        });
      }
    }

    // 2. Fuzzy name match via pg_trgm similarity()
    const nameToMatch = contact.displayName
      || [contact.firstName, contact.lastName].filter(Boolean).join(' ')
      || null;

    if (nameToMatch && nameToMatch.trim().length >= 2) {
      const nameDups = await this.prisma.$queryRaw<
        Array<{ id: string; displayName: string | null; emails: unknown; phoneNumbers: unknown; sim: number }>
      >`
        SELECT c.id, c."displayName", c.emails, c."phoneNumbers",
               similarity(c."displayName", ${nameToMatch}) AS sim
        FROM "unified_contacts" c
        WHERE c."tenantId" = ${tenantId}
          AND c."isDeleted" = false
          ${excludeContactId ? Prisma.sql`AND c.id != ${excludeContactId}` : Prisma.empty}
          AND c."displayName" IS NOT NULL
          AND similarity(c."displayName", ${nameToMatch}) >= ${this.NAME_SIMILARITY_THRESHOLD}
        ORDER BY sim DESC
        LIMIT 10
      `;

      for (const row of nameDups) {
        if (!candidates.has(row.id)) {
          candidates.set(row.id, {
            contactId: row.id,
            displayName: row.displayName,
            emails: row.emails as EmailAddress[] | null,
            phoneNumbers: row.phoneNumbers as PhoneNumber[] | null,
            matchType: 'name_fuzzy',
            confidence: Number(row.sim),
          });
        }
      }
    }

    // 3. Phone number normalization + exact match
    const phoneValues = (contact.phoneNumbers ?? [])
      .map((p) => this.normalizePhone(p.value))
      .filter(Boolean);

    if (phoneValues.length > 0) {
      // Normalize stored phones on the fly and compare
      const phoneDups = await this.prisma.$queryRaw<
        Array<{ id: string; displayName: string | null; emails: unknown; phoneNumbers: unknown }>
      >`
        SELECT DISTINCT c.id, c."displayName", c.emails, c."phoneNumbers"
        FROM "unified_contacts" c,
             jsonb_array_elements(c."phoneNumbers") AS phone_obj
        WHERE c."tenantId" = ${tenantId}
          AND c."isDeleted" = false
          ${excludeContactId ? Prisma.sql`AND c.id != ${excludeContactId}` : Prisma.empty}
          AND regexp_replace(phone_obj->>'value', '[^0-9+]', '', 'g') = ANY(${phoneValues}::text[])
      `;

      for (const row of phoneDups) {
        if (!candidates.has(row.id)) {
          candidates.set(row.id, {
            contactId: row.id,
            displayName: row.displayName,
            emails: row.emails as EmailAddress[] | null,
            phoneNumbers: row.phoneNumbers as PhoneNumber[] | null,
            matchType: 'phone_exact',
            confidence: 0.9,
          });
        }
      }
    }

    return Array.from(candidates.values());
  }

  /**
   * Merge two contacts: keep the primary, transfer all relations from secondary,
   * then soft-delete the secondary contact.
   *
   * @param tenantId - Tenant scope
   * @param primaryId - Contact to keep
   * @param secondaryId - Contact to merge into primary (will be soft-deleted)
   * @param fieldSelections - Which contact's scalar fields to keep per field
   * @returns The updated primary contact
   */
  async mergeContacts(
    tenantId: string,
    primaryId: string,
    secondaryId: string,
    fieldSelections: MergeFieldSelections = {},
  ): Promise<ContactWithProviders> {
    if (primaryId === secondaryId) {
      throw new BadRequestException('Cannot merge a contact with itself');
    }

    // Load both contacts
    const [primary, secondary] = await Promise.all([
      this.prisma.contact.findFirst({
        where: { id: primaryId, tenantId, isDeleted: false },
        include: { providerContacts: true },
      }),
      this.prisma.contact.findFirst({
        where: { id: secondaryId, tenantId, isDeleted: false },
        include: { providerContacts: true },
      }),
    ]);

    if (!primary) throw new NotFoundException(`Primary contact ${primaryId} not found`);
    if (!secondary) throw new NotFoundException(`Secondary contact ${secondaryId} not found`);

    // Build merged scalar fields
    const mergedData = this.buildMergedFields(primary, secondary, fieldSelections);

    // Merge array fields (emails, phones, tags) — union with dedup
    const mergedEmails = this.mergeEmailArrays(
      primary.emails as EmailAddress[] | null,
      secondary.emails as EmailAddress[] | null,
    );
    const mergedPhones = this.mergePhoneArrays(
      primary.phoneNumbers as PhoneNumber[] | null,
      secondary.phoneNumbers as PhoneNumber[] | null,
    );
    const mergedTags = [...new Set([...(primary.tags ?? []), ...(secondary.tags ?? [])])];

    // Interaction stats: sum
    const mergedSentCount = (primary.sentCount ?? 0) + (secondary.sentCount ?? 0);
    const mergedReceivedCount = (primary.receivedCount ?? 0) + (secondary.receivedCount ?? 0);
    const mergedTotalInteractions = (primary.totalInteractions ?? 0) + (secondary.totalInteractions ?? 0);
    const mergedLastInteractedAt = this.latestDate(primary.lastInteractedAt, secondary.lastInteractedAt);

    // Execute all relation transfers + update + soft-delete in a single transaction
    await this.prisma.$transaction(async (tx) => {
      // Transfer provider contacts (re-point to primary)
      await tx.providerContact.updateMany({
        where: { contactId: secondaryId, tenantId },
        data: { contactId: primaryId },
      });

      // Transfer account associations
      // Delete duplicates first (same account+primary already linked)
      const existingAccountLinks = await tx.accountContact.findMany({
        where: { contactId: primaryId, tenantId },
        select: { accountId: true },
      });
      const existingAccountIds = new Set(existingAccountLinks.map((a) => a.accountId));

      await tx.accountContact.deleteMany({
        where: {
          contactId: secondaryId,
          tenantId,
          accountId: { in: Array.from(existingAccountIds) },
        },
      });
      await tx.accountContact.updateMany({
        where: { contactId: secondaryId, tenantId },
        data: { contactId: primaryId },
      });

      // Transfer deal associations (same pattern)
      const existingDealLinks = await tx.dealContact.findMany({
        where: { contactId: primaryId, tenantId },
        select: { dealId: true },
      });
      const existingDealIds = new Set(existingDealLinks.map((d) => d.dealId));

      await tx.dealContact.deleteMany({
        where: {
          contactId: secondaryId,
          tenantId,
          dealId: { in: Array.from(existingDealIds) },
        },
      });
      await tx.dealContact.updateMany({
        where: { contactId: secondaryId, tenantId },
        data: { contactId: primaryId },
      });

      // Transfer embeddings (tenantId stays the same, re-point contactId)
      await tx.embedding.updateMany({
        where: { contactId: secondaryId, tenantId },
        data: { contactId: primaryId },
      });

      // Update primary contact with merged data
      await tx.contact.update({
        where: { id_tenantId: { id: primaryId, tenantId } },
        data: {
          ...mergedData,
          emails: mergedEmails as unknown as Prisma.InputJsonValue,
          phoneNumbers: mergedPhones as unknown as Prisma.InputJsonValue,
          tags: mergedTags,
          sentCount: mergedSentCount,
          receivedCount: mergedReceivedCount,
          totalInteractions: mergedTotalInteractions,
          lastInteractedAt: mergedLastInteractedAt,
          updatedAt: new Date(),
        },
      });

      // Soft-delete secondary
      await tx.contact.update({
        where: { id_tenantId: { id: secondaryId, tenantId } },
        data: {
          isDeleted: true,
          metadata: {
            ...(secondary.metadata as Record<string, unknown> ?? {}),
            mergedInto: primaryId,
            mergedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
    });

    this.logger.log(`Merged contact ${secondaryId} into ${primaryId} for tenant ${tenantId}`);

    this.eventEmitter.emit(
      ContactUpdatedEvent.eventName,
      new ContactUpdatedEvent(tenantId, '', primaryId, ['merged'], new Date()),
    );

    // Return updated primary
    return this.prisma.contact.findFirstOrThrow({
      where: { id: primaryId, tenantId },
      include: {
        providerContacts: {
          select: {
            id: true,
            providerId: true,
            externalId: true,
            provider: { select: { id: true, email: true, providerType: true, displayName: true } },
          },
        },
      },
    }) as Promise<ContactWithProviders>;
  }

  // ── Private helpers ──────────────────────────────────────────────

  /** Strip non-digit chars (except leading +) for phone comparison */
  private normalizePhone(phone: string): string {
    if (!phone) return '';
    const stripped = phone.replace(/[^0-9+]/g, '');
    return stripped || '';
  }

  /** Pick the latest of two nullable dates */
  private latestDate(a: Date | null, b: Date | null): Date | null {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
  }

  /** Build merged scalar fields based on field selections */
  private buildMergedFields(
    primary: Record<string, unknown>,
    secondary: Record<string, unknown>,
    selections: MergeFieldSelections,
  ): Record<string, unknown> {
    const fields: (keyof MergeFieldSelections)[] = [
      'firstName', 'lastName', 'displayName', 'company', 'jobTitle', 'notes', 'birthday',
    ];
    const result: Record<string, unknown> = {};

    for (const field of fields) {
      const pick = selections[field] ?? 'primary';
      const value = pick === 'secondary' ? secondary[field] : primary[field];
      // Only include if we're overriding with secondary's value
      if (pick === 'secondary' && value !== undefined) {
        result[field] = value;
      }
    }

    return result;
  }

  /** Union-merge email arrays, dedup by lowercase value */
  private mergeEmailArrays(
    a: EmailAddress[] | null,
    b: EmailAddress[] | null,
  ): EmailAddress[] {
    const seen = new Set<string>();
    const merged: EmailAddress[] = [];

    for (const email of [...(a ?? []), ...(b ?? [])]) {
      const key = email.value.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(email);
      }
    }

    return merged;
  }

  /** Union-merge phone arrays, dedup by normalized value */
  private mergePhoneArrays(
    a: PhoneNumber[] | null,
    b: PhoneNumber[] | null,
  ): PhoneNumber[] {
    const seen = new Set<string>();
    const merged: PhoneNumber[] = [];

    for (const phone of [...(a ?? []), ...(b ?? [])]) {
      const key = this.normalizePhone(phone.value);
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(phone);
      }
    }

    return merged;
  }
}
