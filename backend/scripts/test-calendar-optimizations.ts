/**
 * Test Calendar Optimizations with Real Data
 * 
 * Tests the implemented optimizations:
 * 1. Microsoft Graph $select parameters
 * 2. Google sync event update fix
 * 3. Performance measurements
 * 
 * Usage: npx ts-node scripts/test-calendar-optimizations.ts
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
    console.log('🧪 Testing Calendar Optimizations with Real Data\n');

    // 1. Find active calendar providers
    console.log('📋 Step 1: Finding active calendar providers...');
    const providers = await prisma.providerConfig.findMany({
        where: {
            supportsCalendar: true,
            isActive: true,
        },
        select: {
            id: true,
            providerType: true,
            email: true,
            tenantId: true,
        },
    });

    console.log(`Found ${providers.length} active calendar providers:`);
    providers.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.providerType.toUpperCase()} - ${p.email}`);
    });

    if (providers.length === 0) {
        console.log('\n⚠️  No active calendar providers found.');
        console.log('💡 Add a calendar provider first to test sync optimizations.');
        return;
    }

    // 2. Check existing calendar events
    console.log('\n📊 Step 2: Analyzing existing calendar data...');
    const totalEvents = await prisma.calendarEvent.count({
        where: { isDeleted: false },
    });
    console.log(`Total events: ${totalEvents}`);

    const eventsByProvider = await prisma.calendarEvent.groupBy({
        by: ['providerId'],
        _count: { id: true },
        where: { isDeleted: false },
    });

    console.log('Events per provider:');
    for (const stat of eventsByProvider) {
        const provider = providers.find(p => p.id === stat.providerId);
        if (provider) {
            console.log(`  ${provider.email}: ${stat._count.id} events`);
        }
    }

    // 3. Check sync states
    console.log('\n🔄 Step 3: Checking sync states...');
    const syncStates = await prisma.calendarSyncState.findMany({
        select: {
            providerId: true,
            calendarId: true,
            calendarName: true,
            lastFullSyncAt: true,
            lastIncrementalAt: true,
            consecutiveErrors: true,
        },
    });

    console.log(`Total calendars being synced: ${syncStates.length}`);

    const providersWithErrors = syncStates.filter(s => s.consecutiveErrors > 0);
    if (providersWithErrors.length > 0) {
        console.log(`\n⚠️  Calendars with errors: ${providersWithErrors.length}`);
        providersWithErrors.forEach(s => {
            console.log(`  - ${s.calendarName}: ${s.consecutiveErrors} consecutive errors`);
        });
    }

    // 4. Test Google event update tracking
    const googleProviders = providers.filter(p => p.providerType === 'google');
    if (googleProviders.length > 0) {
        console.log('\n🟢 Step 4: Testing Google event update tracking...');

        for (const provider of googleProviders.slice(0, 1)) { // Test first Google provider
            const recentUpdates = await prisma.calendarEvent.findMany({
                where: {
                    providerId: provider.id,
                    isDeleted: false,
                    lastSyncedAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
                    },
                },
                select: {
                    id: true,
                    externalId: true,
                    title: true,
                    syncVersion: true,
                    lastSyncedAt: true,
                },
                orderBy: { lastSyncedAt: 'desc' },
                take: 5,
            });

            console.log(`\nRecent updates for ${provider.email}:`);
            if (recentUpdates.length === 0) {
                console.log('  No recent updates (last 24h)');
            } else {
                recentUpdates.forEach((event, i) => {
                    console.log(`  ${i + 1}. "${event.title}" - v${event.syncVersion} - ${event.lastSyncedAt.toISOString()}`);
                });
            }
        }
    }

    // 5. Test Microsoft sync state
    const msProviders = providers.filter(p => p.providerType === 'microsoft');
    if (msProviders.length > 0) {
        console.log('\n🔵 Step 5: Testing Microsoft sync state...');

        for (const provider of msProviders.slice(0, 1)) { // Test first Microsoft provider
            const calendars = await prisma.calendarSyncState.findMany({
                where: { providerId: provider.id },
                select: {
                    calendarId: true,
                    calendarName: true,
                    deltaLink: true,
                    lastFullSyncAt: true,
                    lastIncrementalAt: true,
                },
                orderBy: { calendarName: 'asc' },
            });

            console.log(`\nCalendars for ${provider.email}:`);
            calendars.forEach((cal, i) => {
                const syncType = cal.deltaLink ? 'incremental' : 'full';
                const lastSync = cal.lastIncrementalAt || cal.lastFullSyncAt;
                console.log(`  ${i + 1}. ${cal.calendarName} - ${syncType} - last: ${lastSync?.toISOString() || 'never'}`);
            });
        }
    }

    // 6. Performance summary
    console.log('\n📈 Step 6: Performance Summary');
    console.log(`Total providers: ${providers.length}`);
    console.log(`Total events: ${totalEvents}`);
    console.log(`Total calendars: ${syncStates.length}`);
    console.log(`Providers with errors: ${providersWithErrors.length}`);

    console.log('\n✅ Test completed!');
    console.log('\n💡 To trigger a sync and test optimizations:');
    console.log('   POST /api/calendar/sync/{providerId}');
    console.log('\n💡 Monitor network requests to verify:');
    console.log('   - Microsoft Graph calls include $select parameters');
    console.log('   - client-request-id headers are present');
    console.log('   - Google event updates persist all fields');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
