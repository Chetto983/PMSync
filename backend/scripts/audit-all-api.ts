#!/usr/bin/env ts-node
/**
 * VoltAgent API Audit Script
 *
 * Comprehensive test of ALL VoltAgent API endpoints.
 * Generates a report for frontend integration verification.
 *
 * USAGE:
 *   npm run start:dev  (in another terminal)
 *   npx ts-node scripts/audit-all-api.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

async function generateTestJwt(userId: string, tenantId: string, email: string): Promise<string> {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  return jwt.sign(
    {
      userId,  // JwtStrategy expects userId
      tenantId,
      email,
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
  category: string;
  name: string;
  endpoint: string;
  method: string;
  status: number;
  success: boolean;
  duration: number;
  responseSchema?: string;
  error?: string;
}

const results: TestResult[] = [];

async function testEndpoint(
  category: string,
  name: string,
  endpoint: string,
  token: string,
  method: string = 'GET',
  body?: unknown,
): Promise<TestResult> {
  const start = Date.now();
  console.log(`   ${method.padEnd(6)} ${endpoint.substring(0, 50).padEnd(50)}`);

  try {
    const { status, data } = await makeApiCall(endpoint, token, method, body);
    const duration = Date.now() - start;
    const success = status >= 200 && status < 300;

    const result: TestResult = {
      category,
      name,
      endpoint,
      method,
      status,
      success,
      duration,
      responseSchema: success ? describeSchema(data) : undefined,
      error: !success ? JSON.stringify(data).substring(0, 200) : undefined,
    };

    results.push(result);
    console.log(`   ${success ? '✅' : '❌'} ${status} (${duration}ms)`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    const result: TestResult = {
      category,
      name,
      endpoint,
      method,
      status: 0,
      success: false,
      duration,
      error: message,
    };
    results.push(result);
    console.log(`   ❌ ERROR (${duration}ms): ${message.substring(0, 50)}`);
    return result;
  }
}

function describeSchema(data: unknown): string {
  if (data === null) return 'null';
  if (Array.isArray(data)) {
    if (data.length === 0) return 'array[]';
    return `array[${describeSchema(data[0])}]`;
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data as object).slice(0, 10);
    return `{${keys.join(', ')}}`;
  }
  return typeof data;
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║              VoltAgent API Audit - Complete Endpoint Test                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const prisma = createPrismaClient();

  try {
    // Get test data
    const user = await prisma.user.findFirst({
      select: { id: true, tenantId: true, email: true },
    });

    if (!user) {
      console.error('❌ No user found in database');
      process.exit(1);
    }

    console.log(`\n📋 Testing with user: ${user.email}`);
    console.log(`   Tenant ID: ${user.tenantId}`);

    const token = await generateTestJwt(user.id, user.tenantId, user.email);

    // Check server
    try {
      const healthRes = await fetch('http://localhost:3000/health');
      if (!healthRes.ok) throw new Error('Health check failed');
      console.log('   Server: ✅ Running\n');
    } catch {
      console.error('\n❌ Server not running. Start with: npm run start:dev');
      await prisma.$disconnect();
      return;
    }

    // Get test entities
    const contact = await prisma.contact.findFirst({
      where: { tenantId: user.tenantId, isDeleted: false },
      select: { id: true },
    });

    // Get email for testing (if available)
    let emailId: string | undefined;
    let followUpId: string | undefined;
    let actionItemId: string | undefined;

    try {
      const email = await (prisma as any).email.findFirst({
        where: { tenantId: user.tenantId },
        select: { id: true },
      });
      emailId = email?.id;
    } catch { /* model may not exist */ }

    try {
      const followUp = await (prisma as any).followUp.findFirst({
        where: { tenantId: user.tenantId },
        select: { id: true },
      });
      followUpId = followUp?.id;
    } catch { /* model may not exist */ }

    try {
      const actionItem = await (prisma as any).actionItem.findFirst({
        where: { tenantId: user.tenantId },
        select: { id: true },
      });
      actionItemId = actionItem?.id;
    } catch { /* model may not exist */ }

    // ========================================================================
    // CHAT ENDPOINTS
    // ========================================================================
    console.log('\n📍 CHAT ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('Chat', 'Send Message', '/voltagent/chat', token, 'POST', {
      message: 'Hello, this is a test message',
    });

    // ========================================================================
    // APPROVAL WORKFLOW ENDPOINTS
    // ========================================================================
    console.log('\n📍 APPROVAL WORKFLOW ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('Approval', 'Get Pending Actions', '/voltagent/actions/pending', token);

    // ========================================================================
    // STATS ENDPOINTS
    // ========================================================================
    console.log('\n📍 STATS ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('Stats', 'Action Counts', '/voltagent/stats/action-counts', token);
    await testEndpoint('Stats', 'Learning Stats', '/voltagent/stats/learning', token);
    await testEndpoint('Stats', 'Aggregate Stats', '/voltagent/stats/aggregate', token);
    await testEndpoint('Stats', 'Performance Stats', '/voltagent/stats/performance', token);
    await testEndpoint('Stats', 'Recent Metrics', '/voltagent/stats/metrics', token);
    await testEndpoint('Stats', 'Optimization Stats', '/voltagent/stats/optimizations', token);

    // ========================================================================
    // CACHE ENDPOINTS
    // ========================================================================
    console.log('\n📍 CACHE ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('Cache', 'Analytics', '/voltagent/cache/analytics', token);

    // ========================================================================
    // DAILY BRIEFING ENDPOINTS
    // ========================================================================
    console.log('\n📍 DAILY BRIEFING ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('Briefing', 'Get Briefing', '/voltagent/briefing', token);
    await testEndpoint('Briefing', 'Status', '/voltagent/briefing/status', token);

    // ========================================================================
    // MEMORY ENDPOINTS
    // ========================================================================
    console.log('\n📍 MEMORY ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('Memory', 'Get All Memories', '/voltagent/memory', token);
    await testEndpoint('Memory', 'Search Memories', '/voltagent/memory/search?query=test', token);
    await testEndpoint('Memory', 'Memory Stats', '/voltagent/memory/stats', token);

    // ========================================================================
    // DEADLINE ENDPOINTS
    // ========================================================================
    console.log('\n📍 DEADLINE ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('Deadlines', 'Get Upcoming', '/voltagent/deadlines', token);
    await testEndpoint('Deadlines', 'Stats', '/voltagent/deadlines/stats', token);
    await testEndpoint('Deadlines', 'Queue Stats', '/voltagent/deadlines/queue', token);
    await testEndpoint('Deadlines', 'Extract (Preview)', '/voltagent/deadlines/extract', token, 'POST', {
      text: 'Please complete this by next Friday',
      locale: 'en',
    });

    // ========================================================================
    // FOLLOW-UP ENDPOINTS
    // ========================================================================
    console.log('\n📍 FOLLOW-UP ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('FollowUps', 'List All', '/voltagent/follow-ups', token);
    await testEndpoint('FollowUps', 'Pending', '/voltagent/follow-ups/pending', token);
    await testEndpoint('FollowUps', 'Overdue', '/voltagent/follow-ups/overdue', token);
    await testEndpoint('FollowUps', 'Stats', '/voltagent/follow-ups/stats', token);
    await testEndpoint('FollowUps', 'Analyze Text', '/voltagent/follow-ups/analyze', token, 'POST', {
      body: 'Please get back to me on this',
      subject: 'Follow up needed',
    });
    if (followUpId) {
      await testEndpoint('FollowUps', 'Get By ID', `/voltagent/follow-ups/${followUpId}`, token);
    }

    // ========================================================================
    // ACTION ITEMS ENDPOINTS
    // ========================================================================
    console.log('\n📍 ACTION ITEMS ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('ActionItems', 'List All', '/voltagent/action-items', token);
    await testEndpoint('ActionItems', 'Pending', '/voltagent/action-items/pending', token);
    await testEndpoint('ActionItems', 'Overdue', '/voltagent/action-items/overdue', token);
    await testEndpoint('ActionItems', 'Stats', '/voltagent/action-items/stats', token);
    await testEndpoint('ActionItems', 'Analyze Text', '/voltagent/action-items/analyze', token, 'POST', {
      text: 'TODO: Review the proposal and send feedback',
    });
    if (actionItemId) {
      await testEndpoint('ActionItems', 'Get By ID', `/voltagent/action-items/${actionItemId}`, token);
    }

    // ========================================================================
    // ANALYTICS ENDPOINTS
    // ========================================================================
    console.log('\n📍 ANALYTICS ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('Analytics', 'Dashboard', '/voltagent/analytics/dashboard', token);
    await testEndpoint('Analytics', 'Email Analytics', '/voltagent/analytics/email?period=week', token);
    await testEndpoint('Analytics', 'Status', '/voltagent/analytics/status', token);

    // ========================================================================
    // UNIFIED KNOWLEDGE ENDPOINTS (P1.6)
    // ========================================================================
    console.log('\n📍 UNIFIED KNOWLEDGE ENDPOINTS (P1.6)');
    console.log('─'.repeat(70));
    await testEndpoint('Knowledge', 'Stats', '/voltagent/knowledge/stats', token);
    await testEndpoint('Knowledge', 'Search', '/voltagent/knowledge/search', token, 'POST', {
      query: 'test search query',
      limit: 5,
    });

    // ========================================================================
    // CRM INTELLIGENCE ENDPOINTS (P1.7)
    // ========================================================================
    console.log('\n📍 CRM INTELLIGENCE ENDPOINTS (P1.7)');
    console.log('─'.repeat(70));
    await testEndpoint('CRM', 'Stale Contacts', '/voltagent/crm/stale-contacts?days=60&limit=10', token);
    await testEndpoint('CRM', 'Reconnect Candidates', '/voltagent/crm/reconnect?days=60&limit=10', token);
    await testEndpoint('CRM', 'Top Contacts', '/voltagent/crm/top-contacts?limit=10', token);
    await testEndpoint('CRM', 'Recalculate All', '/voltagent/crm/recalculate-all', token, 'POST');

    if (contact) {
      console.log(`\n   Testing with contact: ${contact.id}`);
      await testEndpoint('CRM', 'Contact Stats', `/voltagent/crm/contacts/${contact.id}`, token);
      await testEndpoint('CRM', 'Interactions', `/voltagent/crm/contacts/${contact.id}/interactions?limit=5`, token);
      await testEndpoint('CRM', 'Relationship Graph', `/voltagent/crm/contacts/${contact.id}/graph?depth=2`, token);
      await testEndpoint('CRM', 'Recalculate Score', `/voltagent/crm/contacts/${contact.id}/recalculate`, token, 'POST');
    }

    // ========================================================================
    // FEEDBACK ENDPOINTS
    // ========================================================================
    console.log('\n📍 FEEDBACK ENDPOINTS');
    console.log('─'.repeat(70));
    await testEndpoint('Feedback', 'History', '/voltagent/feedback', token);

    // ========================================================================
    // GENERATE REPORT
    // ========================================================================
    console.log('\n');
    console.log('═'.repeat(78));
    console.log('╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                           API AUDIT SUMMARY                              ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════╣');

    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    // Group by category
    const categories = [...new Set(results.map((r) => r.category))];
    for (const category of categories) {
      const categoryResults = results.filter((r) => r.category === category);
      const categoryPassed = categoryResults.filter((r) => r.success).length;
      const categoryFailed = categoryResults.filter((r) => !r.success).length;
      const icon = categoryFailed === 0 ? '✅' : '⚠️';
      console.log(`║ ${icon} ${category.padEnd(20)} ${categoryPassed}/${categoryResults.length} passed`.padEnd(75) + '║');
    }

    console.log('╠══════════════════════════════════════════════════════════════════════════╣');
    console.log(`║ TOTAL: ${passed} passed, ${failed} failed (${totalDuration}ms)`.padEnd(75) + '║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝');

    // Generate JSON report for frontend
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        passed,
        failed,
        duration: totalDuration,
        successRate: `${((passed / results.length) * 100).toFixed(1)}%`,
      },
      categories: categories.map((cat) => {
        const catResults = results.filter((r) => r.category === cat);
        return {
          name: cat,
          total: catResults.length,
          passed: catResults.filter((r) => r.success).length,
          failed: catResults.filter((r) => !r.success).length,
        };
      }),
      endpoints: results.map((r) => ({
        category: r.category,
        name: r.name,
        method: r.method,
        endpoint: r.endpoint,
        status: r.status,
        success: r.success,
        duration: r.duration,
        responseSchema: r.responseSchema,
        error: r.error,
      })),
    };

    // Save report
    const reportPath = 'scripts/api-audit-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);

    // List failed endpoints
    if (failed > 0) {
      console.log('\n❌ FAILED ENDPOINTS:');
      for (const r of results.filter((r) => !r.success)) {
        console.log(`   ${r.method} ${r.endpoint}`);
        console.log(`      Error: ${r.error?.substring(0, 100) || 'Unknown'}`);
      }
      process.exit(1);
    } else {
      console.log('\n✅ All API endpoints passed!');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Audit script failed:', error);
  process.exit(1);
});
