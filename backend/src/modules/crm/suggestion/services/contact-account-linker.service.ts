import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CrmSuggestionService } from './crm-suggestion.service';

/**
 * ContactAccountLinkerService — links contacts to CRM accounts by email domain.
 *
 * Runs once on deploy (scans all unlinked contacts) and can be triggered
 * for individual contacts on creation.
 *
 * Level 1 matches (exact domain → single account) are auto-accepted.
 * Ambiguous matches create pending suggestions.
 */
@Injectable()
export class ContactAccountLinkerService implements OnModuleInit {
  private readonly logger = new Logger(ContactAccountLinkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suggestionService: CrmSuggestionService,
  ) {}

  async onModuleInit() {
    // Run initial scan in background (don't block startup)
    this.scanUnlinkedContacts().catch((err) =>
      this.logger.warn(
        `Initial contact-account scan failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  /**
   * Scan all contacts that have no CRM account link.
   * For each, try to find a matching account by email domain.
   */
  async scanUnlinkedContacts(): Promise<{ processed: number; linked: number }> {
    // Find contacts without any account link
    const contacts = await this.prisma.$queryRaw<
      Array<{ id: string; tenantId: string; emails: Array<{ value: string }> }>
    >`
      SELECT c.id, c."tenantId", c.emails
      FROM "unified_contacts" c
      WHERE c."isDeleted" = false
        AND c.emails IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "crm_account_contacts" ac
          WHERE ac."contactId" = c.id AND ac."tenantId" = c."tenantId"
        )
      LIMIT 500
    `;

    let linked = 0;

    for (const contact of contacts) {
      const domains = this.extractDomains(contact.emails);
      for (const domain of domains) {
        const didLink = await this.tryLinkByDomain(
          contact.tenantId,
          contact.id,
          domain,
        );
        if (didLink) {
          linked++;
          break; // One link per contact
        }
      }
    }

    this.logger.log(
      `Contact-account scan: ${contacts.length} processed, ${linked} linked`,
    );
    return { processed: contacts.length, linked };
  }

  /**
   * Try to link a single contact to an account (called on new contact creation).
   */
  async linkContact(tenantId: string, contactId: string): Promise<void> {
    const contact = await this.prisma.$queryRaw<
      Array<{ emails: Array<{ value: string }> }>
    >`
      SELECT emails FROM "unified_contacts"
      WHERE id = ${contactId} AND "tenantId" = ${tenantId}
        AND "isDeleted" = false AND emails IS NOT NULL
      LIMIT 1
    `;

    if (!contact.length || !contact[0].emails) return;

    const domains = this.extractDomains(contact[0].emails);
    for (const domain of domains) {
      const didLink = await this.tryLinkByDomain(tenantId, contactId, domain);
      if (didLink) break;
    }
  }

  // ---- Private ----

  private async tryLinkByDomain(
    tenantId: string,
    contactId: string,
    domain: string,
  ): Promise<boolean> {
    // Find CRM accounts matching this domain
    const accounts = await this.prisma.crmAccount.findMany({
      where: { tenantId, website: domain, deletedAt: null },
      select: { id: true },
      take: 2, // Only need to know if 1 or >1
    });

    if (accounts.length === 0) return false;

    if (accounts.length === 1) {
      // Level 1: exact single match → auto-accept
      await this.prisma.accountContact.upsert({
        where: {
          accountId_contactId_tenantId: {
            accountId: accounts[0].id,
            contactId,
            tenantId,
          },
        },
        update: {},
        create: {
          accountId: accounts[0].id,
          contactId,
          tenantId,
        },
      });

      this.logger.debug(
        `Auto-linked contact ${contactId} to account ${accounts[0].id}`,
      );
      return true;
    }

    // Ambiguous: multiple accounts for same domain → create suggestion
    await this.suggestionService.create(tenantId, {
      type: 'link',
      entityData: {
        contactId,
        accountId: accounts[0].id, // Default to first match
        domain,
        ambiguous: true,
      },
      sourceType: 'contact_linker',
      confidence: 0.5,
    });

    return false;
  }

  private extractDomains(
    emails: Array<{ value: string }>,
  ): string[] {
    const domains = new Set<string>();
    for (const e of emails) {
      const match = e.value?.match(/@([^>\s]+)/);
      if (match) {
        domains.add(match[1].toLowerCase());
      }
    }
    return [...domains];
  }
}
