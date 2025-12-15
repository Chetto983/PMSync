/**
 * Test Analytics API Endpoints with JWT Authentication
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-analytics-api.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import * as jwt from 'jsonwebtoken';
import 'dotenv/config';

const API_BASE = 'http://localhost:3000';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  response?: unknown;
  error?: string;
}

async function generateTestJwt(userId: string, tenantId: string): Promise<string> {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  return jwt.sign(
    {
      sub: userId,
      tenantId,
      email: 'test@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    },
    secret,
  );
}

async function makeApiCall(
  endpoint: string,
  method: 'GET' | 'POST',
  token: string,
  body?: Record<string, unknown>,
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

async function runApiTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Analytics API Test with JWT                        ║
║           Testing: REST endpoints + Authentication           ║
╚══════════════════════════════════════════════════════════════╝
`);

  const prisma = createPrismaClient();
  const results: TestResult[] = [];

  // Get test user
  const user = await prisma.user.findFirst({
    include: { userPreferences: true },
  });
  if (!user) {
    console.error('No user found in database');
    await prisma.$disconnect();
    return;
  }

  console.log('User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}`);
  console.log();

  // Generate JWT
  const token = await generateTestJwt(user.id, user.tenantId);
  console.log('JWT Token generated (first 50 chars):', token.substring(0, 50) + '...');
  console.log();

  // Check if server is running
  try {
    await fetch(`${API_BASE}/health`);
    console.log('Server is running at', API_BASE);
  } catch {
    console.error('Server is not running. Please start the backend first:');
    console.error('  cd backend && npm run start:dev');
    await prisma.$disconnect();
    return;
  }

  // Define test cases
  const testCases = [
    {
      name: 'GET /voltagent/analytics/status',
      fn: async () => {
        return makeApiCall('/voltagent/analytics/status', 'GET', token);
      },
      execute: true,
    },
    {
      name: 'GET /voltagent/analytics/dashboard',
      fn: async () => {
        return makeApiCall('/voltagent/analytics/dashboard', 'GET', token);
      },
      execute: true,
    },
    {
      name: 'GET /voltagent/analytics/email?period=week',
      fn: async () => {
        return makeApiCall('/voltagent/analytics/email?period=week', 'GET', token);
      },
      execute: true,
    },
    {
      name: 'GET /voltagent/analytics/email?period=month',
      fn: async () => {
        return makeApiCall('/voltagent/analytics/email?period=month', 'GET', token);
      },
      execute: true,
    },
    {
      name: 'POST /voltagent/analytics/ai (Email Volume)',
      fn: async () => {
        return makeApiCall('/voltagent/analytics/ai', 'POST', token, {
          query: 'Analyze email volume trends and identify peak hours',
          data: { emailCount: 143, unreadCount: 74, sentCount: 0 },
        });
      },
      execute: true,
    },
    {
      name: 'POST /voltagent/analytics/invalidate',
      fn: async () => {
        return makeApiCall('/voltagent/analytics/invalidate', 'POST', token);
      },
      execute: true,
    },
  ];

  console.log(`${'═'.repeat(60)}`);
  console.log('API ENDPOINT TESTS');
  console.log(`${'─'.repeat(60)}\n`);

  for (const test of testCases) {
    console.log(`Testing: ${test.name}`);

    if (!test.execute) {
      console.log(`   SKIPPED`);
      results.push({
        name: test.name,
        status: 'skipped',
        duration: 0,
      });
      console.log();
      continue;
    }

    try {
      const startTime = Date.now();
      const result = await test.fn();
      const duration = Date.now() - startTime;

      if (result.status >= 200 && result.status < 300) {
        console.log(`   PASSED (${duration}ms) - HTTP ${result.status}`);

        // Show response summary
        if (result.data && typeof result.data === 'object') {
          const data = result.data as Record<string, unknown>;
          const keys = Object.keys(data);
          console.log(`   Response keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
        }

        results.push({
          name: test.name,
          status: 'passed',
          duration,
          response: result.data,
        });
      } else {
        console.log(`   FAILED - HTTP ${result.status}`);
        console.log(`   Error: ${JSON.stringify(result.data).substring(0, 100)}`);
        results.push({
          name: test.name,
          status: 'failed',
          duration,
          error: `HTTP ${result.status}: ${JSON.stringify(result.data).substring(0, 100)}`,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   FAILED: ${errorMsg.substring(0, 100)}`);
      results.push({
        name: test.name,
        status: 'failed',
        duration: 0,
        error: errorMsg,
      });
    }

    console.log();
    await new Promise((resolve) => setTimeout(resolve, 500)); // Rate limiting
  }

  // Summary
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const avgDuration =
    results.filter((r) => r.status === 'passed').reduce((sum, r) => sum + r.duration, 0) / (passed || 1);

  console.log(`${'═'.repeat(60)}`);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║               API TEST RESULTS                               ║
╚══════════════════════════════════════════════════════════════╝

Statistics:
   Total Tests: ${testCases.length}
   Passed:   ${passed}
   Failed:   ${failed}
   Skipped:  ${skipped}

Performance:
   Average Response: ${(avgDuration / 1000).toFixed(2)}s

Success Rate: ${((passed / (testCases.length - skipped)) * 100).toFixed(1)}%
`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter((r) => r.status === 'failed').forEach((r) => console.log(`   - ${r.name}: ${r.error}`));
  }

  // Cleanup
  await prisma.$disconnect();

  console.log('\nAPI test completed!');
  process.exit(failed > 0 ? 1 : 0);
}

runApiTest().catch(console.error);
