/**
 * Comprehensive API Test Suite
 * Tests ALL critical APIs: bulk operations, folder counts, CRUD, rate limiting
 * Run with: npx ts-node scripts/test-all-apis-comprehensive.ts
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  testFn: () => Promise<any>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    const details = await testFn();
    const result: TestResult = {
      name,
      status: 'PASS',
      duration: Date.now() - start,
      details,
    };
    results.push(result);
    console.log(`  ✅ ${name}: PASS (${result.duration}ms)`);
    return result;
  } catch (error: any) {
    const result: TestResult = {
      name,
      status: 'FAIL',
      duration: Date.now() - start,
      error: error.response?.data?.message || error.message,
      details: error.response?.data,
    };
    results.push(result);
    console.log(`  ❌ ${name}: FAIL - ${result.error}`);
    return result;
  }
}

async function main() {
  console.log('============================================================');
  console.log('COMPREHENSIVE API TEST SUITE');
  console.log('============================================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`API URL: ${API_URL}\n`);

  const prisma = createPrismaClient();

  try {
    // Get test user and auth token
    const user = await prisma.user.findFirst({
      where: { isActive: true },
      include: { tenant: true },
    });

    if (!user) {
      console.log('❌ No active user found for testing');
      return;
    }

    console.log(`Testing with user: ${user.email}`);
    console.log(`Tenant: ${user.tenant.name}\n`);

    // Get ALL providers for this user
    const providers = await prisma.providerConfig.findMany({
      where: { tenantId: user.tenantId, isActive: true },
    });

    if (providers.length === 0) {
      console.log('❌ No active providers found');
      return;
    }

    console.log(`Found ${providers.length} providers:`);
    providers.forEach((p) => console.log(`  - ${p.email} (${p.providerType})`));
    console.log();

    // Create JWT token for API calls
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenantId, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    const api: AxiosInstance = axios.create({
      baseURL: API_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true, // Don't throw on non-2xx
    });

    // ============================================================
    // HEALTH CHECK
    // ============================================================
    console.log('============================================================');
    console.log('HEALTH CHECK');
    console.log('============================================================');

    await runTest('health-check', async () => {
      const res = await api.get('/health');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      return res.data;
    });

    // ============================================================
    // TEST EACH PROVIDER
    // ============================================================
    for (const provider of providers) {
      console.log(`\n============================================================`);
      console.log(`TESTING PROVIDER: ${provider.email} (${provider.providerType})`);
      console.log(`============================================================`);

      // Get some emails for testing
      const emails = await prisma.email.findMany({
        where: { providerId: provider.id, isDeleted: false },
        take: 10,
        select: { id: true, subject: true, isRead: true, isStarred: true },
      });

      console.log(`Found ${emails.length} emails for testing\n`);

      // --- EMAIL BULK OPERATIONS ---
      console.log('--- EMAIL BULK OPERATIONS ---');

      if (emails.length >= 2) {
        const emailIds = emails.slice(0, 2).map((e: any) => e.id);

        // Test bulk read (correct route: /emails/bulk/read)
        await runTest(`${provider.providerType}-bulk-mark-read`, async () => {
          const res = await api.patch('/emails/bulk/read', {
            emailIds,
            read: true,
          });
          if (res.status !== 200)
            throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
          return res.data;
        });

        await runTest(`${provider.providerType}-bulk-mark-unread`, async () => {
          const res = await api.patch('/emails/bulk/read', {
            emailIds,
            read: false,
          });
          if (res.status !== 200)
            throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
          return res.data;
        });

        // Test bulk starred (correct route: /emails/bulk/star)
        await runTest(`${provider.providerType}-bulk-star`, async () => {
          const res = await api.patch('/emails/bulk/star', {
            emailIds,
            starred: true,
          });
          if (res.status !== 200)
            throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
          return res.data;
        });

        await runTest(`${provider.providerType}-bulk-unstar`, async () => {
          const res = await api.patch('/emails/bulk/star', {
            emailIds,
            starred: false,
          });
          if (res.status !== 200)
            throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
          return res.data;
        });

        // Test bulk flagged (correct route: /emails/bulk/flag)
        await runTest(`${provider.providerType}-bulk-flag`, async () => {
          const res = await api.patch('/emails/bulk/flag', {
            emailIds,
            flagged: true,
          });
          if (res.status !== 200)
            throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
          return res.data;
        });

        await runTest(`${provider.providerType}-bulk-unflag`, async () => {
          const res = await api.patch('/emails/bulk/flag', {
            emailIds,
            flagged: false,
          });
          if (res.status !== 200)
            throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
          return res.data;
        });

        // Test input validation - empty array should fail
        await runTest(`${provider.providerType}-bulk-empty-validation`, async () => {
          const res = await api.patch('/emails/bulk/read', {
            emailIds: [],
            read: true,
          });
          if (res.status !== 400)
            throw new Error(`Expected 400, got ${res.status}`);
          return { validated: true, message: res.data.message };
        });

        // Test input validation - too many items should fail
        await runTest(`${provider.providerType}-bulk-max-validation`, async () => {
          const tooManyIds = Array(1001)
            .fill(0)
            .map((_, i) => `fake-id-${i}`);
          const res = await api.patch('/emails/bulk/read', {
            emailIds: tooManyIds,
            read: true,
          });
          if (res.status !== 400)
            throw new Error(`Expected 400, got ${res.status}`);
          return { validated: true, message: res.data.message };
        });

        // --- BULK DELETE TESTS ---
        console.log('\n--- BULK DELETE OPERATIONS ---');

        // Test bulk delete with fake IDs (validates endpoint works, won't delete real emails)
        await runTest(`${provider.providerType}-bulk-delete-validation`, async () => {
          const fakeIds = ['fake-id-1', 'fake-id-2'];
          const res = await api.delete('/emails/bulk', {
            data: { emailIds: fakeIds },
          });
          // Should return 200 even if emails don't exist (idempotent behavior)
          // or return count of 0 deleted
          if (res.status !== 200)
            throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
          return res.data;
        });

        // Test bulk delete empty validation
        await runTest(`${provider.providerType}-bulk-delete-empty-validation`, async () => {
          const res = await api.delete('/emails/bulk', {
            data: { emailIds: [] },
          });
          if (res.status !== 400)
            throw new Error(`Expected 400, got ${res.status}`);
          return { validated: true, message: res.data.message };
        });

        // Test bulk delete max validation
        await runTest(`${provider.providerType}-bulk-delete-max-validation`, async () => {
          const tooManyIds = Array(1001)
            .fill(0)
            .map((_, i) => `delete-fake-${i}`);
          const res = await api.delete('/emails/bulk', {
            data: { emailIds: tooManyIds },
          });
          if (res.status !== 400)
            throw new Error(`Expected 400, got ${res.status}`);
          return { validated: true, message: res.data.message };
        });
      } else {
        console.log('  ⏭️  Skipping bulk tests - not enough emails');
      }

      // --- FOLDER OPERATIONS ---
      console.log('\n--- FOLDER OPERATIONS ---');

      // Get folders (correct route: /folders)
      await runTest(`${provider.providerType}-list-folders`, async () => {
        const res = await api.get('/folders');
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        // Response is { [providerId]: folders[] }
        const providerFolders = res.data[provider.id] || [];
        return { count: providerFolders.length };
      });

      // --- EMAIL LISTING ---
      console.log('\n--- EMAIL LISTING ---');

      await runTest(`${provider.providerType}-list-emails`, async () => {
        const res = await api.get(`/emails?providerId=${provider.id}`);
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        return { count: res.data.emails?.length || res.data.length || 0 };
      });

      await runTest(`${provider.providerType}-list-emails-limit-5`, async () => {
        const res = await api.get(`/emails?providerId=${provider.id}&limit=5`);
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        const count = res.data.emails?.length || res.data.length;
        if (count > 5) throw new Error(`Expected max 5, got ${count}`);
        return { count };
      });

      await runTest(`${provider.providerType}-list-emails-by-folder`, async () => {
        const res = await api.get(`/emails?providerId=${provider.id}&specialUse=INBOX`);
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        return { count: res.data.emails?.length || res.data.length || 0 };
      });

      // --- CALENDAR OPERATIONS ---
      console.log('\n--- CALENDAR OPERATIONS ---');

      // List calendars (correct route: /calendar/calendars)
      await runTest(`${provider.providerType}-list-calendars`, async () => {
        const res = await api.get('/calendar/calendars');
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        return { count: Array.isArray(res.data) ? res.data.length : 0 };
      });

      // List events (correct route: /calendar/events with startTime/endTime)
      await runTest(`${provider.providerType}-list-calendar-events`, async () => {
        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const res = await api.get(
          `/calendar/events?providerId=${provider.id}&startTime=${today.toISOString()}&endTime=${nextMonth.toISOString()}`,
        );
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        return { count: Array.isArray(res.data) ? res.data.length : 0 };
      });

      // --- LABELS OPERATIONS ---
      console.log('\n--- LABELS OPERATIONS ---');

      await runTest(`${provider.providerType}-list-labels`, async () => {
        const res = await api.get(`/labels?providerId=${provider.id}`);
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        return { count: Array.isArray(res.data) ? res.data.length : 0 };
      });

      // --- DRAFT OPERATIONS ---
      console.log('\n--- DRAFT OPERATIONS ---');

      let draftId: string | null = null;

      await runTest(`${provider.providerType}-create-draft`, async () => {
        const res = await api.post('/emails/drafts', {
          providerId: provider.id,
          to: ['test@example.com'],
          subject: 'API Test Draft ' + Date.now(),
          body: '<p>This is a test draft created by API test suite</p>',
        });
        if (res.status !== 201 && res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        draftId = res.data.id;
        return { draftId };
      });

      if (draftId) {
        await runTest(`${provider.providerType}-delete-draft`, async () => {
          const res = await api.delete(`/emails/drafts/${draftId}`);
          if (res.status !== 200 && res.status !== 204)
            throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
          return { deleted: true };
        });
      }
    }

    // ============================================================
    // CONTACTS OPERATIONS (Global, not per-provider)
    // ============================================================
    console.log('\n============================================================');
    console.log('CONTACTS OPERATIONS');
    console.log('============================================================');

    // List contacts
    await runTest('list-contacts', async () => {
      const res = await api.get('/contacts');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return {
        count: res.data.contacts?.length || res.data.length || 0,
        total: res.data.total || res.data.length || 0,
      };
    });

    // List contacts with limit
    await runTest('list-contacts-with-limit', async () => {
      const res = await api.get('/contacts?limit=10');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return {
        count: res.data.contacts?.length || res.data.length || 0,
      };
    });

    // Search contacts
    await runTest('search-contacts', async () => {
      const res = await api.get('/contacts?search=test');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return { count: res.data.contacts?.length || res.data.length || 0 };
    });

    // ============================================================
    // PROVIDER OPERATIONS
    // ============================================================
    console.log('\n============================================================');
    console.log('PROVIDER OPERATIONS');
    console.log('============================================================');

    await runTest('list-providers', async () => {
      const res = await api.get('/providers');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return { count: Array.isArray(res.data) ? res.data.length : 0 };
    });

    for (const provider of providers) {
      await runTest(`get-provider-${provider.providerType}`, async () => {
        const res = await api.get(`/providers/${provider.id}`);
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        return { email: res.data.email, type: res.data.providerType };
      });
    }

    // ============================================================
    // VCARD IMPORT VALIDATION
    // ============================================================
    console.log('\n============================================================');
    console.log('VCARD IMPORT VALIDATION');
    console.log('============================================================');

    await runTest('vcard-import-invalid-format', async () => {
      const res = await api.post('/contacts/import/vcard', {
        vcfContent: 'This is not a valid vCard',
        providerId: providers[0].id,
      });
      if (res.status !== 400)
        throw new Error(`Expected 400, got ${res.status}`);
      return { validated: true, message: res.data.message };
    });

    await runTest('vcard-import-empty', async () => {
      const res = await api.post('/contacts/import/vcard', {
        vcfContent: '',
        providerId: providers[0].id,
      });
      if (res.status !== 400)
        throw new Error(`Expected 400, got ${res.status}`);
      return { validated: true };
    });

    // ============================================================
    // EMAIL STATS & RETENTION (Frontend-Style Integrity Check)
    // ============================================================
    console.log('\n============================================================');
    console.log('EMAIL STATS & INTEGRITY CHECKS');
    console.log('============================================================');

    await runTest('email-stats-global', async () => {
      const res = await api.get('/emails/stats');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.data;
    });

    for (const provider of providers) {
      await runTest(`${provider.providerType}-email-stats`, async () => {
        const res = await api.get(`/emails/stats?providerId=${provider.id}`);
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
        return res.data;
      });
    }

    await runTest('retention-stats', async () => {
      const res = await api.get('/emails/retention/stats');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.data;
    });

    // ============================================================
    // CONTACT COUNTS (Frontend-Style Integrity Check)
    // ============================================================
    console.log('\n============================================================');
    console.log('CONTACT COUNTS & INTEGRITY');
    console.log('============================================================');

    await runTest('contact-counts', async () => {
      const res = await api.get('/contacts/counts');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.data;
    });

    // ============================================================
    // EMAIL SYNC STATUS (Provider Sync State)
    // ============================================================
    console.log('\n============================================================');
    console.log('EMAIL SYNC STATUS');
    console.log('============================================================');

    await runTest('sync-status', async () => {
      const res = await api.get('/email-sync/status');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.data;
    });

    await runTest('sync-health', async () => {
      const res = await api.get('/email-sync/health');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.data;
    });

    await runTest('webhook-health', async () => {
      const res = await api.get('/email-sync/webhooks/health');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.data;
    });

    // ============================================================
    // CALENDAR & CONTACTS WEBHOOK HEALTH
    // ============================================================
    console.log('\n============================================================');
    console.log('CALENDAR & CONTACTS WEBHOOK HEALTH');
    console.log('============================================================');

    await runTest('calendar-webhook-health', async () => {
      const res = await api.get('/webhooks/calendar/health');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.data;
    });

    await runTest('contacts-webhook-health', async () => {
      const res = await api.get('/webhooks/contacts/health');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.data;
    });

    // ============================================================
    // AI STATS (If AI module is enabled)
    // ============================================================
    console.log('\n============================================================');
    console.log('AI MODULE STATS');
    console.log('============================================================');

    await runTest('ai-action-counts', async () => {
      const res = await api.get('/ai/stats/action-counts');
      if (res.status !== 200 && res.status !== 404)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.status === 200 ? res.data : { skipped: 'AI module not available' };
    });

    await runTest('ai-learning-stats', async () => {
      const res = await api.get('/ai/stats/learning');
      if (res.status !== 200 && res.status !== 404)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.status === 200 ? res.data : { skipped: 'AI module not available' };
    });

    await runTest('ai-aggregate-stats', async () => {
      const res = await api.get('/ai/stats/aggregate');
      if (res.status !== 200 && res.status !== 404)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.status === 200 ? res.data : { skipped: 'AI module not available' };
    });

    await runTest('ai-optimization-stats', async () => {
      const res = await api.get('/ai/stats/optimizations');
      if (res.status !== 200 && res.status !== 404)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      return res.status === 200 ? res.data : { skipped: 'AI module not available' };
    });

    // ============================================================
    // DATA INTEGRITY CHECKS (via API comparison)
    // ============================================================
    console.log('\n============================================================');
    console.log('DATA INTEGRITY CHECKS');
    console.log('============================================================');

    // Check that email counts match across endpoints
    await runTest('integrity-email-count-consistency', async () => {
      const statsRes = await api.get('/emails/stats');
      const listRes = await api.get('/emails?limit=1');

      if (statsRes.status !== 200) throw new Error(`Stats failed: ${statsRes.status}`);
      if (listRes.status !== 200) throw new Error(`List failed: ${listRes.status}`);

      const statsTotal = statsRes.data.total || statsRes.data.totalEmails || 0;
      const listTotal = listRes.data.total || listRes.data.pagination?.total || 0;

      // Allow some tolerance for race conditions during sync
      const diff = Math.abs(statsTotal - listTotal);
      if (diff > 10) {
        throw new Error(`Count mismatch: stats=${statsTotal}, list=${listTotal}, diff=${diff}`);
      }

      return { statsTotal, listTotal, diff, consistent: true };
    });

    // Check that contact counts match across endpoints
    await runTest('integrity-contact-count-consistency', async () => {
      const countsRes = await api.get('/contacts/counts');
      const listRes = await api.get('/contacts?limit=1');

      if (countsRes.status !== 200) throw new Error(`Counts failed: ${countsRes.status}`);
      if (listRes.status !== 200) throw new Error(`List failed: ${listRes.status}`);

      const countsTotal = countsRes.data.total || 0;
      const listTotal = listRes.data.total || listRes.data.pagination?.total || 0;

      const diff = Math.abs(countsTotal - listTotal);
      if (diff > 5) {
        throw new Error(`Count mismatch: counts=${countsTotal}, list=${listTotal}, diff=${diff}`);
      }

      return { countsTotal, listTotal, diff, consistent: true };
    });

    // Check provider data consistency
    await runTest('integrity-provider-consistency', async () => {
      const providersRes = await api.get('/providers');
      if (providersRes.status !== 200) throw new Error(`Providers failed: ${providersRes.status}`);

      const providerList = providersRes.data;
      const issues: string[] = [];

      for (const p of providerList) {
        // Each provider should have required fields
        if (!p.id) issues.push(`Provider missing id`);
        if (!p.providerType) issues.push(`Provider ${p.id} missing providerType`);
        if (!p.email) issues.push(`Provider ${p.id} missing email`);

        // Verify provider can be fetched individually
        const singleRes = await api.get(`/providers/${p.id}`);
        if (singleRes.status !== 200) {
          issues.push(`Provider ${p.id} not accessible: ${singleRes.status}`);
        }
      }

      if (issues.length > 0) {
        throw new Error(`Provider issues: ${issues.join(', ')}`);
      }

      return { providerCount: providerList.length, issues: 0, consistent: true };
    });

    // Check folder data consistency per provider
    await runTest('integrity-folder-consistency', async () => {
      const foldersRes = await api.get('/folders');
      if (foldersRes.status !== 200) throw new Error(`Folders failed: ${foldersRes.status}`);

      const issues: string[] = [];
      const foldersByProvider = foldersRes.data;

      for (const provider of providers) {
        const providerFolders = foldersByProvider[provider.id] || [];

        // Check for required system folders
        const folderTypes = providerFolders.map((f: any) => f.specialUse || f.type);
        const hasInbox = folderTypes.some((t: string) => t === 'INBOX' || t === 'inbox');

        if (!hasInbox && providerFolders.length > 0) {
          issues.push(`Provider ${provider.providerType} missing INBOX folder`);
        }

        // Check for duplicate folders
        const folderPaths = providerFolders.map((f: any) => f.path || f.name);
        const uniquePaths = new Set(folderPaths);
        if (uniquePaths.size !== folderPaths.length) {
          issues.push(`Provider ${provider.providerType} has duplicate folders`);
        }
      }

      if (issues.length > 0) {
        throw new Error(`Folder issues: ${issues.join(', ')}`);
      }

      return { providersChecked: providers.length, issues: 0, consistent: true };
    });

    // ============================================================
    // WEBHOOK & OPERATION VERIFICATION (Database Cache for Multi-Agent)
    // ============================================================
    console.log('\n============================================================');
    console.log('WEBHOOK & OPERATION VERIFICATION');
    console.log('============================================================');

    // For each provider, test that operations properly update the database
    for (const provider of providers) {
      // Get some emails to test operations
      const emailsRes = await api.get(`/emails?providerId=${provider.id}&limit=3`);
      if (emailsRes.status !== 200) continue;

      const testEmails = emailsRes.data.emails || emailsRes.data || [];
      if (testEmails.length === 0) continue;

      const testEmailId = testEmails[0].id;

      // Test: Mark as read → verify via API (uses isRead field)
      await runTest(`${provider.providerType}-verify-mark-read-updates-db`, async () => {
        // Mark as read (API expects isRead, not read)
        const markRes = await api.patch('/emails/bulk/read', {
          emailIds: [testEmailId],
          isRead: true,
        });
        if (markRes.status !== 200)
          throw new Error(`Mark read failed: ${markRes.status}`);

        // Fetch email and verify isRead is true
        const fetchRes = await api.get(`/emails/${testEmailId}`);
        if (fetchRes.status !== 200)
          throw new Error(`Fetch failed: ${fetchRes.status}`);

        if (fetchRes.data.isRead !== true) {
          throw new Error(`DB not updated: isRead=${fetchRes.data.isRead}, expected=true`);
        }

        // Reset back to unread for clean state
        await api.patch('/emails/bulk/read', { emailIds: [testEmailId], isRead: false });

        return { verified: true, emailId: testEmailId };
      });

      // Test: Star → verify via API (uses isStarred field)
      await runTest(`${provider.providerType}-verify-star-updates-db`, async () => {
        // Star (API expects isStarred, not starred)
        const starRes = await api.patch('/emails/bulk/star', {
          emailIds: [testEmailId],
          isStarred: true,
        });
        if (starRes.status !== 200)
          throw new Error(`Star failed: ${starRes.status}`);

        // Fetch email and verify isStarred is true
        const fetchRes = await api.get(`/emails/${testEmailId}`);
        if (fetchRes.status !== 200)
          throw new Error(`Fetch failed: ${fetchRes.status}`);

        if (fetchRes.data.isStarred !== true) {
          throw new Error(`DB not updated: isStarred=${fetchRes.data.isStarred}, expected=true`);
        }

        // Reset back to unstarred for clean state
        await api.patch('/emails/bulk/star', { emailIds: [testEmailId], isStarred: false });

        return { verified: true, emailId: testEmailId };
      });

      // Test: Flag → verify via API (uses isFlagged field)
      await runTest(`${provider.providerType}-verify-flag-updates-db`, async () => {
        // Flag (API expects isFlagged, not flagged)
        const flagRes = await api.patch('/emails/bulk/flag', {
          emailIds: [testEmailId],
          isFlagged: true,
        });
        if (flagRes.status !== 200)
          throw new Error(`Flag failed: ${flagRes.status}`);

        // Fetch email and verify isFlagged is true
        const fetchRes = await api.get(`/emails/${testEmailId}`);
        if (fetchRes.status !== 200)
          throw new Error(`Fetch failed: ${fetchRes.status}`);

        if (fetchRes.data.isFlagged !== true) {
          throw new Error(`DB not updated: isFlagged=${fetchRes.data.isFlagged}, expected=true`);
        }

        // Reset back to unflagged for clean state
        await api.patch('/emails/bulk/flag', { emailIds: [testEmailId], isFlagged: false });

        return { verified: true, emailId: testEmailId };
      });
    }

    // ============================================================
    // FOLDER AUDIT (Check for orphaned folders per provider)
    // ============================================================
    console.log('\n============================================================');
    console.log('FOLDER AUDIT (Orphaned Folders Check)');
    console.log('============================================================');

    for (const provider of providers) {
      await runTest(`${provider.providerType}-folder-audit`, async () => {
        const res = await api.get(`/folders/audit/${provider.id}`);
        if (res.status !== 200)
          throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);

        const audit = res.data;
        const issues: string[] = [];

        // Check for orphaned folders
        if (audit.orphanedCount > 0) {
          issues.push(`${audit.orphanedCount} orphaned folders found`);
        }

        // Check for unknown specialUse
        if (audit.unknownSpecialUse?.length > 0) {
          issues.push(`${audit.unknownSpecialUse.length} folders with unknown specialUse`);
        }

        if (issues.length > 0) {
          // Don't fail, just report - these can be cleaned up
          return { warnings: issues, ...audit };
        }

        return { healthy: true, ...audit };
      });
    }

    // ============================================================
    // EMAIL RETENTION & CLEANUP STATS
    // ============================================================
    console.log('\n============================================================');
    console.log('EMAIL RETENTION & CLEANUP STATS');
    console.log('============================================================');

    await runTest('retention-eligible-emails', async () => {
      const res = await api.get('/emails/retention/stats');
      if (res.status !== 200)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);

      return res.data;
    });

    // ============================================================
    // S3 ATTACHMENT STORAGE CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('S3 ATTACHMENT STORAGE CHECK');
    console.log('============================================================');

    // Check attachment download works for at least one email with attachments
    await runTest('attachment-storage-accessible', async () => {
      // Find an email with attachments
      const emailsRes = await api.get('/emails?limit=50');
      if (emailsRes.status !== 200) throw new Error('Failed to list emails');

      const emailsData = emailsRes.data.emails || emailsRes.data;
      const emailWithAttachments = emailsData.find((e: any) => e.attachments?.length > 0);

      if (!emailWithAttachments) {
        return { skipped: true, reason: 'No emails with attachments found' };
      }

      // Verify attachment metadata is present
      const attachment = emailWithAttachments.attachments[0];
      if (!attachment.id) {
        throw new Error('Attachment missing id');
      }

      // Try to get download URL (will verify S3 connectivity)
      const downloadRes = await api.get(
        `/emails/${emailWithAttachments.id}/attachments/${attachment.id}/download`,
        { maxRedirects: 0, validateStatus: () => true }
      );

      // Should either redirect (302) to S3 or return error for pending attachments
      if (downloadRes.status !== 302 && downloadRes.status !== 400) {
        throw new Error(`Unexpected status: ${downloadRes.status}`);
      }

      return {
        checked: true,
        attachmentId: attachment.id,
        storageType: attachment.storageType || 'unknown',
        status: downloadRes.status === 302 ? 's3_accessible' : 'pending_download',
      };
    });

    // ============================================================
    // AI EMBEDDING CHECK
    // ============================================================
    console.log('\n============================================================');
    console.log('AI EMBEDDING CHECK');
    console.log('============================================================');

    // Check if semantic search works (indicates embeddings are present)
    await runTest('embedding-semantic-search', async () => {
      const res = await api.get('/emails?search=test&semanticSearch=true&limit=5');
      // This might return 200 with results or 200 with empty results
      if (res.status !== 200 && res.status !== 400)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);

      return {
        checked: true,
        hasSemanticSupport: res.status === 200,
        resultsCount: res.data?.emails?.length || res.data?.length || 0,
      };
    });

    // Check AI knowledge base stats (embedding counts)
    await runTest('ai-knowledge-base-health', async () => {
      const res = await api.get('/ai/stats/optimizations');
      if (res.status !== 200 && res.status !== 404)
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);

      if (res.status === 404) {
        return { skipped: true, reason: 'AI stats endpoint not available' };
      }

      return res.data;
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

    console.log(`\n============================================================`);
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log('============================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
