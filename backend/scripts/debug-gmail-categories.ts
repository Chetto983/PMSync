/**
 * debug-gmail-categories.ts
 *
 * Diagnoses why Gmail category folders (Social, Promotions, Updates, Forums)
 * are missing from the DB.
 *
 *  1. Reads + decrypts access token from DB
 *  2. Calls Gmail labels.list API
 *  3. Shows which CATEGORY_* labels Gmail returns
 *  4. Shows what's currently in the folders table
 *  5. With --fix: upserts missing category folder rows directly
 *
 * Usage:
 *   npx ts-node scripts/debug-gmail-categories.ts
 *   npx ts-node scripts/debug-gmail-categories.ts --fix
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import * as crypto from 'crypto';
import { google } from 'googleapis';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const FIX = process.argv.includes('--fix');

// ── Crypto (mirrors CryptoService) ───────────────────────────────────────────
function decryptGcm(encrypted: string, ivHex: string): string {
  const key = Buffer.from(process.env.AES_SECRET_KEY!, 'base64');
  const withoutPrefix = encrypted.slice('gcm:'.length); // strip "gcm:"
  const lastColon = withoutPrefix.lastIndexOf(':');
  const ciphertextHex = withoutPrefix.slice(0, lastColon);
  const authTagHex = withoutPrefix.slice(lastColon + 1);

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let out = decipher.update(ciphertextHex, 'hex', 'utf8');
  out += decipher.final('utf8');
  return out;
}

// ── Category map (mirrors GmailFolderService.labelIdToFolderPath) ─────────────
const CATEGORY_TO_PATH: Record<string, string> = {
  CATEGORY_PERSONAL: 'INBOX',
  CATEGORY_SOCIAL: 'SOCIAL',
  CATEGORY_PROMOTIONS: 'PROMOTIONS',
  CATEGORY_UPDATES: 'UPDATES',
  CATEGORY_FORUMS: 'FORUMS',
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.AES_SECRET_KEY) throw new Error('AES_SECRET_KEY not set');

  const prisma = createPrismaClient();

  type ProviderRow = {
    id: string;
    email: string;
    tenantId: string;
    accessToken: string | null;
    tokenEncryptionIv: string | null;
    refreshToken: string | null;
    refreshTokenEncryptionIv: string | null;
  };

  const providers = await prisma.$queryRawUnsafe<ProviderRow[]>(
    `SELECT id, email, "tenantId", "accessToken", "tokenEncryptionIv",
            "refreshToken", "refreshTokenEncryptionIv"
       FROM provider_configs
      WHERE "providerType" = 'google' AND "isActive" = true
      ORDER BY "createdAt"`,
  );

  if (!providers.length) {
    console.log('No active Google providers found.');
    await prisma.$disconnect();
    return;
  }

  for (const prov of providers) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Provider: ${prov.email}  (id: ${prov.id})`);
    console.log('='.repeat(60));

    // Decrypt access token
    let accessToken: string | null = null;
    try {
      if (prov.accessToken && prov.tokenEncryptionIv) {
        accessToken = decryptGcm(prov.accessToken, prov.tokenEncryptionIv);
      }
    } catch (e) {
      console.error('  ✗ Failed to decrypt access token:', (e as Error).message);
    }

    if (!accessToken) {
      console.log('  ✗ No decryptable access token — skipping');
      continue;
    }

    // Try Gmail API
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2.setCredentials({ access_token: accessToken });

    // Attempt refresh if needed
    if (prov.refreshToken && prov.refreshTokenEncryptionIv) {
      try {
        const rt = decryptGcm(prov.refreshToken, prov.refreshTokenEncryptionIv);
        oauth2.setCredentials({ access_token: accessToken, refresh_token: rt });
      } catch {
        // ignore refresh token decrypt failures
      }
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let labels: any[] = [];
    try {
      const resp = await gmail.users.labels.list({ userId: 'me' });
      labels = resp.data.labels ?? [];
    } catch (e) {
      console.error('  ✗ Gmail API error:', (e as Error).message);
      console.log('  → Token may be expired. Try re-syncing or re-authorising in the app first.');
      continue;
    }

    console.log(`\n📬 Gmail returned ${labels.length} labels`);

    // CATEGORY labels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catLabels = labels.filter((l: any) => l.id?.startsWith('CATEGORY_'));
    console.log(`\n📂 CATEGORY_* labels (${catLabels.length}):`);
    if (!catLabels.length) {
      console.log('  ⚠  NONE — inbox tabs may be disabled in Gmail settings');
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const l of catLabels) {
        console.log(
          `  • ${l.id}  name="${l.name}"  total=${l.messagesTotal ?? '?'}  unread=${l.messagesUnread ?? '?'}`,
        );
      }
    }

    // All system labels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sysLabels = labels.filter((l: any) => l.type === 'system');
    console.log(`\n🔧 All system labels (${sysLabels.length}):`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of sysLabels) {
      console.log(`  • ${l.id}  name="${l.name}"`);
    }

    // DB folders
    type FolderRow = { path: string; name: string; specialUse: string | null; isSystem: boolean };
    const dbFolders = await prisma.$queryRawUnsafe<FolderRow[]>(
      `SELECT path, name, "specialUse", "isSystem"
         FROM folders
        WHERE "providerId" = $1
        ORDER BY path`,
      prov.id,
    );
    console.log(`\n🗄  DB folders (${dbFolders.length}):`);
    for (const f of dbFolders) {
      console.log(`  • ${f.path}  name="${f.name}"  specialUse=${f.specialUse}`);
    }

    // Diff
    const dbPaths = new Set(dbFolders.map((f) => f.path));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const missing = catLabels.filter((l: any) => {
      const p = CATEGORY_TO_PATH[l.id as string];
      return p && p !== 'INBOX' && !dbPaths.has(p);
    });

    if (!missing.length) {
      console.log('\n✅ All expected category paths present in DB');
    } else {
      console.log(`\n❌ Missing from DB (${missing.length}):`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      missing.forEach((l: any) =>
        console.log(`  • ${l.id}  →  path "${CATEGORY_TO_PATH[l.id as string]}"`),
      );
    }

    // --fix: directly upsert missing rows
    if (FIX && missing.length) {
      console.log('\n🔧 --fix: upserting missing category folders...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const l of missing) {
        const p = CATEGORY_TO_PATH[l.id as string];
        await prisma.$queryRawUnsafe(
          `INSERT INTO folders (
              id, "tenantId", "providerId", path, "externalId", name,
              delimiter, "specialUse", "isSystem", "isSelectable",
              "totalCount", "unreadCount", level, "createdAt", "updatedAt", "lastSyncedAt"
            ) VALUES (
              gen_random_uuid(), $1::text, $2::text, $3::text, $4::text, $5::text,
              '/', $6::text, true, true,
              $7::int, $8::int, 0, now(), now(), now()
            )
            ON CONFLICT ("providerId", path) DO UPDATE SET
              name           = EXCLUDED.name,
              "externalId"   = EXCLUDED."externalId",
              "specialUse"   = EXCLUDED."specialUse",
              "isSystem"     = true,
              "totalCount"   = EXCLUDED."totalCount",
              "unreadCount"  = EXCLUDED."unreadCount",
              "lastSyncedAt" = now(),
              "updatedAt"    = now()`,
          prov.tenantId,
          prov.id,
          p,
          l.id,
          l.name ?? l.id,
          l.id,
          l.messagesTotal ?? 0,
          l.messagesUnread ?? 0,
        );
        console.log(`  ✓ Upserted: path="${p}"  (${l.id})`);
      }
      console.log('\nDone. Re-run without --fix to verify.');
    } else if (FIX) {
      console.log('\n✅ Nothing to fix.');
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
