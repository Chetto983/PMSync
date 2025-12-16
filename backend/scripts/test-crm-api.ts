#!/usr/bin/env ts-node
/**
 * P1.7 CRM Intelligence API Test Script
 *
 * Tests the CRM API endpoints with real data.
 * Requires the backend server to be running.
 *
 * USAGE:
 *   npm run start:dev  (in another terminal)
 *   npx ts-node scripts/test-crm-api.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as jwt from 'jsonwebtoken';

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

async function generateTestJwt(userId: string, tenantId: string): Promise<string> {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  return jwt.sign(
    {
      sub: userId,
      tenantId,
      email: 'test@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    secret,
  );
}

async function makeApiCall(
  endpoint: string,
  token: string,
  method: string = 'GET',
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

interface TestResult {
  endpoint: string;
  method: string;
  status: number;
  success: boolean;
  duration: number;
  data?: unknown;
  error?: string;
}

const results: TestResult[] = [];

async function testEndpoint(
  name: string,
  endpoint: string,
  token: string,
  method: string = 'GET',
  body?: unknown,
): Promise<void> {
  const start = Date.now();
  console.log(`\n🧪 Testing: ${method} ${endpoint}`);

  try {
    const { status, data } = await makeApiCall(endpoint, token, method, body);
    const duration = Date.now() - start;
    const success = status >= 200 && status < 300;

    results.push({
      endpoint,
      method,
      status,
      success,
      duration,
      data: success ? data : undefined,
      error: !success ? JSON.stringify(data) : undefined,
    });

    if (success) {
      console.log(`   ✅ ${status} OK (${duration}ms)`);
      // Show summary of response
      if (typeof data === 'object' && data !== null) {
        const d = data as Record<string, unknown>;
        if ('count' in d) console.log(`   📊 Count: ${d.count}`);
        if ('contacts' in d && Array.isArray(d.contacts)) {
          console.log(`   👥 Contacts returned: ${d.contacts.length}`);
          if (d.contacts.length > 0) {
            const first = d.contacts[0] as Record<string, unknown>;
            console.log(`   📋 First contact: ${first.displayName || first.primaryEmail || 'N/A'}`);
          }
        }
        if ('stats' in d) {
          console.log(`   📈 Stats:`, JSON.stringify(d.stats, null, 2).substring(0, 200));
        }
        if ('nodes' in d && Array.isArray(d.nodes)) {
          console.log(`   🔗 Graph nodes: ${d.nodes.length}`);
        }
      }
    } else {
      console.log(`   ❌ ${status} FAILED (${duration}ms)`);
      console.log(`   Error: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      endpoint,
      method,
      status: 0,
      success: false,
      duration,
      error: message,
    });
    console.log(`   ❌ FAILED (${duration}ms): ${message}`);
  }
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          P1.7 CRM Intelligence API Test                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  const prisma = createPrismaClient();

  try {
    // Get test user
    const user = await prisma.user.findFirst({
      select: { id: true, tenantId: true, email: true },
    });

    if (!user) {
      console.error('❌ No user found in database');
      process.exit(1);
    }

    console.log(`\n📋 Testing with user: ${user.email}`);
    console.log(`   Tenant ID: ${user.tenantId}`);
    console.log(`   User ID: ${user.id}`);

    // Generate JWT
    const token = await generateTestJwt(user.id, user.tenantId);
    console.log(`   Token: ${token.substring(0, 50)}...`);

    // Check if server is running
    try {
      const healthRes = await fetch('http://localhost:3000/health');
      if (!healthRes.ok) throw new Error('Health check failed');
    } catch {
      console.error('\n❌ Server is not running. Please start the backend first:');
      console.error('   cd backend && npm run start:dev');
      await prisma.$disconnect();
      return;
    }

    // Get a contact for testing
    const contact = await prisma.contact.findFirst({
      where: { tenantId: user.tenantId, isDeleted: false },
      select: { id: true, displayName: true },
    });

    console.log(`\n🧪 Starting CRM API Tests...\n`);
    console.log('═'.repeat(70));

    // Test 1: Get stale contacts
    await testEndpoint(
      'Stale Contacts',
      '/voltagent/crm/stale-contacts?days=30&limit=5',
      token,
    );

    // Test 2: Get contacts needing reconnect
    await testEndpoint(
      'Reconnect Candidates',
      '/voltagent/crm/reconnect?days=60&limit=5',
      token,
    );

    // Test 3: Get top contacts by score
    await testEndpoint(
      'Top Contacts',
      '/voltagent/crm/top-contacts?limit=10',
      token,
    );

    // Test 4: Get contact relationship stats (if we have a contact)
    if (contact) {
      console.log(`\n   Testing with contact: ${contact.displayName || contact.id}`);

      await testEndpoint(
        'Contact Stats',
        `/voltagent/crm/contacts/${contact.id}`,
        token,
      );

      // Test 5: Get contact interaction history
      await testEndpoint(
        'Interaction History',
        `/voltagent/crm/contacts/${contact.id}/interactions?limit=5`,
        token,
      );

      // Test 6: Get relationship graph
      await testEndpoint(
        'Relationship Graph',
        `/voltagent/crm/contacts/${contact.id}/graph?depth=2`,
        token,
      );

      // Test 7: Recalculate score
      await testEndpoint(
        'Recalculate Score',
        `/voltagent/crm/contacts/${contact.id}/recalculate`,
        token,
        'POST',
      );
    } else {
      console.log('\n⚠️  No contacts found - skipping contact-specific tests');
    }

    // Test 8: Recalculate all scores (admin endpoint)
    await testEndpoint(
      'Recalculate All Scores',
      '/voltagent/crm/recalculate-all',
      token,
      'POST',
    );

    // Print summary
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                              ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');

    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    for (const result of results) {
      const status = result.success ? '✅' : '❌';
      const line = `${status} ${result.method} ${result.endpoint}`.substring(0, 60).padEnd(60);
      console.log(`║ ${line}  ║`);
    }

    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║ Total: ${passed} passed, ${failed} failed (${totalDuration}ms)`.padEnd(67) + '║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');

    if (failed > 0) {
      console.log('\n❌ Some tests failed. Review errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ All CRM API tests passed!');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Test script failed:', error);
  process.exit(1);
});
