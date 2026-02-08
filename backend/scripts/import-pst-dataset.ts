/**
 * Import PST-extracted JSONL into the database as a validation dataset.
 *
 * Creates:
 * 1. A "pst-import" ProviderConfig for the imported emails
 * 2. Email records mapped to the Prisma Email model
 * 3. Contact records from unique senders
 *
 * Usage:
 *   npx ts-node scripts/import-pst-dataset.ts [--dry-run] [--limit N]
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import * as crypto from 'crypto';

// ── Config ────────────────────────────────────────────────────────────────
const TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9'; // Davide's Workspace
const SACCHI_EMAIL = 'davide.marchetto@sacchi.it';
const JSONL_PATH = path.resolve(__dirname, '../../data/posta_extracted.jsonl');
const BATCH_SIZE = 50; // Prisma createMany batch size

interface PstEmail {
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  from: string;
  fromName: string;
  to: string[];
  cc: string[];
  bcc: string[];
  sentAt: string;
  receivedAt: string;
  messageId: string;
  inReplyTo: string;
  references: string;
  threadId: string;
  folder: string;
  isRead: boolean;
  isFlagged: boolean;
  isStarred: boolean;
  labels: string[];
  size: number;
  hasAttachments: boolean;
  attachmentCount: number;
  externalId: string;
  snippet: string;
}

function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `cm${timestamp}${random}`.substring(0, 25);
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  // "BIMA Moreno" -> firstName: Moreno, lastName: Bima
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };

  // Check if first part is ALL CAPS (surname first pattern)
  if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
    const lastName = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
    const firstName = parts.slice(1).map(p =>
      p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    ).join(' ');
    return { firstName, lastName };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

async function loadJsonl(filePath: string, limit: number): Promise<PstEmail[]> {
  const records: PstEmail[] = [];
  const stream = fs.createReadStream(filePath, 'utf8');
  const rl = readline.createInterface({ input: stream });

  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
    if (limit && records.length >= limit) break;
  }

  return records;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;

  console.log(`\n=== PST Dataset Import ===`);
  console.log(`JSONL:    ${JSONL_PATH}`);
  console.log(`Tenant:   ${TENANT_ID}`);
  console.log(`Dry run:  ${dryRun}`);
  console.log(`Limit:    ${limit || 'all'}\n`);

  if (!fs.existsSync(JSONL_PATH)) {
    console.error(`ERROR: ${JSONL_PATH} not found`);
    process.exit(1);
  }

  const prisma = createPrismaClient();

  try {
    // ── Step 1: Create or find PST import provider ──────────────────────
    console.log('[1/4] Setting up provider...');

    let provider = await prisma.providerConfig.findFirst({
      where: { tenantId: TENANT_ID, providerType: 'pst-import' },
    });

    if (!provider) {
      if (dryRun) {
        console.log('  [DRY RUN] Would create pst-import provider');
      } else {
        provider = await prisma.providerConfig.create({
          data: {
            tenantId: TENANT_ID,
            providerType: 'pst-import',
            email: SACCHI_EMAIL,
            displayName: 'Sacchi PST Import',
            supportsEmail: true,
            supportsCalendar: false,
            supportsContacts: false,
            isDefault: false,
            isActive: true,
            metadata: {
              source: 'outlook-pst',
              importDate: new Date().toISOString(),
              description: 'Real work emails from Sacchi Elettroforniture for AI validation',
            },
          },
        });
        console.log(`  Created provider: ${provider.id}`);
      }
    } else {
      console.log(`  Provider exists: ${provider.id}`);
    }

    const providerId = provider?.id || 'dry-run-provider-id';

    // ── Step 2: Load JSONL records ──────────────────────────────────────
    console.log('[2/4] Loading JSONL...');
    const records = await loadJsonl(JSONL_PATH, limit);
    console.log(`  Loaded ${records.length} records`);

    // ── Step 3: Import emails in batches ────────────────────────────────
    console.log('[3/4] Importing emails...');

    // Check for existing imports to avoid duplicates
    const existingCount = await prisma.email.count({
      where: { providerId },
    });
    if (existingCount > 0) {
      console.log(`  WARNING: ${existingCount} emails already imported for this provider.`);
      console.log(`  Skipping already-imported externalIds.`);
    }

    const existingIds = new Set<string>();
    if (existingCount > 0) {
      const existing = await prisma.email.findMany({
        where: { providerId },
        select: { externalId: true },
      });
      existing.forEach(e => existingIds.add(e.externalId));
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const emailData = [];

      for (const rec of batch) {
        if (existingIds.has(rec.externalId)) {
          skipped++;
          continue;
        }

        const id = generateCuid();

        emailData.push({
          id,
          tenantId: TENANT_ID,
          providerId,
          externalId: rec.externalId,
          threadId: rec.threadId || null,
          messageId: rec.messageId,
          inReplyTo: rec.inReplyTo || null,
          references: rec.references || null,
          from: rec.from,
          to: rec.to,
          cc: rec.cc || [],
          bcc: rec.bcc || [],
          subject: rec.subject || '(no subject)',
          bodyText: rec.bodyText || null,
          bodyHtml: rec.bodyHtml || null,
          snippet: rec.snippet || null,
          folder: rec.folder,
          labels: rec.labels || [],
          isRead: rec.isRead ?? true, // PST emails are already read
          isStarred: rec.isStarred ?? false,
          isFlagged: rec.isFlagged ?? false,
          isDraft: false,
          isDeleted: rec.folder === 'TRASH',
          isArchived: rec.folder === 'ARCHIVE',
          sentAt: new Date(rec.sentAt),
          receivedAt: new Date(rec.receivedAt),
          size: rec.size || 0,
          hasCalendarInvite: false,
          isBodyFetched: true, // We have the full body
          metadata: {
            importSource: 'pst-outlook',
            fromName: rec.fromName,
            hasAttachments: rec.hasAttachments,
            attachmentCount: rec.attachmentCount,
          },
        });
      }

      if (emailData.length > 0 && !dryRun) {
        try {
          await prisma.email.createMany({
            data: emailData,
            skipDuplicates: true,
          });
          imported += emailData.length;
        } catch (err: any) {
          // If batch fails, try one by one
          for (const email of emailData) {
            try {
              await prisma.email.create({ data: email });
              imported++;
            } catch (singleErr: any) {
              if (singleErr.code === 'P2002') {
                skipped++;
              } else {
                errors++;
                if (errors <= 3) {
                  console.error(`  Error on "${email.subject}": ${singleErr.message}`);
                }
              }
            }
          }
        }
      } else if (dryRun) {
        imported += emailData.length;
      }

      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= records.length) {
        console.log(`  ... ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} processed (${imported} imported, ${skipped} skipped)`);
      }
    }

    console.log(`  DONE: ${imported} imported, ${skipped} skipped, ${errors} errors`);

    // ── Step 4: Create contacts from unique senders ─────────────────────
    console.log('[4/4] Creating contacts from senders...');

    const senderMap = new Map<string, { email: string; name: string; count: number }>();
    for (const rec of records) {
      if (!rec.from || rec.from === SACCHI_EMAIL) continue;
      const key = rec.from.toLowerCase();
      const existing = senderMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        senderMap.set(key, { email: rec.from, name: rec.fromName || '', count: 1 });
      }
    }

    // Also collect recipients
    for (const rec of records) {
      for (const addr of [...rec.to, ...rec.cc]) {
        if (!addr || addr === SACCHI_EMAIL || !addr.includes('@')) continue;
        const key = addr.toLowerCase();
        if (!senderMap.has(key)) {
          senderMap.set(key, { email: addr, name: '', count: 1 });
        }
      }
    }

    console.log(`  Found ${senderMap.size} unique email addresses`);

    let contactsCreated = 0;
    let contactsSkipped = 0;

    for (const [, sender] of senderMap) {
      const { firstName, lastName } = parseName(sender.name);
      const displayName = sender.name || sender.email.split('@')[0];

      // Check if contact already exists by email string in JSON or by name
      const contactExists = await prisma.contact.findFirst({
        where: {
          tenantId: TENANT_ID,
          OR: [
            { emails: { string_contains: sender.email } },
            ...(sender.name ? [{ displayName: { equals: displayName, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: { id: true },
      });

      if (contactExists) {
        contactsSkipped++;
        continue;
      }

      if (!dryRun) {
        try {
          await prisma.contact.create({
            data: {
              tenantId: TENANT_ID,
              displayName,
              firstName: firstName || null,
              lastName: lastName || null,
              emails: [{ type: 'work', value: sender.email }],
              company: sender.email.includes('@sacchi.it') ? 'Sacchi Elettroforniture S.p.A.' : null,
              tags: ['pst-import'],
              metadata: {
                importSource: 'pst-outlook',
                emailCount: sender.count,
              },
            },
          });
          contactsCreated++;
        } catch (err: any) {
          if (err.code !== 'P2002') {
            contactsSkipped++;
          }
        }
      } else {
        contactsCreated++;
      }
    }

    console.log(`  Contacts: ${contactsCreated} created, ${contactsSkipped} skipped`);

    // ── Summary ─────────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  IMPORT SUMMARY ${dryRun ? '(DRY RUN)' : ''}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Provider:   ${providerId}`);
    console.log(`  Emails:     ${imported} imported, ${skipped} skipped, ${errors} errors`);
    console.log(`  Contacts:   ${contactsCreated} created, ${contactsSkipped} skipped`);

    if (!dryRun) {
      const totalEmails = await prisma.email.count({ where: { tenantId: TENANT_ID } });
      const totalContacts = await prisma.contact.count({ where: { tenantId: TENANT_ID } });
      console.log(`\n  DB totals:  ${totalEmails} emails, ${totalContacts} contacts`);
    }

    console.log(`\n  Next steps:`);
    console.log(`  1. Run embedding generation: POST /api/v1/ai/embeddings/backfill`);
    console.log(`  2. Run auto-triage:          POST /api/v1/ai/triage/backfill`);
    console.log(`  3. Test daily briefing:       GET /api/v1/voltagent/briefing`);
    console.log(`  4. Test RAG search:           POST /api/v1/voltagent/chat`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
