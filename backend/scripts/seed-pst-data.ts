/**
 * Seed script: Import PST-extracted data into clean DB.
 * Creates tenant, user, provider, then imports emails, calendar events,
 * attachments, and contacts (extracted from email from/to/cc fields).
 *
 * Usage: cd backend && npx ts-node scripts/seed-pst-data.ts [tenantId]
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

const DATA_DIR = path.resolve(__dirname, '../../data/export');
const EMAIL_FILE = path.join(DATA_DIR, 'emails-last-1000.jsonl');
const CALENDAR_FILE = path.join(DATA_DIR, 'calendar-events.jsonl');
const ATTACHMENT_FILE = path.join(DATA_DIR, 'attachments.jsonl');

// User config — use existing tenant if provided via CLI arg, else create new
const EXISTING_TENANT_ID = process.argv[2] || '';
const USER_EMAIL = 'davide.marchetto@sacchi.it';
const USER_PASSWORD = 'Test1234!';
const USER_FIRST = 'Davide';
const USER_LAST = 'Marchetto';
const TENANT_SLUG = USER_EMAIL;
const TENANT_NAME = "Davide's Workspace";

async function readJsonl<T>(filePath: string): Promise<T[]> {
  if (!fs.existsSync(filePath)) {
    console.warn(`  File not found: ${filePath}`);
    return [];
  }
  const items: T[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, 'utf-8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) items.push(JSON.parse(line));
  }
  return items;
}

async function main() {
  console.log('=== PST Data Seed ===\n');

  // 1. Get or create tenant
  console.log('1. Setting up tenant...');
  let tenant;
  if (EXISTING_TENANT_ID) {
    tenant = await prisma.tenant.findUnique({ where: { id: EXISTING_TENANT_ID } });
    if (!tenant) throw new Error(`Tenant ${EXISTING_TENANT_ID} not found`);
    console.log(`   Using existing tenant: ${tenant.id} (${tenant.name})`);
  } else {
    tenant = await prisma.tenant.create({
      data: { slug: TENANT_SLUG, name: TENANT_NAME, isActive: true },
    });
    console.log(`   Created tenant: ${tenant.id} (${tenant.name})`);
  }

  // 1b. Clean old imported data for this tenant
  console.log('1b. Cleaning old data...');
  const delAtt = await prisma.emailAttachment.deleteMany({ where: { tenantId: tenant.id } });
  const delEmail = await prisma.email.deleteMany({ where: { tenantId: tenant.id } });
  const delCal = await prisma.calendarEvent.deleteMany({ where: { tenantId: tenant.id } });
  const delFolder = await prisma.folder.deleteMany({ where: { tenantId: tenant.id } });
  const delProvContact = await prisma.providerContact.deleteMany({ where: { tenantId: tenant.id } });
  const delContact = await prisma.contact.deleteMany({ where: { tenantId: tenant.id } });
  const delProvider = await prisma.providerConfig.deleteMany({ where: { tenantId: tenant.id } });
  console.log(`   Deleted: ${delEmail.count} emails, ${delAtt.count} attachments, ${delCal.count} events, ${delFolder.count} folders, ${delContact.count} contacts, ${delProvContact.count} prov-contacts, ${delProvider.count} providers`);

  // 2. Get or create user
  console.log('2. Setting up user...');
  let user = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: USER_EMAIL } });
  if (!user) {
    const passwordHash = await bcrypt.hash(USER_PASSWORD, 12);
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: USER_EMAIL,
        passwordHash,
        firstName: USER_FIRST,
        lastName: USER_LAST,
        role: 'admin',
        isActive: true,
        isMfaEnabled: false,
      },
    });
    console.log(`   Created user: ${user.id} (${user.email})`);
  } else {
    console.log(`   Using existing user: ${user.id} (${user.email})`);
  }

  // 3. Ensure user preferences exist
  const existingPrefs = await prisma.userPreferences.findUnique({ where: { userId: user.id } });
  if (!existingPrefs) {
    await prisma.userPreferences.create({ data: { userId: user.id, tenantId: tenant.id } });
  }

  // 4. Ensure legal acceptance exists
  console.log('3. Ensuring legal acceptance...');
  const existingLegal = await prisma.legalAcceptance.findFirst({ where: { userId: user.id, documentType: 'TOS' } });
  if (!existingLegal) {
    await prisma.legalAcceptance.createMany({
      data: [
        { userId: user.id, tenantId: tenant.id, documentType: 'TOS', documentVersion: '1.0' },
        { userId: user.id, tenantId: tenant.id, documentType: 'PRIVACY_POLICY', documentVersion: '1.0' },
      ],
    });
  }

  // 5. Create provider config (PST import, no real OAuth)
  console.log('4. Creating provider config...');
  const provider = await prisma.providerConfig.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      providerType: 'MICROSOFT',
      email: USER_EMAIL,
      displayName: `${USER_FIRST} ${USER_LAST}`,
      isActive: true,
      accessToken: 'pst-import-no-token',
      refreshToken: 'pst-import-no-token',
      tokenExpiresAt: new Date('2099-01-01'),
      scope: 'Mail.Read',
    },
  });
  console.log(`   Provider: ${provider.id}`);

  // 6. Ensure subscription (free tier)
  console.log('5. Ensuring subscription...');
  const existingSub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: 'FREE',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date('2099-01-01'),
      },
    });
  }

  // 7. Import emails
  console.log('6. Importing emails...');
  const emails = await readJsonl<Record<string, unknown>>(EMAIL_FILE);
  let emailCount = 0;
  const emailIdMap = new Map<string, string>(); // externalId -> db id

  for (const e of emails) {
    try {
      const created = await prisma.email.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          externalId: e.externalId as string,
          threadId: (e.threadId as string) || null,
          messageId: (e.messageId as string) || null,
          inReplyTo: (e.inReplyTo as string) || null,
          references: (e.references as string) || null,
          from: e.from as string,
          to: (e.to as string[]) || [],
          cc: (e.cc as string[]) || [],
          bcc: (e.bcc as string[]) || [],
          subject: (e.subject as string) || '(No subject)',
          bodyText: (e.bodyText as string) || null,
          bodyHtml: (e.bodyHtml as string) || null,
          snippet: (e.snippet as string) || null,
          folder: (e.folder as string) || 'INBOX',
          labels: (e.labels as string[]) || [],
          isRead: (e.isRead as boolean) ?? false,
          isStarred: (e.isStarred as boolean) ?? false,
          isFlagged: (e.isFlagged as boolean) ?? false,
          sentAt: new Date(e.sentAt as string),
          receivedAt: new Date(e.receivedAt as string),
          size: (e.size as number) || null,
          isBodyFetched: true,
        },
      });
      emailIdMap.set(e.externalId as string, created.id);
      emailCount++;
    } catch (err) {
      // Skip duplicates
      if ((err as { code?: string }).code !== 'P2002') {
        console.warn(`   Skip email ${e.externalId}: ${(err as Error).message?.slice(0, 80)}`);
      }
    }
  }
  console.log(`   Imported ${emailCount} emails`);

  // 8. Import attachments
  console.log('7. Importing attachments...');
  const attachments = await readJsonl<Record<string, unknown>>(ATTACHMENT_FILE);
  let attCount = 0;

  for (const a of attachments) {
    const emailId = emailIdMap.get(a.emailExternalId as string);
    if (!emailId) continue;

    try {
      await prisma.emailAttachment.create({
        data: {
          emailId,
          tenantId: tenant.id,
          filename: (a.filename as string) || 'unknown',
          mimeType: (a.mimeType as string) || 'application/octet-stream',
          size: (a.size as number) || 0,
          contentId: (a.contentId as string) || null,
          contentHash: (a.contentHash as string) || null,
          isInline: (a.isInline as boolean) ?? false,
          storagePath: (a.storagePath as string) || null,
        },
      });
      attCount++;
    } catch {
      // Skip duplicates
    }
  }
  console.log(`   Imported ${attCount} attachments`);

  // 9. Import calendar events
  console.log('8. Importing calendar events...');
  const calEvents = await readJsonl<Record<string, unknown>>(CALENDAR_FILE);
  let calCount = 0;

  for (const c of calEvents) {
    try {
      await prisma.calendarEvent.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          externalId: c.externalId as string,
          iCalUID: (c.iCalUID as string) || null,
          title: (c.title as string) || '(No title)',
          description: (c.description as string) || null,
          location: (c.location as string) || null,
          organizer: (c.organizer as string) || null,
          attendees: (c.attendees as object[]) || [],
          startTime: new Date(c.startTime as string),
          endTime: new Date(c.endTime as string),
          isAllDay: (c.isAllDay as boolean) ?? false,
          recurrence: (c.recurrence as string[]) || [],
          status: (c.status as string) || 'confirmed',
          visibility: (c.visibility as string) || 'default',
          isCancelled: (c.isCancelled as boolean) ?? false,
        },
      });
      calCount++;
    } catch {
      // Skip duplicates
    }
  }
  console.log(`   Imported ${calCount} calendar events`);

  // 10. Create folders from email data
  console.log('9. Creating folders...');
  const folderNames = [...new Set(emails.map((e) => e.folder as string))];
  let folderCount = 0;

  for (const folderPath of folderNames) {
    if (!folderPath) continue;
    try {
      await prisma.folder.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          name: folderPath.split('/').pop() || folderPath,
          path: folderPath,
          specialUse: folderPath.includes('Posta in arrivo') || folderPath.includes('Inbox')
            ? 'INBOX'
            : folderPath.includes('Posta inviata') || folderPath.includes('Sent')
              ? 'SENT'
              : folderPath.includes('eliminata') || folderPath.includes('Deleted') || folderPath.includes('Trash')
                ? 'TRASH'
                : folderPath.includes('Bozze') || folderPath.includes('Draft')
                  ? 'DRAFTS'
                  : null,
          isSystem: true,
          externalId: `pst-folder-${folderPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
        },
      });
      folderCount++;
    } catch {
      // Skip duplicates
    }
  }
  console.log(`   Created ${folderCount} folders`);

  // 11. Extract contacts from email from/to/cc fields
  console.log('10. Extracting contacts from emails...');
  const contactMap = new Map<string, { sent: number; received: number; lastSeen: Date }>();

  for (const e of emails) {
    const sentAt = new Date(e.sentAt as string);
    const from = e.from as string;
    if (from) {
      const existing = contactMap.get(from) || { sent: 0, received: 0, lastSeen: sentAt };
      existing.sent++;
      if (sentAt > existing.lastSeen) existing.lastSeen = sentAt;
      contactMap.set(from, existing);
    }
    for (const addr of [...((e.to as string[]) || []), ...((e.cc as string[]) || [])]) {
      if (!addr) continue;
      const existing = contactMap.get(addr) || { sent: 0, received: 0, lastSeen: sentAt };
      existing.received++;
      if (sentAt > existing.lastSeen) existing.lastSeen = sentAt;
      contactMap.set(addr, existing);
    }
  }

  let contactCount = 0;
  for (const [email, stats] of contactMap) {
    // Parse name from email: "davide.marchetto@sacchi.it" -> "Davide Marchetto"
    const localPart = email.split('@')[0] || '';
    const nameParts = localPart.split(/[._-]/).filter(Boolean);
    const firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase() : '';
    const lastName = nameParts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || email;
    const domain = email.split('@')[1] || '';
    const company = domain.includes('.') ? domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1) : '';

    try {
      await prisma.contact.create({
        data: {
          tenantId: tenant.id,
          displayName,
          firstName: firstName || null,
          lastName: lastName || null,
          emails: [{ value: email, type: 'work' }],
          company: company || null,
          sentCount: stats.sent,
          receivedCount: stats.received,
          totalInteractions: stats.sent + stats.received,
          lastInteractedAt: stats.lastSeen,
        },
      });
      contactCount++;
    } catch {
      // Skip duplicates
    }
  }
  console.log(`   Created ${contactCount} contacts from ${contactMap.size} unique addresses`);

  console.log('\n=== Seed Complete ===');
  console.log(`Login: ${USER_EMAIL} / ${USER_PASSWORD}`);
  console.log('MFA is disabled for this seed user.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
