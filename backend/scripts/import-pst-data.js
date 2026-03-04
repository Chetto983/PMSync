/**
 * Import PST-extracted JSONL data into PostgreSQL
 * - Creates a ProviderConfig for PST import
 * - Imports emails, calendar events, attachments
 * - Extracts unique contacts from email addresses
 *
 * Run: cd backend && node scripts/import-pst-data.js
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.resolve(__dirname, '../../data/export');
const EMAILS_FILE = path.join(DATA_DIR, 'emails-last-500.jsonl');
const CALENDAR_FILE = path.join(DATA_DIR, 'calendar-events.jsonl');
const ATTACHMENTS_FILE = path.join(DATA_DIR, 'attachments.jsonl');

const TENANT_ID = 'cmm8zoftn0000rcyhu770d2ub';
const USER_ID = 'cmm8zofxp0002rcyh1h1fydvl'; // test@pmsync.local

async function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`  [SKIP] ${path.basename(filePath)} not found`);
    return [];
  }
  const lines = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, 'utf-8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) {
      try {
        lines.push(JSON.parse(trimmed));
      } catch {
        // skip malformed lines
      }
    }
  }
  return lines;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('=== PST Data Import ===\n');

    // 1. Create ProviderConfig for PST import
    console.log('1. Creating ProviderConfig...');
    let provider = await prisma.providerConfig.findFirst({
      where: { tenantId: TENANT_ID, providerType: 'pst-import' },
    });

    if (!provider) {
      provider = await prisma.providerConfig.create({
        data: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          providerType: 'pst-import',
          email: 'davide.marchetto@sacchi.it',
          displayName: 'PST Import - Outlook',
          supportsEmail: true,
          supportsCalendar: true,
          supportsContacts: true,
          isDefault: true,
          isActive: true,
        },
      });
      console.log(`  Created provider: ${provider.id}`);
    } else {
      console.log(`  Provider already exists: ${provider.id}`);
    }

    const providerId = provider.id;

    // 2. Import emails
    console.log('\n2. Importing emails...');
    const emails = await readJsonl(EMAILS_FILE);
    console.log(`  Read ${emails.length} emails from JSONL`);

    let emailsImported = 0;
    let emailsSkipped = 0;
    const emailIdMap = new Map(); // externalId -> dbId

    // Map folder names to standard names
    const folderMap = {
      'posta in arrivo': 'INBOX',
      'posta inviata': 'SENT',
      'posta eliminata': 'TRASH',
      'bozze': 'DRAFTS',
      'posta indesiderata': 'SPAM',
      'archivio': 'ARCHIVE',
      'inbox': 'INBOX',
      'sent': 'SENT',
      'sent items': 'SENT',
      'deleted items': 'TRASH',
      'trash': 'TRASH',
      'drafts': 'DRAFTS',
      'junk': 'SPAM',
      'spam': 'SPAM',
      'archive': 'ARCHIVE',
    };

    function normalizeFolder(rawFolder) {
      if (!rawFolder) return 'INBOX';
      // Get last segment
      const parts = rawFolder.split('/');
      const last = parts[parts.length - 1].toLowerCase().trim();
      return folderMap[last] || rawFolder;
    }

    // Batch in groups of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const operations = [];

      for (const e of batch) {
        if (!e.externalId || !e.from) continue;

        const folder = normalizeFolder(e.folder);
        const sentAt = e.sentAt ? new Date(e.sentAt) : new Date();
        const receivedAt = e.receivedAt ? new Date(e.receivedAt) : sentAt;

        try {
          operations.push(
            prisma.email.upsert({
              where: {
                providerId_externalId: {
                  providerId,
                  externalId: e.externalId,
                },
              },
              create: {
                tenantId: TENANT_ID,
                providerId,
                externalId: e.externalId,
                threadId: e.threadId || null,
                messageId: e.messageId || null,
                inReplyTo: e.inReplyTo || null,
                references: e.references || null,
                from: e.from,
                to: e.to || [],
                cc: e.cc || [],
                bcc: e.bcc || [],
                subject: e.subject || '(No subject)',
                bodyText: e.bodyText || null,
                bodyHtml: e.bodyHtml || null,
                snippet: e.snippet || null,
                folder,
                labels: e.labels || [],
                isRead: e.isRead ?? false,
                isStarred: e.isStarred ?? false,
                isFlagged: e.isFlagged ?? false,
                isDraft: folder === 'DRAFTS',
                isDeleted: folder === 'TRASH',
                sentAt,
                receivedAt,
                size: e.size || 0,
                isBodyFetched: true,
              },
              update: {}, // no-op on conflict
            })
          );
        } catch (err) {
          // skip individual errors
        }
      }

      if (operations.length > 0) {
        try {
          const results = await Promise.allSettled(operations);
          for (const r of results) {
            if (r.status === 'fulfilled') {
              emailsImported++;
              emailIdMap.set(r.value.externalId, r.value.id);
            } else {
              emailsSkipped++;
            }
          }
        } catch {
          emailsSkipped += operations.length;
        }
      }

      if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= emails.length) {
        console.log(`  ... ${Math.min(i + BATCH_SIZE, emails.length)}/${emails.length} processed (${emailsImported} imported, ${emailsSkipped} skipped)`);
      }
    }

    console.log(`  DONE: ${emailsImported} emails imported, ${emailsSkipped} skipped`);

    // If we don't have all IDs in map, fetch them
    if (emailIdMap.size < emailsImported) {
      console.log('  Fetching email ID map...');
      const allEmails = await prisma.email.findMany({
        where: { tenantId: TENANT_ID, providerId },
        select: { id: true, externalId: true },
      });
      for (const e of allEmails) {
        emailIdMap.set(e.externalId, e.id);
      }
    }

    // 3. Import attachments
    console.log('\n3. Importing attachments...');
    const attachments = await readJsonl(ATTACHMENTS_FILE);
    console.log(`  Read ${attachments.length} attachments from JSONL`);

    let attachImported = 0;
    let attachSkipped = 0;

    for (let i = 0; i < attachments.length; i += BATCH_SIZE) {
      const batch = attachments.slice(i, i + BATCH_SIZE);
      const ops = [];

      for (const a of batch) {
        const emailId = emailIdMap.get(a.emailExternalId);
        if (!emailId) {
          attachSkipped++;
          continue;
        }

        ops.push(
          prisma.emailAttachment.create({
            data: {
              tenantId: TENANT_ID,
              emailId,
              filename: a.filename || 'unknown',
              mimeType: a.mimeType || 'application/octet-stream',
              size: a.size || 0,
              contentId: a.contentId || null,
              contentHash: a.contentHash || null,
              isInline: a.isInline ?? false,
              storageType: 'local',
              storagePath: a.storagePath || null,
            },
          }).catch(() => { attachSkipped++; return null; })
        );
      }

      if (ops.length > 0) {
        const results = await Promise.all(ops);
        attachImported += results.filter(r => r !== null).length;
      }

      if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= attachments.length) {
        console.log(`  ... ${Math.min(i + BATCH_SIZE, attachments.length)}/${attachments.length} processed`);
      }
    }

    console.log(`  DONE: ${attachImported} attachments imported, ${attachSkipped} skipped`);

    // 4. Import calendar events
    console.log('\n4. Importing calendar events...');
    const events = await readJsonl(CALENDAR_FILE);
    console.log(`  Read ${events.length} events from JSONL`);

    let calImported = 0;
    let calSkipped = 0;

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      const ops = [];

      for (const ev of batch) {
        if (!ev.externalId || !ev.startTime || !ev.endTime) {
          calSkipped++;
          continue;
        }

        ops.push(
          prisma.calendarEvent.upsert({
            where: {
              providerId_externalId: {
                providerId,
                externalId: ev.externalId,
              },
            },
            create: {
              tenantId: TENANT_ID,
              providerId,
              externalId: ev.externalId,
              iCalUID: ev.iCalUID || null,
              title: ev.title || '(No title)',
              description: ev.description || null,
              location: ev.location || null,
              organizer: ev.organizer || null,
              attendees: ev.attendees || null,
              startTime: new Date(ev.startTime),
              endTime: new Date(ev.endTime),
              isAllDay: ev.isAllDay ?? false,
              recurrence: ev.recurrence || [],
              status: ev.status || 'confirmed',
              visibility: ev.visibility || 'default',
              isDeleted: false,
              isCancelled: ev.isCancelled ?? false,
              reminders: ev.reminders || null,
            },
            update: {},
          }).catch(() => { calSkipped++; return null; })
        );
      }

      if (ops.length > 0) {
        const results = await Promise.all(ops);
        calImported += results.filter(r => r !== null).length;
      }

      if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= events.length) {
        console.log(`  ... ${Math.min(i + BATCH_SIZE, events.length)}/${events.length} processed`);
      }
    }

    console.log(`  DONE: ${calImported} calendar events imported, ${calSkipped} skipped`);

    // 5. Extract contacts from email addresses
    console.log('\n5. Extracting contacts from emails...');
    const contactMap = new Map(); // email -> { displayName, sentCount, receivedCount }
    const myEmail = 'davide.marchetto@sacchi.it';

    for (const e of emails) {
      if (!e.from) continue;

      // Sender (received emails)
      const senderEmail = e.from.toLowerCase().trim();
      if (senderEmail && senderEmail !== myEmail) {
        if (!contactMap.has(senderEmail)) {
          contactMap.set(senderEmail, {
            email: senderEmail,
            displayName: e.fromName || senderEmail.split('@')[0],
            sentCount: 0,
            receivedCount: 0,
            lastDate: null,
          });
        }
        const c = contactMap.get(senderEmail);
        c.receivedCount++;
        const d = e.receivedAt ? new Date(e.receivedAt) : null;
        if (d && (!c.lastDate || d > c.lastDate)) c.lastDate = d;
      }

      // Recipients (sent emails)
      const allRecipients = [...(e.to || []), ...(e.cc || [])];
      for (const addr of allRecipients) {
        const recipEmail = addr.toLowerCase().trim();
        if (recipEmail && recipEmail !== myEmail) {
          if (!contactMap.has(recipEmail)) {
            contactMap.set(recipEmail, {
              email: recipEmail,
              displayName: recipEmail.split('@')[0],
              sentCount: 0,
              receivedCount: 0,
              lastDate: null,
            });
          }
          const c = contactMap.get(recipEmail);
          c.sentCount++;
          const d = e.sentAt ? new Date(e.sentAt) : null;
          if (d && (!c.lastDate || d > c.lastDate)) c.lastDate = d;
        }
      }
    }

    // Also extract from calendar attendees
    for (const ev of events) {
      if (!ev.attendees) continue;
      for (const att of ev.attendees) {
        if (!att.email) continue;
        const attEmail = att.email.toLowerCase().trim();
        if (attEmail && attEmail !== myEmail && !contactMap.has(attEmail)) {
          contactMap.set(attEmail, {
            email: attEmail,
            displayName: att.name || attEmail.split('@')[0],
            sentCount: 0,
            receivedCount: 0,
            lastDate: null,
          });
        }
      }
    }

    console.log(`  Found ${contactMap.size} unique contacts`);

    let contactsImported = 0;
    let contactsSkipped = 0;
    const contactEntries = Array.from(contactMap.values());

    for (let i = 0; i < contactEntries.length; i += BATCH_SIZE) {
      const batch = contactEntries.slice(i, i + BATCH_SIZE);
      const ops = [];

      for (const c of batch) {
        // Parse name
        let firstName = null;
        let lastName = null;
        if (c.displayName && c.displayName !== c.email.split('@')[0]) {
          const parts = c.displayName.split(' ').filter(Boolean);
          if (parts.length >= 2) {
            // LASTNAME Firstname format (Italian/European)
            if (parts[0] === parts[0].toUpperCase() && parts[0].length > 2) {
              lastName = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
              firstName = parts.slice(1).join(' ');
            } else {
              firstName = parts[0];
              lastName = parts.slice(1).join(' ');
            }
          } else {
            firstName = parts[0] || null;
          }
        }

        const company = c.email.includes('@sacchi.it') ? 'Sacchi S.p.A.' : null;

        ops.push(
          prisma.contact.create({
            data: {
              tenantId: TENANT_ID,
              displayName: c.displayName || c.email,
              firstName,
              lastName,
              emails: [{ value: c.email, type: 'work' }],
              company,
              tags: [],
              sentCount: c.sentCount,
              receivedCount: c.receivedCount,
              totalInteractions: c.sentCount + c.receivedCount,
              lastInteractedAt: c.lastDate || new Date(),
            },
          }).catch(() => { contactsSkipped++; return null; })
        );
      }

      if (ops.length > 0) {
        const results = await Promise.all(ops);
        contactsImported += results.filter(r => r !== null).length;
      }

      if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= contactEntries.length) {
        console.log(`  ... ${Math.min(i + BATCH_SIZE, contactEntries.length)}/${contactEntries.length} processed`);
      }
    }

    console.log(`  DONE: ${contactsImported} contacts imported, ${contactsSkipped} skipped`);

    // 6. Create folders
    console.log('\n6. Creating folders...');
    const folderNames = ['INBOX', 'SENT', 'TRASH', 'DRAFTS', 'SPAM', 'ARCHIVE'];
    const specialUseMap = {
      INBOX: '\\Inbox', SENT: '\\Sent', TRASH: '\\Trash',
      DRAFTS: '\\Drafts', SPAM: '\\Junk', ARCHIVE: '\\Archive',
    };

    for (const fname of folderNames) {
      try {
        await prisma.folder.upsert({
          where: { providerId_path: { providerId, path: fname } },
          create: {
            tenantId: TENANT_ID,
            providerId,
            name: fname,
            path: fname,
            specialUse: specialUseMap[fname] || null,
            isSystem: true,
          },
          update: {},
        });
      } catch {
        // skip
      }
    }
    console.log(`  Created ${folderNames.length} system folders`);

    // 7. Update folder counts
    console.log('\n7. Updating folder counts...');
    for (const fname of folderNames) {
      try {
        const total = await prisma.email.count({
          where: { tenantId: TENANT_ID, providerId, folder: fname },
        });
        const unread = await prisma.email.count({
          where: { tenantId: TENANT_ID, providerId, folder: fname, isRead: false },
        });
        await prisma.folder.update({
          where: { providerId_path: { providerId, path: fname } },
          data: { totalCount: total, unreadCount: unread },
        });
        if (total > 0) console.log(`  ${fname}: ${total} total, ${unread} unread`);
      } catch {
        // skip
      }
    }

    // Final summary
    const finalCounts = await Promise.all([
      prisma.email.count({ where: { tenantId: TENANT_ID } }),
      prisma.contact.count({ where: { tenantId: TENANT_ID } }),
      prisma.calendarEvent.count({ where: { tenantId: TENANT_ID } }),
      prisma.emailAttachment.count({ where: { tenantId: TENANT_ID } }),
    ]);

    console.log('\n========== IMPORT COMPLETE ==========');
    console.log(`Emails in DB:       ${finalCounts[0]}`);
    console.log(`Contacts in DB:     ${finalCounts[1]}`);
    console.log(`Calendar events:    ${finalCounts[2]}`);
    console.log(`Attachments:        ${finalCounts[3]}`);
    console.log('======================================');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Import failed:', e);
  process.exit(1);
});
