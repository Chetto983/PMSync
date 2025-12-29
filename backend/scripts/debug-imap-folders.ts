/**
 * Debug script to list IMAP folders and see what's being returned
 * This helps diagnose why folders aren't being synced correctly
 *
 * Usage: npx ts-node scripts/debug-imap-folders.ts
 */

import 'dotenv/config';
import * as crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { getConfiguration } from '../src/config/configuration';

const prisma = createPrismaClient();

// Simple decrypt function for the script
function decrypt(encrypted: string, ivHex: string): string {
  const config = getConfiguration();
  const secretKey = Buffer.from(config.encryption.aesSecretKey, 'base64');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function debugImapFolders() {
  console.log('\n=== IMAP Folder Debug Tool ===\n');

  // Get all IMAP providers from DB
  const providers = await prisma.providerConfig.findMany({
    where: {
      providerType: 'imap',
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      imapHost: true,
      imapPort: true,
      imapUseTls: true,
      imapUsername: true,
      imapPassword: true,
      imapEncryptionIv: true,
      displayName: true,
    },
  });

  console.log(`Found ${providers.length} IMAP provider(s)\n`);

  for (const provider of providers) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Provider: ${provider.displayName || provider.email}`);
    console.log(`Email: ${provider.email}`);
    console.log(`Host: ${provider.imapHost}:${provider.imapPort}`);
    console.log(`${'='.repeat(60)}\n`);

    if (!provider.imapHost || !provider.imapUsername || !provider.imapPassword || !provider.imapEncryptionIv) {
      console.log('  ERROR: Missing IMAP credentials');
      continue;
    }

    // Decrypt password
    const decryptedPassword = decrypt(provider.imapPassword, provider.imapEncryptionIv);

    // Create ImapFlow client
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
      console.log('  Connecting to IMAP server...');
      await client.connect();
      console.log('  Connected!\n');

      // Check capabilities
      console.log('  Server Capabilities:');
      if (client.capabilities) {
        const caps = Array.from(client.capabilities);
        console.log(`    ${caps.join(', ')}`);
        console.log(`    SPECIAL-USE: ${client.capabilities.has('SPECIAL-USE') ? 'YES' : 'NO'}`);
      }
      console.log('');

      // List all mailboxes
      console.log('  Listing Mailboxes (RAW):\n');
      const mailboxes = await client.list();

      for (const mb of mailboxes) {
        console.log(`  Mailbox: ${mb.path}`);
        console.log(`    - name: ${mb.name}`);
        console.log(`    - delimiter: ${mb.delimiter}`);
        console.log(`    - specialUse: ${mb.specialUse || 'NONE'}`);
        console.log(`    - flags: ${mb.flags ? Array.from(mb.flags).join(', ') : 'none'}`);
        console.log(`    - listed: ${mb.listed}`);
        console.log(`    - subscribed: ${mb.subscribed}`);
        console.log(`    - parentPath: ${mb.parentPath || 'none'}`);

        // Compute canonical type
        const canonicalType = computeCanonicalType(mb);
        console.log(`    -> CANONICAL TYPE: ${canonicalType}`);
        console.log('');
      }

      // Try to resolve specific folders
      console.log('\n  Folder Resolution Test:');
      const testFolders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'ARCHIVE', 'SPAM'];

      for (const canonical of testFolders) {
        const resolved = resolveFolder(mailboxes, canonical);
        console.log(`    ${canonical} -> ${resolved || 'NOT FOUND'}`);
      }

      await client.logout();
      console.log('\n  Disconnected from IMAP server.');

    } catch (error) {
      console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
    }
  }

  await prisma.$disconnect();
  console.log('\n=== Debug Complete ===\n');
}

/**
 * Compute canonical type from mailbox (same logic as imap.driver.ts)
 */
function computeCanonicalType(mailbox: any): string {
  const IMAP_SPECIAL_USE_TO_CANONICAL: Record<string, string> = {
    '\\Inbox': 'INBOX',
    '\\Sent': 'SENT',
    '\\Drafts': 'DRAFTS',
    '\\Trash': 'TRASH',
    '\\Junk': 'SPAM',
    '\\Archive': 'ARCHIVE',
    '\\Flagged': 'STARRED',
    '\\Important': 'IMPORTANT',
    '\\All': 'ARCHIVE',
  };

  const IMAP_NAME_HEURISTICS: Record<string, string> = {
    'inbox': 'INBOX',
    'sent': 'SENT',
    'sent items': 'SENT',
    'sent mail': 'SENT',
    'sent messages': 'SENT',
    'drafts': 'DRAFTS',
    'draft': 'DRAFTS',
    'trash': 'TRASH',
    'deleted': 'TRASH',
    'deleted items': 'TRASH',
    'deleted messages': 'TRASH',
    'bin': 'TRASH',
    'spam': 'SPAM',
    'junk': 'SPAM',
    'junk e-mail': 'SPAM',
    'junk email': 'SPAM',
    'bulk mail': 'SPAM',
    'archive': 'ARCHIVE',
    'archives': 'ARCHIVE',
    'all mail': 'ARCHIVE',
    'all': 'ARCHIVE',
    'important': 'IMPORTANT',
    'starred': 'STARRED',
    'flagged': 'STARRED',
    'outbox': 'SENT',
    // Italian
    'posta in arrivo': 'INBOX',
    'posta inviata': 'SENT',
    'inviata': 'SENT',
    'elementi inviati': 'SENT',
    'bozze': 'DRAFTS',
    'cestino': 'TRASH',
    'posta eliminata': 'TRASH',
    'eliminata': 'TRASH',
    'posta indesiderata': 'SPAM',
    'indesiderata': 'SPAM',
    'archivio': 'ARCHIVE',
    'archivia': 'ARCHIVE',
    'posta in uscita': 'OUTBOX',
  };

  // Start with path as type
  let type = mailbox.path;

  // Try RFC 6154 special-use first
  if (mailbox.specialUse) {
    const specialUse = Array.isArray(mailbox.specialUse)
      ? mailbox.specialUse[0]
      : mailbox.specialUse;
    const canonical = IMAP_SPECIAL_USE_TO_CANONICAL[specialUse];
    if (canonical) {
      return canonical;
    }
  }

  // INBOX is always INBOX
  if (mailbox.path.toUpperCase() === 'INBOX') {
    return 'INBOX';
  }

  // Try heuristic name matching
  const normalized = (mailbox.name || mailbox.path).toLowerCase().trim();
  const heuristic = IMAP_NAME_HEURISTICS[normalized];
  if (heuristic) {
    return heuristic;
  }

  return type.toUpperCase();
}

/**
 * Resolve canonical folder to IMAP path (same logic as imap.driver.ts)
 */
function resolveFolder(mailboxes: any[], canonicalOrPath: string): string | null {
  // If it looks like an IMAP path
  if (canonicalOrPath.includes('/') || canonicalOrPath !== canonicalOrPath.toUpperCase()) {
    return canonicalOrPath;
  }

  // Build folder list with canonical types
  const folders = mailboxes.map(mb => ({
    path: mb.path,
    name: mb.name,
    type: computeCanonicalType(mb),
  }));

  // Find by canonical type
  const folder = folders.find(f => f.type === canonicalOrPath);

  if (folder) {
    return folder.path;
  }

  return null;
}

// Run
debugImapFolders().catch(console.error);
