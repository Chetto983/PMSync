/**
 * Force Full Sync for All Folders
 *
 * Clears the lastSyncToken to force a FULL sync (not incremental).
 * This will trigger the new multi-folder sync that syncs:
 * INBOX, SENT, DRAFTS, TRASH, ARCHIVE
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GoogleSyncService } from '../src/modules/email-sync/services/gmail/google-sync.service';
import { MicrosoftSyncService } from '../src/modules/email-sync/services/microsoft/microsoft-sync.service';
import { ImapSyncService } from '../src/modules/email-sync/services/imap/imap-sync.service';
import type { SyncJobData } from '../src/modules/email-sync/interfaces/sync-job.interface';

const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

async function main() {
  console.log('🚀 Starting Force Full Sync for All Folders...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const googleSync = app.get(GoogleSyncService);
    const msSync = app.get(MicrosoftSyncService);
    const imapSync = app.get(ImapSyncService);

    // Get all providers for the tenant
    const providers = await prisma.providerConfig.findMany({
      where: { tenantId: TENANT_ID, isActive: true },
      select: {
        id: true,
        email: true,
        providerType: true,
        metadata: true,
      },
    });

    console.log(`Found ${providers.length} active providers:\n`);

    for (const provider of providers) {
      console.log(`\n========================================`);
      console.log(`Provider: ${provider.email} (${provider.providerType})`);
      console.log(`========================================\n`);

      // Get current sync token
      const metadata = (provider.metadata as Record<string, any>) || {};
      const currentToken = metadata.lastSyncToken;
      console.log(`Current lastSyncToken: ${currentToken ? currentToken.substring(0, 30) + '...' : 'NONE'}`);

      // Clear the sync token to force full sync
      console.log('Clearing lastSyncToken to force FULL sync...');
      await prisma.providerConfig.update({
        where: { id: provider.id },
        data: {
          metadata: {
            ...metadata,
            lastSyncToken: null,
          },
        },
      });
      console.log('✅ lastSyncToken cleared');

      // Trigger sync based on provider type
      console.log(`\nTriggering FULL sync for ${provider.providerType}...`);
      console.log('This will sync: INBOX, SENT, DRAFTS, TRASH, ARCHIVE\n');

      const jobData: SyncJobData = {
        providerId: provider.id,
        email: provider.email,
        syncType: 'full',
        tenantId: TENANT_ID,
        providerType: provider.providerType as 'google' | 'microsoft' | 'imap',
        priority: 'high',
      };

      try {
        if (provider.providerType === 'google') {
          const result = await googleSync.syncProvider(jobData);
          console.log(`✅ Google sync complete: ${result.messagesProcessed} messages, ${result.newMessages} new`);
        } else if (provider.providerType === 'microsoft') {
          const result = await msSync.syncProvider(jobData);
          console.log(`✅ Microsoft sync complete: ${result.messagesProcessed} messages, ${result.newMessages} new`);
        } else if (provider.providerType === 'imap') {
          const result = await imapSync.syncProvider(jobData);
          console.log(`✅ IMAP sync complete: ${result.messagesProcessed} messages, ${result.newMessages} new`);
        }
      } catch (syncError: any) {
        console.error(`❌ Sync failed: ${syncError.message}`);
        if (syncError.stack) {
          console.error(syncError.stack);
        }
      }
    }

    // Show email counts per folder
    console.log('\n\n========================================');
    console.log('EMAIL COUNTS BY FOLDER');
    console.log('========================================\n');

    const folderCounts = await prisma.$queryRaw<Array<{ folder: string; count: bigint }>>`
      SELECT folder, COUNT(*) as count
      FROM emails
      WHERE "tenantId" = ${TENANT_ID}
      GROUP BY folder
      ORDER BY count DESC
    `;

    for (const row of folderCounts) {
      console.log(`  ${row.folder}: ${row.count} emails`);
    }

    console.log('\n🏁 Done! Check the frontend Sent folder now.');

  } finally {
    await app.close();
  }
}

main().catch(console.error);
