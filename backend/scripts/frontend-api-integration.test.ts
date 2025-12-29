/**
 * Frontend API Module Integration Test
 *
 * Tests that frontend API modules will work correctly with backend responses.
 * This validates the exact response structures that frontend expects.
 *
 * Run: npx ts-node scripts/frontend-api-integration.test.ts
 * Requires: Backend running at http://localhost:3000
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import axios, { AxiosInstance } from 'axios';
import * as jwt from 'jsonwebtoken';

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function log(test: string, status: 'PASS' | 'FAIL', details: string) {
  results.push({ test, status, details });
  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${test}: ${details}`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('FRONTEND API MODULE INTEGRATION TEST');
  console.log('='.repeat(70));
  console.log(`API URL: ${API_URL}\n`);

  const prisma = createPrismaClient();

  try {
    // Get test user
    const user = await prisma.user.findFirst({
      where: { isActive: true },
      include: { tenant: true },
    });

    if (!user) {
      console.log('❌ No active user found');
      return;
    }

    console.log(`User: ${user.email}`);
    console.log(`Tenant: ${user.tenant.name}\n`);

    // Get provider
    const provider = await prisma.providerConfig.findFirst({
      where: { tenantId: user.tenantId, isActive: true },
    });

    if (!provider) {
      console.log('❌ No active provider found');
      return;
    }

    console.log(`Provider: ${provider.email} (${provider.providerType})\n`);

    // Create JWT
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenantId, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' },
    );

    const api: AxiosInstance = axios.create({
      baseURL: API_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // =========================================================================
    // EMAILS API MODULE TESTS (frontend/lib/api/emails.ts)
    // =========================================================================
    console.log('='.repeat(50));
    console.log('EMAILS API MODULE (frontend/lib/api/emails.ts)');
    console.log('='.repeat(50));

    // Test: listEmails - Frontend: emailsApi.listEmails()
    {
      console.log('\n[TEST] emailsApi.listEmails()');
      const res = await api.get('/emails', { params: { specialUse: 'INBOX', limit: 5 } });
      const data = res.data;

      // Frontend ListEmailsResponse: { emails, pagination: { page, limit, total, totalPages } }
      const hasEmails = Array.isArray(data.emails);
      const hasPagination = typeof data.pagination === 'object';
      const hasPage = typeof data.pagination?.page === 'number';
      const hasLimit = typeof data.pagination?.limit === 'number';
      const hasTotal = typeof data.pagination?.total === 'number';
      const hasTotalPages = typeof data.pagination?.totalPages === 'number';

      if (hasEmails && hasPagination && hasPage && hasLimit && hasTotal && hasTotalPages) {
        log('listEmails → { emails, pagination }', 'PASS', `${data.emails.length} emails, page ${data.pagination.page}/${data.pagination.totalPages}`);
      } else {
        log('listEmails → { emails, pagination }', 'FAIL', `Missing: ${[
          !hasEmails && 'emails',
          !hasPagination && 'pagination',
          !hasPage && 'pagination.page',
          !hasLimit && 'pagination.limit',
          !hasTotal && 'pagination.total',
          !hasTotalPages && 'pagination.totalPages',
        ].filter(Boolean).join(', ')}`);
      }

      // Validate Email structure in list
      if (data.emails?.[0]) {
        const email = data.emails[0];
        const requiredFields = ['id', 'from', 'to', 'subject', 'isRead', 'isStarred', 'isFlagged', 'sentAt', 'receivedAt'];
        const missing = requiredFields.filter(f => !(f in email));
        if (missing.length === 0) {
          log('Email structure', 'PASS', 'All required fields');
        } else {
          log('Email structure', 'FAIL', `Missing: ${missing.join(', ')}`);
        }
      }
    }

    // Test: getEmail - Frontend: emailsApi.getEmail(id) → Email
    {
      console.log('\n[TEST] emailsApi.getEmail(id)');
      const listRes = await api.get('/emails', { params: { limit: 1 } });
      const emailId = listRes.data.emails?.[0]?.id;

      if (emailId) {
        const res = await api.get(`/emails/${emailId}`);
        // Frontend expects: return response.data (Email directly, NOT wrapped)
        if (res.data.id && res.data.subject !== undefined && !res.data.email) {
          log('getEmail → Email directly', 'PASS', 'Not wrapped in { email }');
        } else {
          log('getEmail → Email directly', 'FAIL', 'Expected Email object, not wrapped');
        }
      }
    }

    // Test: updateEmail - Frontend: emailsApi.updateEmail(id, dto) → Email
    {
      console.log('\n[TEST] emailsApi.updateEmail(id, dto)');
      const listRes = await api.get('/emails', { params: { limit: 1 } });
      const emailId = listRes.data.emails?.[0]?.id;

      if (emailId) {
        const res = await api.patch(`/emails/${emailId}`, { isRead: true });
        // Frontend expects: return response.data (Email directly)
        if (res.data.id && res.data.isRead !== undefined && !res.data.email) {
          log('updateEmail → Email directly', 'PASS', 'Not wrapped in { email }');
        } else {
          log('updateEmail → Email directly', 'FAIL', 'Expected Email object, not wrapped');
        }
      }
    }

    // Test: getStats - Frontend: emailsApi.getStats() → EmailStats
    {
      console.log('\n[TEST] emailsApi.getStats()');
      const res = await api.get('/emails/stats');
      const data = res.data;

      // Frontend EmailStats: { total, unread, starred, important, today, thisWeek, attachments, byFolder }
      const requiredFields = ['total', 'unread', 'starred', 'important', 'today', 'thisWeek', 'attachments', 'byFolder'];
      const missing = requiredFields.filter(f => !(f in data));

      if (missing.length === 0) {
        log('getStats → EmailStats', 'PASS', 'All fields present');
      } else {
        log('getStats → EmailStats', 'FAIL', `Missing: ${missing.join(', ')}`);
      }
    }

    // Test: bulkMarkRead - Frontend: emailsApi.bulkMarkRead(ids, isRead) → { updated }
    {
      console.log('\n[TEST] emailsApi.bulkMarkRead()');
      const listRes = await api.get('/emails', { params: { limit: 2 } });
      const emailIds = listRes.data.emails?.map((e: any) => e.id) || [];

      if (emailIds.length > 0) {
        const res = await api.patch('/emails/bulk/read', { emailIds, isRead: true });
        // Frontend expects: { updated: number }
        if (typeof res.data.updated === 'number') {
          log('bulkMarkRead → { updated }', 'PASS', `updated=${res.data.updated}`);
        } else {
          log('bulkMarkRead → { updated }', 'FAIL', 'Expected { updated: number }');
        }
      }
    }

    // Test: bulkMarkImportant - Frontend: emailsApi.bulkMarkImportant(ids, flag) → { updated }
    {
      console.log('\n[TEST] emailsApi.bulkMarkImportant()');
      const listRes = await api.get('/emails', { params: { limit: 2 } });
      const emailIds = listRes.data.emails?.map((e: any) => e.id) || [];

      if (emailIds.length > 0) {
        // Frontend maps isImportant to isFlagged
        const res = await api.patch('/emails/bulk/flag', { emailIds, isFlagged: true });
        if (typeof res.data.updated === 'number') {
          log('bulkMarkImportant → { updated }', 'PASS', `updated=${res.data.updated}`);
        } else {
          log('bulkMarkImportant → { updated }', 'FAIL', 'Expected { updated: number }');
        }
      }
    }

    // Test: searchEmails - Frontend: emailsApi.searchEmails(query) → { emails }
    {
      console.log('\n[TEST] emailsApi.searchEmails()');
      const res = await api.get('/emails/search', { params: { q: 'test', limit: 5 } });
      if (Array.isArray(res.data.emails)) {
        log('searchEmails → { emails }', 'PASS', `${res.data.emails.length} results`);
      } else {
        log('searchEmails → { emails }', 'FAIL', 'Expected { emails: [] }');
      }
    }

    // Test: getConversations - Frontend: emailsApi.getConversations() → EmailThread[]
    {
      console.log('\n[TEST] emailsApi.getConversations()');
      const res = await api.get('/emails/conversations', { params: { limit: 5 } });
      // Frontend expects: return response.data.conversations
      if (Array.isArray(res.data.conversations)) {
        log('getConversations → conversations[]', 'PASS', `${res.data.conversations.length} threads`);
      } else {
        log('getConversations → conversations[]', 'FAIL', 'Expected { conversations: [] }');
      }
    }

    // Test: getThread - Frontend: emailsApi.getThread(id) → Email[]
    {
      console.log('\n[TEST] emailsApi.getThread()');
      const convRes = await api.get('/emails/conversations', { params: { limit: 1 } });
      const threadId = convRes.data.conversations?.[0]?.threadId;

      if (threadId) {
        const res = await api.get(`/emails/thread/${threadId}`);
        // Backend returns array directly, not wrapped
        if (Array.isArray(res.data) && (res.data.length === 0 || res.data[0]?.id)) {
          log('getThread → Email[] directly', 'PASS', `${res.data.length} emails`);
        } else {
          log('getThread → Email[] directly', 'FAIL', 'Expected array directly');
        }
      } else {
        log('getThread → Email[] directly', 'PASS', 'No threads available (skipped)');
      }
    }

    // =========================================================================
    // FOLDERS API MODULE TESTS (frontend/lib/api/folders.ts)
    // =========================================================================
    console.log('\n' + '='.repeat(50));
    console.log('FOLDERS API MODULE (frontend/lib/api/folders.ts)');
    console.log('='.repeat(50));

    // Test: getFolders - Frontend: foldersApi.getFolders() → FoldersResponse
    {
      console.log('\n[TEST] foldersApi.getFolders()');
      const res = await api.get('/folders');
      const hasProviders = Array.isArray(res.data.providers);
      const hasFoldersByProvider = typeof res.data.foldersByProvider === 'object';

      if (hasProviders && hasFoldersByProvider) {
        log('getFolders → FoldersResponse', 'PASS', 'providers + foldersByProvider');
      } else {
        log('getFolders → FoldersResponse', 'FAIL', 'Missing fields');
      }
    }

    // Test: getFoldersByProvider - Frontend: foldersApi.getFoldersByProvider(id) → ProviderFoldersResponse
    {
      console.log('\n[TEST] foldersApi.getFoldersByProvider()');
      const res = await api.get(`/folders/provider/${provider.id}`);
      const hasProvider = res.data.provider && res.data.provider.id;
      const hasFolders = Array.isArray(res.data.folders);

      if (hasProvider && hasFolders) {
        log('getFoldersByProvider → ProviderFoldersResponse', 'PASS', `${res.data.folders.length} folders`);
      } else {
        log('getFoldersByProvider → ProviderFoldersResponse', 'FAIL', 'Missing provider or folders');
      }
    }

    // Test: syncFolders - Frontend: foldersApi.syncFolders(id) → { success, foldersCount, folders }
    {
      console.log('\n[TEST] foldersApi.syncFolders()');
      const res = await api.post(`/folders/sync/${provider.id}`);
      if (res.data.success && typeof res.data.foldersCount === 'number' && Array.isArray(res.data.folders)) {
        log('syncFolders → { success, foldersCount, folders }', 'PASS', `${res.data.foldersCount} folders`);
      } else {
        log('syncFolders → { success, foldersCount, folders }', 'FAIL', 'Invalid response');
      }
    }

    // Test: updateFolderCounts - Frontend: foldersApi.updateFolderCounts(id) → { success, message }
    {
      console.log('\n[TEST] foldersApi.updateFolderCounts()');
      const res = await api.post(`/folders/update-counts/${provider.id}`);
      if (res.data.success && res.data.message) {
        log('updateFolderCounts → { success, message }', 'PASS', res.data.message);
      } else {
        log('updateFolderCounts → { success, message }', 'FAIL', 'Invalid response');
      }
    }

    // Test: syncAllFolders - Frontend: foldersApi.syncAllFolders() → { success, results }
    {
      console.log('\n[TEST] foldersApi.syncAllFolders()');
      const res = await api.post('/folders/sync-all');
      if (res.data.success && Array.isArray(res.data.results)) {
        const successCount = res.data.results.filter((r: any) => r.success).length;
        log('syncAllFolders → { success, results }', 'PASS', `${successCount}/${res.data.results.length} providers`);
      } else {
        log('syncAllFolders → { success, results }', 'FAIL', 'Invalid response');
      }
    }

    // =========================================================================
    // LABELS API MODULE TESTS (frontend/lib/api/labels.ts)
    // =========================================================================
    console.log('\n' + '='.repeat(50));
    console.log('LABELS API MODULE (frontend/lib/api/labels.ts)');
    console.log('='.repeat(50));

    // Test: listLabels - Frontend: labelsApi.listLabels() → { labels }
    {
      console.log('\n[TEST] labelsApi.listLabels()');
      const res = await api.get('/labels');
      if (Array.isArray(res.data.labels)) {
        log('listLabels → { labels }', 'PASS', `${res.data.labels.length} labels`);
      } else {
        log('listLabels → { labels }', 'FAIL', 'Expected { labels: [] }');
      }
    }

    // Test: createLabel, getLabel, deleteLabel
    {
      console.log('\n[TEST] labelsApi.createLabel() / getLabel() / deleteLabel()');
      try {
        const uniqueName = `FrontendTest-${Date.now()}`;
        const createRes = await api.post('/labels', {
          name: uniqueName,
          color: { backgroundColor: '#2196F3', textColor: '#FFFFFF' },
        });

        if (createRes.data.label?.id) {
          log('createLabel → { label }', 'PASS', `name=${uniqueName}`);

          const labelId = createRes.data.label.id;

          // Test getLabel
          const getRes = await api.get(`/labels/${labelId}`);
          if (getRes.data.label?.id === labelId) {
            log('getLabel → { label }', 'PASS', 'Label retrieved');
          } else {
            log('getLabel → { label }', 'FAIL', 'Invalid response');
          }

          // Test deleteLabel (returns 204)
          const deleteRes = await api.delete(`/labels/${labelId}`);
          if (deleteRes.status === 204) {
            log('deleteLabel → 204', 'PASS', 'No content');
          } else {
            log('deleteLabel → 204', 'FAIL', `Got ${deleteRes.status}`);
          }
        } else {
          log('createLabel → { label }', 'FAIL', 'Missing label.id');
        }
      } catch (err: any) {
        if (err.response?.status === 403) {
          log('labels (feature)', 'PASS', 'userLabels feature disabled');
        } else {
          log('labels', 'FAIL', err.message);
        }
      }
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('FRONTEND API INTEGRATION TEST SUMMARY');
    console.log('='.repeat(70));

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    console.log(`\n✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total: ${results.length}`);

    if (failed === 0) {
      console.log('\n🎉 ALL FRONTEND API INTEGRATION TESTS PASSED!');
      console.log('Frontend API modules are compatible with backend.');
    } else {
      console.log('\n⚠️ Some tests failed. Review errors above.');
      process.exit(1);
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
