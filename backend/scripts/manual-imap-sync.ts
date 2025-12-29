/**
 * Manual IMAP Sync - directly calls the sync service
 * This bypasses the queue to see exactly what's happening
 *
 * Usage: npx ts-node scripts/manual-imap-sync.ts
 */

import 'dotenv/config';
import * as crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { getConfiguration } from '../src/config/configuration';
import { simpleParser } from 'mailparser';

const prisma = createPrismaClient();

function decrypt(encrypted: string, ivHex: string): string {
  const config = getConfiguration();
  const secretKey = Buffer.from(config.encryption.aesSecretKey, 'base64');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function manualSync() {
  console.log('\n=== Manual IMAP Sync ===\n');

  const provider = await prisma.providerConfig.findFirst({
    where: {
      providerType: 'imap',
      isActive: true,
    },
  });

  if (!provider) {
    console.log('No IMAP provider found');
    return;
  }

  console.log(`Provider: ${provider.displayName || provider.email}`);
  console.log(`ID: ${provider.id}`);
  console.log(`Last Sync: ${provider.lastSyncedAt || 'NEVER (will do full sync)'}`);

  if (!provider.imapHost || !provider.imapUsername || !provider.imapPassword || !provider.imapEncryptionIv) {
    console.log('ERROR: Missing IMAP credentials');
    return;
  }

  const decryptedPassword = decrypt(provider.imapPassword, provider.imapEncryptionIv);

  const client = new ImapFlow({
    host: provider.imapHost,
    port: provider.imapPort || 993,
    secure: provider.imapUseTls !== false,
    auth: {
      user: provider.imapUsername,
      pass: decryptedPassword,
    },
    logger: false,
  });

  try {
    console.log('\nConnecting...');
    await client.connect();
    console.log('Connected!\n');

    // Folders to sync
    const foldersToSync = [
      { canonical: 'INBOX', path: 'INBOX' },
      { canonical: 'SENT', path: 'outbox' },
      { canonical: 'DRAFTS', path: 'draft' },
      { canonical: 'TRASH', path: 'trash' },
    ];

    let totalSynced = 0;

    for (const folder of foldersToSync) {
      console.log(`\n--- Syncing ${folder.canonical} (${folder.path}) ---`);

      try {
        const lock = await client.getMailboxLock(folder.path);
        try {
          // Search for all messages
          const searchResult = await client.search({}, { uid: true });
          const uids = searchResult || [];
          console.log(`  Found ${uids.length} messages on server`);

          if (uids.length === 0) {
            console.log('  Skipping - no messages');
            continue;
          }

          // Fetch up to 50 messages
          const fetchUids = uids.slice(0, 50);
          console.log(`  Fetching ${fetchUids.length} messages...`);

          let syncedCount = 0;
          for await (const msg of client.fetch(fetchUids, {
            uid: true,
            envelope: true,
            flags: true,
            source: true,
          }, { uid: true })) {
            try {
              const envelope = msg.envelope || {};
              const flags = msg.flags || new Set<string>();

              // Parse full message for body
              let bodyText = '';
              let bodyHtml = '';
              if (msg.source) {
                const parsed = await simpleParser(msg.source);
                bodyText = parsed.text || '';
                bodyHtml = parsed.html || '';
              }

              // Build canonical message
              const messageId = `${folder.path}:${msg.uid}`;
              const from = envelope.from?.[0] || { address: 'unknown@unknown.com' };

              // Check if email exists
              const existingEmail = await prisma.email.findFirst({
                where: {
                  providerId: provider.id,
                  externalId: messageId,
                },
              });

              if (existingEmail) {
                console.log(`    UID ${msg.uid}: Already exists, skipping`);
                continue;
              }

              // Create email
              await prisma.email.create({
                data: {
                  tenantId: provider.tenantId,
                  providerId: provider.id,
                  externalId: messageId,
                  threadId: envelope.messageId || messageId,
                  messageId: envelope.messageId || undefined,
                  inReplyTo: envelope.inReplyTo || undefined,
                  from: from.address || 'unknown@unknown.com',
                  fromName: from.name || undefined,
                  to: JSON.stringify(envelope.to?.map((t: any) => t.address) || []),
                  cc: JSON.stringify(envelope.cc?.map((t: any) => t.address) || []),
                  subject: envelope.subject || '(no subject)',
                  snippet: (bodyText || bodyHtml || '').substring(0, 200),
                  bodyText: bodyText || undefined,
                  bodyHtml: bodyHtml || undefined,
                  folder: folder.canonical,
                  isRead: flags.has('\\Seen'),
                  isStarred: flags.has('\\Flagged'),
                  isDraft: flags.has('\\Draft'),
                  hasAttachments: false, // Simplified
                  receivedAt: envelope.date || new Date(),
                },
              });

              syncedCount++;
              console.log(`    UID ${msg.uid}: Synced "${envelope.subject?.substring(0, 40)}..."`);

            } catch (msgError) {
              console.log(`    UID ${msg.uid}: ERROR - ${msgError instanceof Error ? msgError.message : msgError}`);
            }
          }

          console.log(`  Synced ${syncedCount} new messages from ${folder.canonical}`);
          totalSynced += syncedCount;

        } finally {
          lock.release();
        }
      } catch (folderError) {
        console.log(`  ERROR: ${folderError instanceof Error ? folderError.message : folderError}`);
      }
    }

    // Update provider lastSyncedAt
    await prisma.providerConfig.update({
      where: { id: provider.id },
      data: { lastSyncedAt: new Date() },
    });

    console.log(`\n=== Sync Complete: ${totalSynced} new messages synced ===\n`);

    await client.logout();

  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

manualSync().catch(console.error);
