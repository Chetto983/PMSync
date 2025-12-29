/**
 * Test script to trigger IMAP sync and see what's happening
 * This helps debug why IMAP folders aren't syncing
 *
 * Usage: npx ts-node scripts/test-imap-sync.ts
 */

import 'dotenv/config';
import * as crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { getConfiguration } from '../src/config/configuration';

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

async function testImapSync() {
  console.log('\n=== IMAP Sync Test ===\n');

  // Get IMAP providers
  const providers = await prisma.providerConfig.findMany({
    where: {
      providerType: 'imap',
      isActive: true,
    },
  });

  console.log(`Found ${providers.length} IMAP provider(s)\n`);

  for (const provider of providers) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Provider: ${provider.displayName || provider.email}`);
    console.log(`ID: ${provider.id}`);
    console.log(`Last Sync: ${provider.lastSyncedAt || 'NEVER'}`);
    console.log(`${'='.repeat(60)}\n`);

    // Check emails in DB for this provider
    const emailCounts = await prisma.email.groupBy({
      by: ['folder'],
      where: { providerId: provider.id },
      _count: true,
    });

    console.log('  Emails in DB by folder:');
    if (emailCounts.length === 0) {
      console.log('    (no emails)');
    } else {
      for (const item of emailCounts) {
        console.log(`    ${item.folder}: ${item._count} emails`);
      }
    }

    // Connect to IMAP and check actual mailbox counts
    if (!provider.imapHost || !provider.imapUsername || !provider.imapPassword || !provider.imapEncryptionIv) {
      console.log('\n  ERROR: Missing IMAP credentials');
      continue;
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
      console.log('\n  Connecting to IMAP server...');
      await client.connect();
      console.log('  Connected!\n');

      // Check actual message counts on server
      const foldersToCheck = [
        { canonical: 'INBOX', path: 'INBOX' },
        { canonical: 'SENT', path: 'outbox' },
        { canonical: 'DRAFTS', path: 'draft' },
        { canonical: 'TRASH', path: 'trash' },
        { canonical: 'SPAM', path: 'Spam' },
      ];

      console.log('  Message counts on IMAP server:');
      for (const folder of foldersToCheck) {
        try {
          const status = await client.status(folder.path, { messages: true, unseen: true });
          console.log(`    ${folder.canonical} (${folder.path}): ${status.messages} messages (${status.unseen} unread)`);
        } catch (err) {
          console.log(`    ${folder.canonical} (${folder.path}): ERROR - ${err instanceof Error ? err.message : err}`);
        }
      }

      // Try to list messages from SENT folder
      console.log('\n  Testing listMessages for SENT (outbox):');
      try {
        const lock = await client.getMailboxLock('outbox');
        try {
          const searchResult = await client.search({}, { uid: true });
          const uids = searchResult || [];
          console.log(`    Found ${uids.length} messages in outbox`);

          if (uids.length > 0) {
            // Fetch first 3 messages to see content
            const fetchUids = uids.slice(0, 3);
            console.log(`    Fetching first ${fetchUids.length} messages...`);

            for await (const msg of client.fetch(fetchUids, { envelope: true, uid: true })) {
              console.log(`      UID ${msg.uid}: ${msg.envelope?.subject || '(no subject)'} from ${msg.envelope?.from?.[0]?.address}`);
            }
          }
        } finally {
          lock.release();
        }
      } catch (err) {
        console.log(`    ERROR: ${err instanceof Error ? err.message : err}`);
      }

      await client.logout();
      console.log('\n  Disconnected from IMAP server.');

    } catch (error) {
      console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
    }
  }

  await prisma.$disconnect();
  console.log('\n=== Test Complete ===\n');
}

testImapSync().catch(console.error);
