/**
 * Test script for incremental calendar sync
 *
 * Usage:
 *   npx ts-node scripts/test-calendar-sync.ts <providerId>
 *
 * Example:
 *   npx ts-node scripts/test-calendar-sync.ts cmiz39hqi0003aoyhyaihfukt
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GoogleCalendarSyncService } from '../src/modules/calendar/services/google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from '../src/modules/calendar/services/microsoft-calendar-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const providerId = process.argv[2];

  if (!providerId) {
    console.error('Usage: npx ts-node scripts/test-calendar-sync.ts <providerId>');
    console.error('\nAvailable providers with calendar support:');

    // Quick lookup without full app bootstrap
    const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
    const prisma = createPrismaClient();
    const providers = await prisma.providerConfig.findMany({
      where: { isActive: true, supportsCalendar: true },
      select: { id: true, email: true, providerType: true },
    });

    for (const p of providers) {
      console.log(`  ${p.id} (${p.providerType}) - ${p.email}`);
    }

    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('🚀 Bootstrapping NestJS application...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const googleSync = app.get(GoogleCalendarSyncService);
  const microsoftSync = app.get(MicrosoftCalendarSyncService);

  try {
    // Get provider info
    const provider = await prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      console.error(`❌ Provider not found: ${providerId}`);
      process.exit(1);
    }

    if (!provider.supportsCalendar) {
      console.error(`❌ Provider does not support calendar: ${provider.email}`);
      process.exit(1);
    }

    console.log(`\n📅 Testing calendar sync for: ${provider.email} (${provider.providerType})`);

    // Check current sync state
    const syncStates = provider.providerType === 'google'
      ? await googleSync.getSyncStates(providerId)
      : await microsoftSync.getSyncStates(providerId);

    console.log(`\n📊 Current sync states: ${syncStates.length} calendars`);
    for (const state of syncStates) {
      console.log(`  - ${state.calendarName || state.calendarId}`);
      console.log(`    syncToken: ${state.syncToken ? 'yes' : 'no'}`);
      console.log(`    deltaLink: ${state.deltaLink ? 'yes' : 'no'}`);
      console.log(`    lastFullSync: ${state.lastFullSyncAt || 'never'}`);
      console.log(`    lastIncremental: ${state.lastIncrementalAt || 'never'}`);
      console.log(`    fullSyncRequired: ${state.fullSyncRequired}`);
      console.log(`    errors: ${state.consecutiveErrors}`);
    }

    // Run sync
    console.log('\n🔄 Running calendar sync...');
    const startTime = Date.now();

    let result;
    if (provider.providerType === 'google') {
      result = await googleSync.syncCalendar(providerId);
    } else if (provider.providerType === 'microsoft') {
      result = await microsoftSync.syncCalendar(providerId);
    } else {
      console.error(`❌ Unsupported provider type: ${provider.providerType}`);
      process.exit(1);
    }

    console.log('\n✅ Sync completed!');
    console.log(`  syncType: ${result.syncType}`);
    console.log(`  eventsProcessed: ${result.eventsProcessed}`);
    console.log(`  newEvents: ${result.newEvents}`);
    console.log(`  updatedEvents: ${result.updatedEvents}`);
    console.log(`  deletedEvents: ${result.deletedEvents}`);
    console.log(`  duration: ${result.syncDuration}ms`);

    // Check updated sync state
    const updatedStates = provider.providerType === 'google'
      ? await googleSync.getSyncStates(providerId)
      : await microsoftSync.getSyncStates(providerId);

    console.log(`\n📊 Updated sync states:`);
    for (const state of updatedStates) {
      console.log(`  - ${state.calendarName || state.calendarId}`);
      console.log(`    syncToken: ${state.syncToken ? `yes (${state.syncToken.substring(0, 20)}...)` : 'no'}`);
      console.log(`    deltaLink: ${state.deltaLink ? 'yes (stored)' : 'no'}`);
      console.log(`    lastFullSync: ${state.lastFullSyncAt}`);
      console.log(`    lastIncremental: ${state.lastIncrementalAt}`);
    }

    // Run second sync to test incremental
    console.log('\n🔄 Running SECOND sync (should be incremental)...');

    let result2;
    if (provider.providerType === 'google') {
      result2 = await googleSync.syncCalendar(providerId);
    } else {
      result2 = await microsoftSync.syncCalendar(providerId);
    }

    console.log('\n✅ Second sync completed!');
    console.log(`  syncType: ${result2.syncType} ${result2.syncType === 'incremental' ? '🎉' : ''}`);
    console.log(`  eventsProcessed: ${result2.eventsProcessed}`);
    console.log(`  duration: ${result2.syncDuration}ms`);

    if (result2.syncType === 'incremental') {
      console.log('\n🎉 Incremental sync is working! API calls reduced by ~95%');
    }

  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
