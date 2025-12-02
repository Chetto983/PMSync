/**
 * Trigger Sync Script
 * Directly invokes the sync service to refresh tokens and sync emails
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailSendService } from '../src/modules/email/services/email-send.service';
import { GmailSyncService } from '../src/modules/email-sync/services/gmail/gmail-sync.service';
import { MicrosoftSyncService } from '../src/modules/email-sync/services/microsoft/microsoft-sync.service';
import { ProviderConfigService } from '../src/modules/providers/services/provider-config.service';

const GOOGLE_PROVIDER_ID = 'cmi7m1nod0007yhj4lawfkjww';
const MS_PROVIDER_ID = 'cmi7m4qz907ydyhj4vwqdbnj5';
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';
const USER_ID = 'cmi321l3s0001yhukx7o8kjul';

const GOOGLE_EMAIL = 'dvdmarchetto@gmail.com';
const MS_EMAIL = 'chetto983@hotmail.it';

async function main() {
  console.log('🚀 Starting NestJS application...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const gmailSync = app.get(GmailSyncService);
    const msSync = app.get(MicrosoftSyncService);
    const emailSend = app.get(EmailSendService);
    const providerConfig = app.get(ProviderConfigService);

    // Check provider status
    console.log('=== PROVIDER STATUS ===\n');
    const googleProvider = await providerConfig.getProviderConfig(GOOGLE_PROVIDER_ID);
    const msProvider = await providerConfig.getProviderConfig(MS_PROVIDER_ID);

    console.log(`Google: ${googleProvider?.email}`);
    console.log(`  Token expires: ${googleProvider?.tokenExpiresAt}`);
    console.log(`Microsoft: ${msProvider?.email}`);
    console.log(`  Token expires: ${msProvider?.tokenExpiresAt}`);

    // Trigger Google sync (will refresh token if needed)
    console.log('\n=== SYNCING GOOGLE ===\n');
    try {
      await gmailSync.syncEmails(TENANT_ID, GOOGLE_PROVIDER_ID);
      console.log('✅ Google sync completed');
    } catch (err: any) {
      console.error('❌ Google sync error:', err.message);
    }

    // Trigger Microsoft sync (will refresh token if needed)
    console.log('\n=== SYNCING MICROSOFT ===\n');
    try {
      await msSync.syncEmails(TENANT_ID, MS_PROVIDER_ID);
      console.log('✅ Microsoft sync completed');
    } catch (err: any) {
      console.error('❌ Microsoft sync error:', err.message);
    }

    // Send test email from Google to Microsoft
    console.log('\n=== SENDING TEST EMAIL: GOOGLE -> MICROSOFT ===\n');
    const timestamp = Date.now();
    try {
      const result = await emailSend.sendEmail({
        tenantId: TENANT_ID,
        userId: USER_ID,
        providerId: GOOGLE_PROVIDER_ID,
        to: [MS_EMAIL],
        subject: `Bidirectional Test G->M ${timestamp}`,
        bodyText: `Test email from Google to Microsoft at ${new Date().toISOString()}`,
        bodyHtml: `<p>Test email from Google to Microsoft at ${new Date().toISOString()}</p>`,
      });
      console.log('✅ Email sent from Google:', result);
    } catch (err: any) {
      console.error('❌ Send error:', err.message);
    }

    // Send test email from Microsoft to Google
    console.log('\n=== SENDING TEST EMAIL: MICROSOFT -> GOOGLE ===\n');
    try {
      const result = await emailSend.sendEmail({
        tenantId: TENANT_ID,
        userId: USER_ID,
        providerId: MS_PROVIDER_ID,
        to: [GOOGLE_EMAIL],
        subject: `Bidirectional Test M->G ${timestamp}`,
        bodyText: `Test email from Microsoft to Google at ${new Date().toISOString()}`,
        bodyHtml: `<p>Test email from Microsoft to Google at ${new Date().toISOString()}</p>`,
      });
      console.log('✅ Email sent from Microsoft:', result);
    } catch (err: any) {
      console.error('❌ Send error:', err.message);
    }

    // Wait and sync again to receive the emails
    console.log('\n⏳ Waiting 10 seconds for emails to propagate...\n');
    await new Promise((r) => setTimeout(r, 10000));

    // Sync both providers again to receive the test emails
    console.log('=== FINAL SYNC ===\n');
    try {
      await gmailSync.syncEmails(TENANT_ID, GOOGLE_PROVIDER_ID);
      console.log('✅ Final Google sync completed');
    } catch (err: any) {
      console.error('❌ Final Google sync error:', err.message);
    }

    try {
      await msSync.syncEmails(TENANT_ID, MS_PROVIDER_ID);
      console.log('✅ Final Microsoft sync completed');
    } catch (err: any) {
      console.error('❌ Final Microsoft sync error:', err.message);
    }

    console.log('\n🏁 Done! Check the database for new emails.');
  } finally {
    await app.close();
  }
}

main().catch(console.error);
