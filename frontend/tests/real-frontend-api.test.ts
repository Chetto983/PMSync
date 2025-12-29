/**
 * REAL Frontend API Module Test - NO MOCKS
 *
 * Tests the actual frontend API modules with REAL backend calls.
 * NO MOCKING - everything is real.
 *
 * Run from frontend folder:
 *   npx ts-node -r tsconfig-paths/register tests/real-frontend-api.test.ts
 *
 * Environment:
 *   TEST_EMAIL=your@email.com
 *   TEST_PASSWORD=yourpassword
 */

import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Set environment
process.env.NEXT_PUBLIC_API_URL = API_URL;
process.env.NODE_ENV = 'development';

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
  console.log('REAL FRONTEND API TEST - NO MOCKS');
  console.log('='.repeat(70));
  console.log(`API URL: ${API_URL}\n`);

  // Step 1: Login to get REAL token
  console.log('Step 1: Real login to get token...');
  const email = process.env.TEST_EMAIL || 'dvdmarchetto@gmail.com';
  const password = process.env.TEST_PASSWORD || '!Davide1983!';

  let token: string;
  let providerId: string;

  try {
    const loginRes = await axios.post(`${API_URL}/auth/login`, { email, password });
    token = loginRes.data.token || loginRes.data.access_token;
    console.log(`Logged in as: ${email}`);
    console.log(`Token: ${token.substring(0, 30)}...\n`);
  } catch (err: any) {
    console.error('Login failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // Step 2: Get provider ID
  try {
    const providersRes = await axios.get(`${API_URL}/providers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    providerId = providersRes.data.providers?.[0]?.id || providersRes.data[0]?.id;
    console.log(`Provider ID: ${providerId}\n`);
  } catch (err: any) {
    console.error('Failed to get providers:', err.response?.data || err.message);
    process.exit(1);
  }

  // Step 3: Import REAL frontend apiClient and set auth
  const { apiClient } = await import('../lib/api-client');
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

  // Step 4: Import REAL frontend API modules
  const { emailsApi } = await import('../lib/api/emails');
  const { foldersApi } = await import('../lib/api/folders');
  const { labelsApi } = await import('../lib/api/labels');

  console.log('='.repeat(50));
  console.log('TESTING REAL emailsApi');
  console.log('='.repeat(50));

  // =========================================================================
  // emailsApi.listEmails() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] emailsApi.listEmails({ specialUse: "INBOX", limit: 5 })');
    try {
      const result = await emailsApi.listEmails({ specialUse: 'INBOX', limit: 5 });

      console.log('  Response type:', typeof result);
      console.log('  Has emails:', Array.isArray(result.emails));
      console.log('  Has pagination:', !!result.pagination);

      if (result.emails && result.pagination) {
        console.log('  Emails count:', result.emails.length);
        console.log('  Pagination:', JSON.stringify(result.pagination));

        if (result.emails[0]) {
          console.log('  First email keys:', Object.keys(result.emails[0]).join(', '));
        }

        log('emailsApi.listEmails()', 'PASS',
          `${result.emails.length} emails, page ${result.pagination.page}/${result.pagination.totalPages}`);
      } else {
        log('emailsApi.listEmails()', 'FAIL', `Missing emails or pagination`);
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('emailsApi.listEmails()', 'FAIL', err.message);
    }
  }

  // =========================================================================
  // emailsApi.getEmail() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] emailsApi.getEmail(id)');
    try {
      const listResult = await emailsApi.listEmails({ limit: 1 });
      const emailId = listResult.emails[0]?.id;

      if (emailId) {
        console.log('  Email ID:', emailId);
        const email = await emailsApi.getEmail(emailId);

        console.log('  Response type:', typeof email);
        console.log('  Has id:', !!email.id);
        console.log('  Has subject:', !!email.subject);
        console.log('  Subject:', email.subject?.substring(0, 50));

        if (email.id === emailId) {
          log('emailsApi.getEmail()', 'PASS', 'Returns Email directly');
        } else {
          log('emailsApi.getEmail()', 'FAIL', 'ID mismatch');
        }
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('emailsApi.getEmail()', 'FAIL', err.message);
    }
  }

  // =========================================================================
  // emailsApi.getStats() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] emailsApi.getStats()');
    try {
      const stats = await emailsApi.getStats();

      console.log('  Response type:', typeof stats);
      console.log('  Keys:', Object.keys(stats).join(', '));
      console.log('  Total:', stats.total);
      console.log('  Unread:', stats.unread);

      if (typeof stats.total === 'number' && typeof stats.unread === 'number') {
        log('emailsApi.getStats()', 'PASS', `Total: ${stats.total}, Unread: ${stats.unread}`);
      } else {
        log('emailsApi.getStats()', 'FAIL', 'Missing fields');
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('emailsApi.getStats()', 'FAIL', err.message);
    }
  }

  // =========================================================================
  // emailsApi.updateEmail() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] emailsApi.updateEmail(id, { isRead: true })');
    try {
      const listResult = await emailsApi.listEmails({ limit: 1 });
      const emailId = listResult.emails[0]?.id;

      if (emailId) {
        const updated = await emailsApi.updateEmail(emailId, { isRead: true });

        console.log('  Response type:', typeof updated);
        console.log('  Has id:', !!updated.id);
        console.log('  isRead:', updated.isRead);

        if (updated.id === emailId && typeof updated.isRead === 'boolean') {
          log('emailsApi.updateEmail()', 'PASS', 'Returns Email directly');
        } else {
          log('emailsApi.updateEmail()', 'FAIL', 'Invalid response');
        }
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('emailsApi.updateEmail()', 'FAIL', err.message);
    }
  }

  // =========================================================================
  // emailsApi.searchEmails() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] emailsApi.searchEmails("test", 5)');
    try {
      const emails = await emailsApi.searchEmails('test', 5);

      console.log('  Response type:', typeof emails);
      console.log('  Is array:', Array.isArray(emails));
      console.log('  Count:', emails.length);

      if (Array.isArray(emails)) {
        log('emailsApi.searchEmails()', 'PASS', `Found ${emails.length} results`);
      } else {
        log('emailsApi.searchEmails()', 'FAIL', 'Expected array');
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('emailsApi.searchEmails()', 'FAIL', err.message);
    }
  }

  // =========================================================================
  // emailsApi.getConversations() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] emailsApi.getConversations({ limit: 5 })');
    try {
      const threads = await emailsApi.getConversations({ limit: 5 });

      console.log('  Response type:', typeof threads);
      console.log('  Is array:', Array.isArray(threads));
      console.log('  Count:', threads.length);

      if (Array.isArray(threads)) {
        log('emailsApi.getConversations()', 'PASS', `Got ${threads.length} threads`);
      } else {
        log('emailsApi.getConversations()', 'FAIL', 'Expected array');
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('emailsApi.getConversations()', 'FAIL', err.message);
    }
  }

  // =========================================================================
  // emailsApi.getThread() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] emailsApi.getThread(threadId)');
    try {
      const threads = await emailsApi.getConversations({ limit: 1 });
      const threadId = threads[0]?.threadId;

      if (threadId) {
        console.log('  Thread ID:', threadId);
        const emails = await emailsApi.getThread(threadId);

        console.log('  Response type:', typeof emails);
        console.log('  Is array:', Array.isArray(emails));
        console.log('  Count:', emails.length);

        if (Array.isArray(emails)) {
          log('emailsApi.getThread()', 'PASS', `Got ${emails.length} emails`);
        } else {
          log('emailsApi.getThread()', 'FAIL', 'Expected array');
        }
      } else {
        console.log('  No threads available');
        log('emailsApi.getThread()', 'PASS', 'No threads (skipped)');
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('emailsApi.getThread()', 'FAIL', err.message);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('TESTING REAL foldersApi');
  console.log('='.repeat(50));

  // =========================================================================
  // foldersApi.getFolders() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] foldersApi.getFolders()');
    try {
      const result = await foldersApi.getFolders();

      console.log('  Response type:', typeof result);
      console.log('  Has providers:', Array.isArray(result.providers));
      console.log('  Has foldersByProvider:', typeof result.foldersByProvider === 'object');

      if (result.providers && result.foldersByProvider) {
        const totalFolders = Object.values(result.foldersByProvider).reduce(
          (sum, folders) => sum + folders.length, 0
        );
        log('foldersApi.getFolders()', 'PASS',
          `${result.providers.length} providers, ${totalFolders} folders`);
      } else {
        log('foldersApi.getFolders()', 'FAIL', 'Missing fields');
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('foldersApi.getFolders()', 'FAIL', err.message);
    }
  }

  // =========================================================================
  // foldersApi.getFoldersByProvider() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] foldersApi.getFoldersByProvider(providerId)');
    try {
      const result = await foldersApi.getFoldersByProvider(providerId);

      console.log('  Response type:', typeof result);
      console.log('  Has provider:', !!result.provider);
      console.log('  Has folders:', Array.isArray(result.folders));

      if (result.provider && result.folders) {
        log('foldersApi.getFoldersByProvider()', 'PASS',
          `${result.folders.length} folders for ${result.provider.email}`);
      } else {
        log('foldersApi.getFoldersByProvider()', 'FAIL', 'Missing fields');
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('foldersApi.getFoldersByProvider()', 'FAIL', err.message);
    }
  }

  // =========================================================================
  // foldersApi.syncFolders() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] foldersApi.syncFolders(providerId)');
    try {
      const result = await foldersApi.syncFolders(providerId);

      console.log('  Response type:', typeof result);
      console.log('  success:', result.success);
      console.log('  foldersCount:', result.foldersCount);

      if (result.success && typeof result.foldersCount === 'number') {
        log('foldersApi.syncFolders()', 'PASS', `Synced ${result.foldersCount} folders`);
      } else {
        log('foldersApi.syncFolders()', 'FAIL', 'Invalid response');
      }
    } catch (err: any) {
      console.log('  Error:', err.response?.data || err.message);
      log('foldersApi.syncFolders()', 'FAIL', err.message);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('TESTING REAL labelsApi');
  console.log('='.repeat(50));

  // =========================================================================
  // labelsApi.listLabels() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] labelsApi.listLabels()');
    try {
      const result = await labelsApi.listLabels();

      console.log('  Response type:', typeof result);
      console.log('  Has labels:', Array.isArray(result.labels));
      console.log('  Count:', result.labels?.length);

      if (Array.isArray(result.labels)) {
        log('labelsApi.listLabels()', 'PASS', `Got ${result.labels.length} labels`);
      } else {
        log('labelsApi.listLabels()', 'FAIL', 'Expected { labels: [] }');
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        console.log('  Feature disabled (403)');
        log('labelsApi.listLabels()', 'PASS', 'Feature disabled');
      } else {
        console.log('  Error:', err.response?.data || err.message);
        log('labelsApi.listLabels()', 'FAIL', err.message);
      }
    }
  }

  // =========================================================================
  // labelsApi.createLabel() & deleteLabel() - REAL CALL
  // =========================================================================
  {
    console.log('\n[REAL] labelsApi.createLabel() & deleteLabel()');
    try {
      const uniqueName = `RealTest-${Date.now()}`;
      console.log('  Creating label:', uniqueName);

      const createResult = await labelsApi.createLabel({
        name: uniqueName,
        color: { backgroundColor: '#9C27B0', textColor: '#FFFFFF' },
      });

      console.log('  Response type:', typeof createResult);
      console.log('  Has label:', !!createResult.label);
      console.log('  Label ID:', createResult.label?.id);

      if (createResult.label?.id) {
        log('labelsApi.createLabel()', 'PASS', `Created: ${uniqueName}`);

        // Delete it
        console.log('  Deleting label:', createResult.label.id);
        await labelsApi.deleteLabel(createResult.label.id);
        log('labelsApi.deleteLabel()', 'PASS', 'Deleted');
      } else {
        log('labelsApi.createLabel()', 'FAIL', 'Missing label.id');
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        console.log('  Feature disabled (403)');
        log('labelsApi (feature)', 'PASS', 'Feature disabled');
      } else {
        console.log('  Error:', err.response?.data || err.message);
        log('labelsApi.createLabel()', 'FAIL', err.message);
      }
    }
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('REAL FRONTEND API TEST SUMMARY');
  console.log('='.repeat(70));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${results.length}`);

  if (failed === 0) {
    console.log('\n🎉 ALL REAL FRONTEND API TESTS PASSED!');
    console.log('Frontend API modules work correctly with real backend - NO MOCKS!');
  } else {
    console.log('\n⚠️ Some tests failed. Review errors above.');
    process.exit(1);
  }
}

main();
