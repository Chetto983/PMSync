#!/usr/bin/env ts-node
/**
 * Multi-Provider Comprehensive Integration Test
 *
 * Tests ALL APIs across multiple providers to validate 100% response rate.
 * Designed for tenant with 3 providers (Google, Microsoft, IMAP).
 *
 * USAGE:
 *   npm run start:dev  (in another terminal)
 *   npx ts-node scripts/test-multi-provider-integration.ts
 *
 * @author MailAgent Team
 * @version 2.0.0
 * @date 2025-12-16
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';

// ============================================================================
// Types
// ============================================================================

interface TestResult {
  category: string;
  name: string;
  endpoint: string;
  method: string;
  providerId?: string;
  providerType?: string;
  status: number;
  success: boolean;
  duration: number;
  responseSchema?: string;
  error?: string;
}

interface ProviderInfo {
  id: string;
  email: string;
  providerType: string;
  supportsEmail: boolean;
  supportsCalendar: boolean;
  supportsContacts: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

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
    { userId, tenantId, email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
    secret,
  );
}

async function apiCall(
  endpoint: string,
  token: string,
  method: string = 'GET',
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function describeSchema(data: unknown): string {
  if (data === null) return 'null';
  if (Array.isArray(data)) {
    if (data.length === 0) return 'array[]';
    return `array[${describeSchema(data[0])}]`;
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data as object).slice(0, 8);
    return `{${keys.join(', ')}}`;
  }
  return typeof data;
}

// ============================================================================
// Test Runner
// ============================================================================

const results: TestResult[] = [];

async function testEndpoint(
  category: string,
  name: string,
  endpoint: string,
  token: string,
  method: string = 'GET',
  body?: unknown,
  providerInfo?: { id: string; type: string },
): Promise<TestResult> {
  const start = Date.now();
  const displayEndpoint = endpoint.length > 55 ? endpoint.substring(0, 52) + '...' : endpoint;

  process.stdout.write(`   ${method.padEnd(6)} ${displayEndpoint.padEnd(55)}`);

  try {
    const { status, data } = await apiCall(endpoint, token, method, body);
    const duration = Date.now() - start;
    const success = status >= 200 && status < 300;

    const result: TestResult = {
      category,
      name,
      endpoint,
      method,
      providerId: providerInfo?.id,
      providerType: providerInfo?.type,
      status,
      success,
      duration,
      responseSchema: success ? describeSchema(data) : undefined,
      error: !success ? JSON.stringify(data).substring(0, 200) : undefined,
    };

    results.push(result);
    console.log(`${success ? '✅' : '❌'} ${status} (${duration}ms)`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    const result: TestResult = {
      category,
      name,
      endpoint,
      method,
      providerId: providerInfo?.id,
      providerType: providerInfo?.type,
      status: 0,
      success: false,
      duration,
      error: message,
    };
    results.push(result);
    console.log(`❌ ERROR (${duration}ms): ${message.substring(0, 40)}`);
    return result;
  }
}

// ============================================================================
// Main Test Suite
// ============================================================================

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║       MULTI-PROVIDER COMPREHENSIVE INTEGRATION TEST - 100% COVERAGE TARGET       ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Started: ${new Date().toISOString().padEnd(69)}║`);
  console.log(`║  API Base: ${API_BASE.padEnd(68)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');

  const prisma = createPrismaClient();

  try {
    // ========================================================================
    // Setup: Get test user and providers
    // ========================================================================
    const user = await prisma.user.findFirst({
      where: { isActive: true },
      select: { id: true, tenantId: true, email: true },
    });

    if (!user) {
      console.error('❌ No active user found in database');
      process.exit(1);
    }

    const providers = await prisma.providerConfig.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: {
        id: true,
        email: true,
        providerType: true,
        supportsEmail: true,
        supportsCalendar: true,
        supportsContacts: true,
      },
    }) as ProviderInfo[];

    console.log(`\n📋 Test Configuration:`);
    console.log(`   User: ${user.email}`);
    console.log(`   Tenant: ${user.tenantId}`);
    console.log(`   Providers: ${providers.length}`);
    providers.forEach((p) => {
      const caps = [];
      if (p.supportsEmail) caps.push('Email');
      if (p.supportsCalendar) caps.push('Calendar');
      if (p.supportsContacts) caps.push('Contacts');
      console.log(`     - ${p.providerType.padEnd(10)} ${p.email} [${caps.join(', ')}]`);
    });

    const token = await generateTestJwt(user.id, user.tenantId, user.email);

    // Health check
    try {
      const res = await fetch('http://localhost:3000/health');
      if (!res.ok) throw new Error();
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

    // ========================================================================
    // 1. HEALTH & SYSTEM APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 1. HEALTH & SYSTEM APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('Health', 'System Health', '/health', token);
    await testEndpoint('Health', 'Ready Probe', '/health/ready', token);
    await testEndpoint('Health', 'Live Probe', '/health/live', token);
    await testEndpoint('Health', 'Queue Metrics', '/health/queues', token);
    await testEndpoint('Health', 'All Queues Health', '/health/queues/all', token);

    // ========================================================================
    // 2. PROVIDER APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 2. PROVIDER APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('Providers', 'List All Providers', '/providers', token);

    for (const provider of providers) {
      await testEndpoint(
        'Providers',
        `Get Provider (${provider.providerType})`,
        `/providers/${provider.id}`,
        token,
        'GET',
        undefined,
        { id: provider.id, type: provider.providerType },
      );
    }

    // ========================================================================
    // 3. EMAIL APIs (Per Provider)
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 3. EMAIL APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    // Global email operations
    await testEndpoint('Email', 'Email Stats Global', '/emails/stats', token);
    await testEndpoint('Email', 'Retention Stats', '/emails/retention/stats', token);

    for (const provider of providers) {
      if (!provider.supportsEmail) continue;

      console.log(`\n   --- ${provider.providerType.toUpperCase()} (${provider.email}) ---`);

      const pInfo = { id: provider.id, type: provider.providerType };

      // List emails
      await testEndpoint('Email', 'List Emails', `/emails?providerId=${provider.id}&limit=10`, token, 'GET', undefined, pInfo);
      await testEndpoint('Email', 'List Emails by Folder', `/emails?providerId=${provider.id}&specialUse=INBOX&limit=5`, token, 'GET', undefined, pInfo);
      await testEndpoint('Email', 'Email Stats', `/emails/stats?providerId=${provider.id}`, token, 'GET', undefined, pInfo);

      // Get test emails for bulk operations
      const testEmails = await prisma.email.findMany({
        where: { providerId: provider.id, isDeleted: false },
        take: 3,
        select: { id: true },
      });

      if (testEmails.length >= 2) {
        const emailIds = testEmails.map((e) => e.id);

        // Bulk operations
        await testEndpoint('Email', 'Bulk Mark Read', '/emails/bulk/read', token, 'PATCH', { emailIds, read: true }, pInfo);
        await testEndpoint('Email', 'Bulk Mark Unread', '/emails/bulk/read', token, 'PATCH', { emailIds, read: false }, pInfo);
        await testEndpoint('Email', 'Bulk Star', '/emails/bulk/star', token, 'PATCH', { emailIds, starred: true }, pInfo);
        await testEndpoint('Email', 'Bulk Unstar', '/emails/bulk/star', token, 'PATCH', { emailIds, starred: false }, pInfo);
        await testEndpoint('Email', 'Bulk Flag', '/emails/bulk/flag', token, 'PATCH', { emailIds, flagged: true }, pInfo);
        await testEndpoint('Email', 'Bulk Unflag', '/emails/bulk/flag', token, 'PATCH', { emailIds, flagged: false }, pInfo);

        // Single email operations
        await testEndpoint('Email', 'Get Single Email', `/emails/${emailIds[0]}`, token, 'GET', undefined, pInfo);
      }

      // Validation tests
      await testEndpoint('Email', 'Bulk Empty Validation', '/emails/bulk/read', token, 'PATCH', { emailIds: [], read: true }, pInfo);
    }

    // ========================================================================
    // 4. FOLDER APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 4. FOLDER APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('Folders', 'List All Folders', '/folders', token);

    for (const provider of providers) {
      if (!provider.supportsEmail) continue;
      const pInfo = { id: provider.id, type: provider.providerType };
      await testEndpoint('Folders', `Folder Audit (${provider.providerType})`, `/folders/audit/${provider.id}`, token, 'GET', undefined, pInfo);
    }

    // ========================================================================
    // 5. CALENDAR APIs (Per Provider)
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 5. CALENDAR APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('Calendar', 'List All Calendars', '/calendar/calendars', token);

    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    for (const provider of providers) {
      if (!provider.supportsCalendar) continue;

      console.log(`\n   --- ${provider.providerType.toUpperCase()} (${provider.email}) ---`);
      const pInfo = { id: provider.id, type: provider.providerType };

      await testEndpoint(
        'Calendar',
        'List Events',
        `/calendar/events?providerId=${provider.id}&startTime=${today.toISOString()}&endTime=${nextMonth.toISOString()}`,
        token,
        'GET',
        undefined,
        pInfo,
      );
    }

    // Calendar webhooks
    await testEndpoint('Calendar', 'Webhook Health', '/webhooks/calendar/health', token);

    // ========================================================================
    // 6. CONTACTS APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 6. CONTACTS APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('Contacts', 'List Contacts', '/contacts?limit=20', token);
    await testEndpoint('Contacts', 'Contact Counts', '/contacts/counts', token);
    await testEndpoint('Contacts', 'Search Contacts', '/contacts?search=test&limit=10', token);

    if (contact) {
      await testEndpoint('Contacts', 'Get Single Contact', `/contacts/${contact.id}`, token);
    }

    // Contacts webhooks
    await testEndpoint('Contacts', 'Webhook Health', '/webhooks/contacts/health', token);

    // ========================================================================
    // 7. LABELS APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 7. LABELS APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('Labels', 'List Labels', '/labels', token);

    // ========================================================================
    // 8. EMAIL SYNC APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 8. EMAIL SYNC APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('EmailSync', 'Sync Status', '/email-sync/status', token);
    await testEndpoint('EmailSync', 'Sync Health', '/email-sync/health', token);
    await testEndpoint('EmailSync', 'Webhook Health', '/email-sync/webhooks/health', token);

    // ========================================================================
    // 9. AI / VOLTAGENT APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 9. VOLTAGENT / AI SECRETARY APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    // Chat
    await testEndpoint('VoltAgent', 'Chat', '/voltagent/chat', token, 'POST', { message: 'Hello, integration test' });

    // Approval Workflow
    await testEndpoint('VoltAgent', 'Pending Actions', '/voltagent/actions/pending', token);

    // Stats
    await testEndpoint('VoltAgent', 'Action Counts', '/voltagent/stats/action-counts', token);
    await testEndpoint('VoltAgent', 'Learning Stats', '/voltagent/stats/learning', token);
    await testEndpoint('VoltAgent', 'Aggregate Stats', '/voltagent/stats/aggregate', token);
    await testEndpoint('VoltAgent', 'Performance Stats', '/voltagent/stats/performance', token);
    await testEndpoint('VoltAgent', 'Recent Metrics', '/voltagent/stats/metrics', token);
    await testEndpoint('VoltAgent', 'Optimization Stats', '/voltagent/stats/optimizations', token);

    // Cache
    await testEndpoint('VoltAgent', 'Cache Analytics', '/voltagent/cache/analytics', token);

    // Daily Briefing
    await testEndpoint('VoltAgent', 'Get Briefing', '/voltagent/briefing', token);
    await testEndpoint('VoltAgent', 'Briefing Status', '/voltagent/briefing/status', token);

    // Memory
    await testEndpoint('VoltAgent', 'Get Memories', '/voltagent/memory', token);
    await testEndpoint('VoltAgent', 'Search Memories', '/voltagent/memory/search?query=test', token);
    await testEndpoint('VoltAgent', 'Memory Stats', '/voltagent/memory/stats', token);

    // Deadlines
    await testEndpoint('VoltAgent', 'Get Deadlines', '/voltagent/deadlines', token);
    await testEndpoint('VoltAgent', 'Deadline Stats', '/voltagent/deadlines/stats', token);
    await testEndpoint('VoltAgent', 'Deadline Queue', '/voltagent/deadlines/queue', token);
    await testEndpoint('VoltAgent', 'Extract Deadline', '/voltagent/deadlines/extract', token, 'POST', {
      text: 'Please complete by next Friday',
      locale: 'en',
    });

    // Follow-Ups
    await testEndpoint('VoltAgent', 'List Follow-Ups', '/voltagent/follow-ups', token);
    await testEndpoint('VoltAgent', 'Pending Follow-Ups', '/voltagent/follow-ups/pending', token);
    await testEndpoint('VoltAgent', 'Overdue Follow-Ups', '/voltagent/follow-ups/overdue', token);
    await testEndpoint('VoltAgent', 'Follow-Up Stats', '/voltagent/follow-ups/stats', token);
    await testEndpoint('VoltAgent', 'Analyze Follow-Up', '/voltagent/follow-ups/analyze', token, 'POST', {
      body: 'Please get back to me on this',
      subject: 'Follow up needed',
    });

    // Action Items
    await testEndpoint('VoltAgent', 'List Action Items', '/voltagent/action-items', token);
    await testEndpoint('VoltAgent', 'Pending Action Items', '/voltagent/action-items/pending', token);
    await testEndpoint('VoltAgent', 'Overdue Action Items', '/voltagent/action-items/overdue', token);
    await testEndpoint('VoltAgent', 'Action Item Stats', '/voltagent/action-items/stats', token);
    await testEndpoint('VoltAgent', 'Analyze Action Items', '/voltagent/action-items/analyze', token, 'POST', {
      text: 'TODO: Review the proposal and send feedback',
    });

    // Analytics
    await testEndpoint('VoltAgent', 'Analytics Dashboard', '/voltagent/analytics/dashboard', token);
    await testEndpoint('VoltAgent', 'Email Analytics', '/voltagent/analytics/email?period=week', token);
    await testEndpoint('VoltAgent', 'Analytics Status', '/voltagent/analytics/status', token);

    // Knowledge
    await testEndpoint('VoltAgent', 'Knowledge Stats', '/voltagent/knowledge/stats', token);
    await testEndpoint('VoltAgent', 'Knowledge Search', '/voltagent/knowledge/search', token, 'POST', {
      query: 'test search query',
      limit: 5,
    });

    // Feedback
    await testEndpoint('VoltAgent', 'Feedback History', '/voltagent/feedback', token);

    // ========================================================================
    // 10. CRM INTELLIGENCE APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 10. CRM INTELLIGENCE APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('CRM', 'Stale Contacts', '/voltagent/crm/stale-contacts?days=60&limit=10', token);
    await testEndpoint('CRM', 'Reconnect Candidates', '/voltagent/crm/reconnect?days=60&limit=10', token);
    await testEndpoint('CRM', 'Top Contacts', '/voltagent/crm/top-contacts?limit=10', token);
    await testEndpoint('CRM', 'Recalculate All Scores', '/voltagent/crm/recalculate-all', token, 'POST');

    if (contact) {
      console.log(`\n   --- Contact: ${contact.id} ---`);
      await testEndpoint('CRM', 'Contact Stats', `/voltagent/crm/contacts/${contact.id}`, token);
      await testEndpoint('CRM', 'Contact Interactions', `/voltagent/crm/contacts/${contact.id}/interactions?limit=5`, token);
      await testEndpoint('CRM', 'Relationship Graph', `/voltagent/crm/contacts/${contact.id}/graph?depth=2`, token);
      await testEndpoint('CRM', 'Recalculate Score', `/voltagent/crm/contacts/${contact.id}/recalculate`, token, 'POST');
    }

    // ========================================================================
    // 11. DOCUMENT LIBRARY APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 11. DOCUMENT LIBRARY APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('DocumentLibrary', 'List Libraries', '/voltagent/document-library', token);
    await testEndpoint('DocumentLibrary', 'List Documents', '/voltagent/document-library/documents', token);

    // ========================================================================
    // 12. ANALYTICS MODULE APIs
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 12. ANALYTICS MODULE APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('Analytics', 'Email Analytics', '/analytics/emails', token);

    // ========================================================================
    // 13. AI MODULE APIs (Legacy)
    // ========================================================================
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
    console.log('📍 13. AI MODULE APIs');
    console.log('───────────────────────────────────────────────────────────────────────────────────');

    await testEndpoint('AI', 'Action Counts', '/ai/stats/action-counts', token);
    await testEndpoint('AI', 'Learning Stats', '/ai/stats/learning', token);
    await testEndpoint('AI', 'Aggregate Stats', '/ai/stats/aggregate', token);
    await testEndpoint('AI', 'Optimization Stats', '/ai/stats/optimizations', token);
    await testEndpoint('AI', 'Health Status', '/ai/health', token);

    // ========================================================================
    // GENERATE COMPREHENSIVE REPORT
    // ========================================================================
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════════════════════════');
    console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                     MULTI-PROVIDER INTEGRATION TEST REPORT                       ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');

    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const total = results.length;
    const successRate = ((passed / total) * 100).toFixed(1);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`║ Total Tests: ${total.toString().padEnd(67)}║`);
    console.log(`║ ✅ Passed: ${passed.toString().padEnd(69)}║`);
    console.log(`║ ❌ Failed: ${failed.toString().padEnd(69)}║`);
    console.log(`║ Success Rate: ${successRate}%`.padEnd(82) + '║');
    console.log(`║ Total Duration: ${totalDuration}ms`.padEnd(82) + '║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');

    // Group by category
    const categories = [...new Set(results.map((r) => r.category))];
    console.log('║ BY CATEGORY:'.padEnd(82) + '║');
    for (const category of categories) {
      const categoryResults = results.filter((r) => r.category === category);
      const categoryPassed = categoryResults.filter((r) => r.success).length;
      const categoryFailed = categoryResults.filter((r) => !r.success).length;
      const icon = categoryFailed === 0 ? '✅' : '⚠️';
      const line = `║   ${icon} ${category.padEnd(18)} ${categoryPassed}/${categoryResults.length} passed`;
      console.log(line.padEnd(82) + '║');
    }

    // Group by provider
    const providerTypes = [...new Set(results.filter((r) => r.providerType).map((r) => r.providerType))];
    if (providerTypes.length > 0) {
      console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');
      console.log('║ BY PROVIDER:'.padEnd(82) + '║');
      for (const providerType of providerTypes) {
        const providerResults = results.filter((r) => r.providerType === providerType);
        const providerPassed = providerResults.filter((r) => r.success).length;
        const providerFailed = providerResults.filter((r) => !r.success).length;
        const icon = providerFailed === 0 ? '✅' : '⚠️';
        const line = `║   ${icon} ${(providerType || 'Unknown').padEnd(18)} ${providerPassed}/${providerResults.length} passed`;
        console.log(line.padEnd(82) + '║');
      }
    }

    console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');

    // Save JSON report
    const report = {
      timestamp: new Date().toISOString(),
      config: {
        apiBase: API_BASE,
        userId: user.id,
        tenantId: user.tenantId,
        providers: providers.map((p) => ({
          id: p.id,
          email: p.email,
          type: p.providerType,
          capabilities: {
            email: p.supportsEmail,
            calendar: p.supportsCalendar,
            contacts: p.supportsContacts,
          },
        })),
      },
      summary: {
        total,
        passed,
        failed,
        successRate: `${successRate}%`,
        duration: totalDuration,
      },
      byCategory: categories.map((cat) => {
        const catResults = results.filter((r) => r.category === cat);
        return {
          name: cat,
          total: catResults.length,
          passed: catResults.filter((r) => r.success).length,
          failed: catResults.filter((r) => !r.success).length,
        };
      }),
      byProvider: providerTypes.map((pt) => {
        const ptResults = results.filter((r) => r.providerType === pt);
        return {
          type: pt,
          total: ptResults.length,
          passed: ptResults.filter((r) => r.success).length,
          failed: ptResults.filter((r) => !r.success).length,
        };
      }),
      endpoints: results,
    };

    const reportPath = 'scripts/multi-provider-integration-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Full report saved to: ${reportPath}`);

    // List failed endpoints
    if (failed > 0) {
      console.log('\n❌ FAILED ENDPOINTS:');
      for (const r of results.filter((r) => !r.success)) {
        console.log(`   ${r.method} ${r.endpoint}`);
        console.log(`      Status: ${r.status}`);
        console.log(`      Error: ${r.error?.substring(0, 100) || 'Unknown'}`);
      }
      process.exit(1);
    } else {
      console.log('\n✅ ALL TESTS PASSED - 100% SUCCESS RATE!');
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Integration test failed:', error);
  process.exit(1);
});
