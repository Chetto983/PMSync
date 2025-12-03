/**
 * WebSocket Events Test Script
 * Tests realtime email notifications and sync events
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { io, Socket } from 'socket.io-client';

const prisma = createPrismaClient();

const BACKEND_URL = 'http://localhost:3000';
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

// JWT token for testing (from user's request)
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWkzMjFsM3MwMDAxeWh1a3g3bzhranVsIiwiZW1haWwiOiJkdmRtYXJjaGV0dG9AZ21haWwuY29tIiwiaWF0IjoxNzMzMTQyMDgxLCJleHAiOjE3MzMyMjg0ODF9.p70l3RGqL43WJKfgMUB_oH5h_3xU4x1nYgqSaSLI_cc';

async function testWebSocketConnection(): Promise<Socket | null> {
  console.log('\n=== WEBSOCKET CONNECTION TEST ===\n');

  return new Promise((resolve) => {
    const socket = io(BACKEND_URL, {
      auth: { token: TEST_TOKEN },
      transports: ['websocket'],
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('✅ WebSocket connected!');
      console.log(`  Socket ID: ${socket.id}`);

      // Join tenant room
      socket.emit('join:tenant', { tenantId: TENANT_ID });
      console.log(`  Joined tenant room: ${TENANT_ID}`);

      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error.message);
      resolve(null);
    });

    socket.on('disconnect', (reason) => {
      console.log(`⚠️ WebSocket disconnected: ${reason}`);
    });

    // Listen for email events
    socket.on('email:new', (data) => {
      console.log('\n📧 NEW EMAIL EVENT:');
      console.log(`  Subject: ${data.email?.subject?.substring(0, 50)}`);
      console.log(`  From: ${data.email?.from}`);
      console.log(`  Provider: ${data.providerId}`);
    });

    socket.on('email:updated', (data) => {
      console.log('\n✏️ EMAIL UPDATED EVENT:');
      console.log(`  Email ID: ${data.emailId}`);
      console.log(`  Changes: ${JSON.stringify(data.changes)}`);
    });

    socket.on('email:deleted', (data) => {
      console.log('\n🗑️ EMAIL DELETED EVENT:');
      console.log(`  Email ID: ${data.emailId}`);
    });

    socket.on('sync:started', (data) => {
      console.log('\n🔄 SYNC STARTED EVENT:');
      console.log(`  Provider: ${data.providerId}`);
    });

    socket.on('sync:completed', (data) => {
      console.log('\n✅ SYNC COMPLETED EVENT:');
      console.log(`  Provider: ${data.providerId}`);
      console.log(`  New emails: ${data.newEmails}`);
    });

    socket.on('sync:error', (data) => {
      console.log('\n❌ SYNC ERROR EVENT:');
      console.log(`  Provider: ${data.providerId}`);
      console.log(`  Error: ${data.error}`);
    });

    setTimeout(() => {
      if (!socket.connected) {
        console.error('❌ WebSocket connection timeout');
        resolve(null);
      }
    }, 10000);
  });
}

async function testEmailEvents(socket: Socket | null) {
  console.log('\n=== EMAIL EVENTS TEST ===\n');

  if (!socket || !socket.connected) {
    console.log('⚠️ Skipping event tests - no socket connection');
    return;
  }

  // Listen for events for 5 seconds
  console.log('👂 Listening for email events for 5 seconds...');
  console.log('  (If you send an email now, you should see it here)');

  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function testDatabaseWebSocketTriggers() {
  console.log('\n=== DATABASE EVENT TRIGGERS ===\n');

  // Check email sync notifications
  const syncTriggers = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM pg_trigger
    WHERE tgname LIKE '%email%' OR tgname LIKE '%sync%'
  `;
  console.log('Email/Sync triggers in database:', (syncTriggers as any)?.[0]?.count || 0);

  // Check notification channels
  const notifications = await prisma.$queryRaw`
    SELECT pg_listening_channels()
  `;
  console.log('Listening channels:', notifications);
}

async function testRealtimeSync() {
  console.log('\n=== REALTIME SYNC TEST ===\n');

  // Get the latest email
  const latestEmail = await prisma.email.findFirst({
    where: { tenantId: TENANT_ID, isDeleted: false },
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true,
      subject: true,
      receivedAt: true,
      createdAt: true,
    },
  });

  if (latestEmail) {
    console.log('📧 Latest email:');
    console.log(`  Subject: ${latestEmail.subject?.substring(0, 50)}`);
    console.log(`  Received: ${latestEmail.receivedAt}`);
    console.log(`  Created in DB: ${latestEmail.createdAt}`);

    const syncDelay = new Date(latestEmail.createdAt).getTime() - new Date(latestEmail.receivedAt).getTime();
    console.log(`  Sync delay: ${Math.round(syncDelay / 1000)}s`);
  }

  // Check provider sync tokens
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      email: true,
      providerType: true,
      lastSyncedAt: true,
      metadata: true,
    },
  });

  console.log('\n📊 Provider sync status:');
  for (const p of providers) {
    const metadata = p.metadata as any;
    console.log(`  ${p.providerType}: ${p.email}`);
    console.log(`    Last sync: ${p.lastSyncedAt}`);
    console.log(`    History ID: ${metadata?.historyId || 'N/A'}`);
    console.log(`    Sync token: ${metadata?.lastSyncToken?.substring(0, 30) || 'N/A'}...`);
  }
}

async function runAllTests() {
  console.log('🚀 Starting WebSocket & Realtime Tests...\n');
  console.log('='.repeat(60));

  let socket: Socket | null = null;

  try {
    socket = await testWebSocketConnection();
    await testEmailEvents(socket);
    await testDatabaseWebSocketTriggers();
    await testRealtimeSync();

    console.log('\n' + '='.repeat(60));
    console.log('🏁 All WebSocket tests completed!');
  } catch (error) {
    console.error('\n❌ Test error:', error);
  } finally {
    if (socket) {
      socket.disconnect();
    }
    await prisma.$disconnect();
  }
}

runAllTests();
