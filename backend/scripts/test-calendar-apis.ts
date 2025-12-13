/**
 * Calendar API Comprehensive Test Script
 *
 * Tests all calendar endpoints with real providers to validate:
 * - BaseCalendarProvider refactoring
 * - GoogleCalendarProvider functionality
 * - MicrosoftCalendarProvider functionality
 * - Calendar CRUD operations
 * - Event CRUD operations
 * - Sync operations
 *
 * Usage: npx ts-node scripts/test-calendar-apis.ts
 */

import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000/api';
const prisma = new PrismaClient();

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  data?: any;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  fn: () => Promise<any>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    const data = await fn();
    const result: TestResult = {
      name,
      status: 'PASS',
      duration: Date.now() - start,
      data,
    };
    results.push(result);
    console.log(`  ✅ ${name}: PASS (${result.duration}ms)`);
    return result;
  } catch (error: any) {
    const result: TestResult = {
      name,
      status: 'FAIL',
      duration: Date.now() - start,
      error: error.message,
    };
    results.push(result);
    console.log(`  ❌ ${name}: FAIL - ${error.message}`);
    return result;
  }
}

async function main() {
  console.log('============================================================');
  console.log('CALENDAR API COMPREHENSIVE TEST');
  console.log('============================================================');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // Get a user with active providers
  const user = await prisma.user.findFirst({
    where: {
      providers: {
        some: {
          isActive: true,
          providerType: { in: ['google', 'microsoft'] },
        },
      },
    },
    include: {
      providers: {
        where: {
          isActive: true,
          providerType: { in: ['google', 'microsoft'] },
        },
      },
    },
  });

  if (!user || user.providers.length === 0) {
    console.log('❌ No user with active Google/Microsoft provider found');
    console.log('   Calendar tests require OAuth-connected providers');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Using user: ${user.email}`);
  console.log(`Tenant: ${user.tenantId}`);
  console.log(`Providers: ${user.providers.map((p) => `${p.providerType} (${p.email})`).join(', ')}`);
  console.log('');

  // Create a test session/token
  const session = await prisma.session.findFirst({
    where: { userId: user.id },
    orderBy: { expiresAt: 'desc' },
  });

  if (!session) {
    console.log('❌ No active session found for user');
    await prisma.$disconnect();
    process.exit(1);
  }

  // Create authenticated API client
  const api: AxiosInstance = axios.create({
    baseURL: API_BASE,
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true, // Don't throw on non-2xx
  });

  // ============================================================
  // CALENDAR LIST TESTS
  // ============================================================
  console.log('============================================================');
  console.log('CALENDAR LIST OPERATIONS');
  console.log('============================================================');

  let calendars: any[] = [];

  await runTest('list-calendars', async () => {
    const res = await api.get('/calendar/calendars');
    if (res.status !== 200) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    calendars = res.data;
    return { count: calendars.length, calendars: calendars.slice(0, 3) };
  });

  // ============================================================
  // CALENDAR EVENT LIST TESTS
  // ============================================================
  console.log('\n============================================================');
  console.log('CALENDAR EVENT LIST OPERATIONS');
  console.log('============================================================');

  let events: any[] = [];

  await runTest('list-events-all', async () => {
    const res = await api.get('/calendar/events');
    if (res.status !== 200) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    events = res.data.events || res.data || [];
    return { count: events.length };
  });

  await runTest('list-events-with-date-filter', async () => {
    const now = new Date();
    const startTime = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endTime = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const res = await api.get(`/calendar/events?startTime=${startTime}&endTime=${endTime}`);
    if (res.status !== 200) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    const filteredEvents = res.data.events || res.data || [];
    return { count: filteredEvents.length, dateRange: { startTime, endTime } };
  });

  await runTest('list-events-with-limit', async () => {
    const res = await api.get('/calendar/events?limit=5');
    if (res.status !== 200) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    const limitedEvents = res.data.events || res.data || [];
    return { count: limitedEvents.length, limitApplied: limitedEvents.length <= 5 };
  });

  // Test per-provider calendar listing
  for (const provider of user.providers) {
    await runTest(`list-events-provider-${provider.providerType}`, async () => {
      const res = await api.get(`/calendar/events?providerId=${provider.id}`);
      if (res.status !== 200) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      const providerEvents = res.data.events || res.data || [];
      return { provider: provider.providerType, count: providerEvents.length };
    });
  }

  // ============================================================
  // SINGLE EVENT GET TEST
  // ============================================================
  console.log('\n============================================================');
  console.log('SINGLE EVENT OPERATIONS');
  console.log('============================================================');

  if (events.length > 0) {
    const testEvent = events[0];

    await runTest('get-single-event', async () => {
      const res = await api.get(`/calendar/events/${testEvent.id}`);
      if (res.status !== 200) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      return {
        id: res.data.id,
        title: res.data.title,
        startTime: res.data.startTime,
      };
    });

    await runTest('get-event-attachments', async () => {
      const res = await api.get(`/calendar/events/${testEvent.id}/attachments`);
      if (res.status !== 200) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      return { attachmentCount: (res.data || []).length };
    });
  } else {
    console.log('  ⏭️  Skipping single event tests - no events available');
  }

  // ============================================================
  // EVENT CREATE/UPDATE/DELETE TESTS (Non-destructive)
  // ============================================================
  console.log('\n============================================================');
  console.log('EVENT CRUD OPERATIONS (Test Event Lifecycle)');
  console.log('============================================================');

  // Use first provider with calendar capability
  const testProvider = user.providers[0];
  let createdEventId: string | null = null;

  // Find a calendar ID for this provider
  const providerCalendar = calendars.find((c) => c.providerId === testProvider.id);
  const testCalendarId = providerCalendar?.id || 'primary';

  await runTest(`create-test-event-${testProvider.providerType}`, async () => {
    const now = new Date();
    const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour

    const res = await api.post('/calendar/events', {
      providerId: testProvider.id,
      calendarId: testCalendarId,
      title: `[TEST] Calendar API Test Event - ${now.toISOString()}`,
      description: 'This event was created by test-calendar-apis.ts to validate the refactored calendar providers.',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      isAllDay: false,
      timeZone: 'Europe/Rome',
    });

    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }

    createdEventId = res.data.id || res.data.eventId;
    return { eventId: createdEventId, provider: testProvider.providerType };
  });

  if (createdEventId) {
    await runTest(`get-created-event-${testProvider.providerType}`, async () => {
      const res = await api.get(`/calendar/events/${createdEventId}`);
      if (res.status !== 200) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      return { title: res.data.title, verified: true };
    });

    await runTest(`update-test-event-${testProvider.providerType}`, async () => {
      const res = await api.patch(`/calendar/events/${createdEventId}`, {
        title: `[TEST UPDATED] Calendar API Test Event`,
        description: 'Updated by test script to validate updateEvent()',
      });

      if (res.status !== 200) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      return { updated: true };
    });

    await runTest(`delete-test-event-${testProvider.providerType}`, async () => {
      const res = await api.delete(`/calendar/events/${createdEventId}`);
      if (res.status !== 204 && res.status !== 200) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      return { deleted: true };
    });

    // Verify deletion
    await runTest(`verify-event-deleted-${testProvider.providerType}`, async () => {
      const res = await api.get(`/calendar/events/${createdEventId}`);
      // Should return 404 or the event with isDeleted=true
      if (res.status === 404) {
        return { verified: true, status: 'not_found' };
      }
      if (res.status === 200 && res.data.isDeleted === true) {
        return { verified: true, status: 'soft_deleted' };
      }
      throw new Error(`Event still accessible: ${res.status}`);
    });
  }

  // ============================================================
  // CALENDAR SYNC TESTS
  // ============================================================
  console.log('\n============================================================');
  console.log('CALENDAR SYNC OPERATIONS');
  console.log('============================================================');

  for (const provider of user.providers) {
    await runTest(`sync-calendar-${provider.providerType}`, async () => {
      const res = await api.post(`/calendar/sync/${provider.id}`);
      if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      return res.data;
    });
  }

  // ============================================================
  // CALENDAR WEBHOOK HEALTH
  // ============================================================
  console.log('\n============================================================');
  console.log('CALENDAR WEBHOOK HEALTH');
  console.log('============================================================');

  await runTest('calendar-webhook-health', async () => {
    const res = await api.get('/webhooks/calendar/health');
    if (res.status !== 200) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    return res.data;
  });

  // ============================================================
  // DATABASE VALIDATION (Calendar Provider Refactoring)
  // ============================================================
  console.log('\n============================================================');
  console.log('DATABASE VALIDATION (Provider Refactoring Check)');
  console.log('============================================================');

  await runTest('db-calendar-events-count', async () => {
    const count = await prisma.calendarEvent.count({
      where: { tenantId: user.tenantId },
    });
    return { totalEvents: count };
  });

  await runTest('db-calendar-events-by-provider', async () => {
    const eventsByProvider = await prisma.calendarEvent.groupBy({
      by: ['providerId'],
      where: { tenantId: user.tenantId },
      _count: true,
    });

    const providerNames = await Promise.all(
      eventsByProvider.map(async (e) => {
        const provider = await prisma.providerConfig.findUnique({
          where: { id: e.providerId },
          select: { providerType: true, email: true },
        });
        return {
          providerId: e.providerId,
          providerType: provider?.providerType,
          email: provider?.email,
          count: e._count,
        };
      }),
    );

    return providerNames;
  });

  await runTest('db-calendar-orphaned-events', async () => {
    // Check for events without valid provider
    const orphaned = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM calendar_events ce
      WHERE NOT EXISTS (SELECT 1 FROM provider_configs pc WHERE pc.id = ce."providerId")
    `;
    const count = Number(orphaned[0]?.count || 0);
    if (count > 0) {
      throw new Error(`Found ${count} orphaned calendar events`);
    }
    return { orphanedEvents: 0, healthy: true };
  });

  await runTest('db-calendar-attachments-integrity', async () => {
    // Check for attachments without valid event
    const orphaned = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM calendar_event_attachments cea
      WHERE NOT EXISTS (SELECT 1 FROM calendar_events ce WHERE ce.id = cea."eventId")
    `;
    const count = Number(orphaned[0]?.count || 0);
    if (count > 0) {
      throw new Error(`Found ${count} orphaned calendar attachments`);
    }
    return { orphanedAttachments: 0, healthy: true };
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n============================================================');
  console.log('TEST SUMMARY');
  console.log('============================================================');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  console.log('\n============================================================');
  console.log(`Completed at: ${new Date().toISOString()}`);
  console.log('============================================================');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
