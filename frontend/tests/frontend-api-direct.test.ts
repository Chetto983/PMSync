/**
 * Direct Frontend API Module Test
 *
 * Tests the actual frontend API modules by:
 * 1. Mocking the apiClient with proper auth
 * 2. Calling real frontend API functions
 * 3. Validating responses match expected types
 *
 * Run from frontend folder:
 *   npx ts-node -r tsconfig-paths/register tests/frontend-api-direct.test.ts
 *
 * Requires: Backend at http://localhost:3000
 */

import axios from 'axios';

// Setup environment before any imports
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'development';

// Mock window/localStorage for Node.js
(global as any).window = undefined;
(global as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// Get auth token from backend
async function getAuthToken(): Promise<{ token: string; providerId: string }> {
  // Use backend's test endpoint or direct Prisma
  const backendUrl = 'http://localhost:3000';

  // For now, we'll get token via login - you can replace with your test credentials
  // Or fetch directly from database
  const loginRes = await axios.post(`${backendUrl}/auth/login`, {
    email: process.env.TEST_EMAIL || 'dvdmarchetto@gmail.com',
    password: process.env.TEST_PASSWORD || '!Davide1983!',
  });

  const token = loginRes.data.token || loginRes.data.access_token;

  // Get first provider
  const providersRes = await axios.get(`${backendUrl}/providers`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const providerId = providersRes.data.providers?.[0]?.id || providersRes.data[0]?.id;

  return { token, providerId };
}

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
  console.log('DIRECT FRONTEND API MODULE TEST');
  console.log('='.repeat(70));
  console.log('Testing actual frontend API functions\n');

  try {
    // Get auth token
    console.log('Getting auth token...');
    const { token, providerId } = await getAuthToken();
    console.log(`Token: ${token.substring(0, 20)}...`);
    console.log(`Provider: ${providerId}\n`);

    // Now import and configure the apiClient with the token
    const { apiClient } = await import('../lib/api-client');

    // Set auth header directly on apiClient
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // Import the frontend API modules
    const { emailsApi } = await import('../lib/api/emails');
    const { foldersApi } = await import('../lib/api/folders');
    const { labelsApi } = await import('../lib/api/labels');

    // =========================================================================
    // TEST EMAILS API
    // =========================================================================
    console.log('='.repeat(50));
    console.log('TESTING emailsApi (frontend/lib/api/emails.ts)');
    console.log('='.repeat(50));

    // Test: emailsApi.listEmails()
    {
      console.log('\n[TEST] emailsApi.listEmails()');
      try {
        const result = await emailsApi.listEmails({ specialUse: 'INBOX', limit: 5 });

        // Validate ListEmailsResponse structure
        if (Array.isArray(result.emails) && result.pagination) {
          log('emailsApi.listEmails()', 'PASS',
            `Got ${result.emails.length} emails, page ${result.pagination.page}/${result.pagination.totalPages}`);

          // Validate Email structure
          if (result.emails[0]) {
            const email = result.emails[0];
            const hasId = typeof email.id === 'string';
            const hasFrom = typeof email.from === 'string';
            const hasSubject = typeof email.subject === 'string';
            const hasIsRead = typeof email.isRead === 'boolean';

            if (hasId && hasFrom && hasSubject && hasIsRead) {
              log('Email structure', 'PASS', 'All required fields present');
            } else {
              log('Email structure', 'FAIL', 'Missing required fields');
            }
          }
        } else {
          log('emailsApi.listEmails()', 'FAIL', 'Invalid response structure');
        }
      } catch (err: any) {
        log('emailsApi.listEmails()', 'FAIL', err.message);
      }
    }

    // Test: emailsApi.getEmail()
    {
      console.log('\n[TEST] emailsApi.getEmail()');
      try {
        const listResult = await emailsApi.listEmails({ limit: 1 });
        const emailId = listResult.emails[0]?.id;

        if (emailId) {
          const email = await emailsApi.getEmail(emailId);

          // Should return Email directly (not wrapped)
          if (email.id === emailId && typeof email.subject === 'string') {
            log('emailsApi.getEmail()', 'PASS', 'Returns Email directly');
          } else {
            log('emailsApi.getEmail()', 'FAIL', 'Unexpected response format');
          }
        } else {
          log('emailsApi.getEmail()', 'FAIL', 'No email ID available');
        }
      } catch (err: any) {
        log('emailsApi.getEmail()', 'FAIL', err.message);
      }
    }

    // Test: emailsApi.getStats()
    {
      console.log('\n[TEST] emailsApi.getStats()');
      try {
        const stats = await emailsApi.getStats();

        const hasTotal = typeof stats.total === 'number';
        const hasUnread = typeof stats.unread === 'number';
        const hasImportant = typeof stats.important === 'number';
        const hasByFolder = typeof stats.byFolder === 'object';

        if (hasTotal && hasUnread && hasImportant && hasByFolder) {
          log('emailsApi.getStats()', 'PASS', `Total: ${stats.total}, Unread: ${stats.unread}`);
        } else {
          log('emailsApi.getStats()', 'FAIL', 'Missing required stats fields');
        }
      } catch (err: any) {
        log('emailsApi.getStats()', 'FAIL', err.message);
      }
    }

    // Test: emailsApi.updateEmail()
    {
      console.log('\n[TEST] emailsApi.updateEmail()');
      try {
        const listResult = await emailsApi.listEmails({ limit: 1 });
        const emailId = listResult.emails[0]?.id;

        if (emailId) {
          const updated = await emailsApi.updateEmail(emailId, { isRead: true });

          // Should return Email directly
          if (updated.id === emailId && typeof updated.isRead === 'boolean') {
            log('emailsApi.updateEmail()', 'PASS', 'Returns Email directly');
          } else {
            log('emailsApi.updateEmail()', 'FAIL', 'Unexpected response format');
          }
        } else {
          log('emailsApi.updateEmail()', 'FAIL', 'No email ID available');
        }
      } catch (err: any) {
        log('emailsApi.updateEmail()', 'FAIL', err.message);
      }
    }

    // Test: emailsApi.searchEmails()
    {
      console.log('\n[TEST] emailsApi.searchEmails()');
      try {
        const emails = await emailsApi.searchEmails('test', 5);

        if (Array.isArray(emails)) {
          log('emailsApi.searchEmails()', 'PASS', `Found ${emails.length} results`);
        } else {
          log('emailsApi.searchEmails()', 'FAIL', 'Expected array');
        }
      } catch (err: any) {
        log('emailsApi.searchEmails()', 'FAIL', err.message);
      }
    }

    // Test: emailsApi.getConversations()
    {
      console.log('\n[TEST] emailsApi.getConversations()');
      try {
        const threads = await emailsApi.getConversations({ limit: 5 });

        if (Array.isArray(threads)) {
          log('emailsApi.getConversations()', 'PASS', `Got ${threads.length} threads`);
        } else {
          log('emailsApi.getConversations()', 'FAIL', 'Expected array');
        }
      } catch (err: any) {
        log('emailsApi.getConversations()', 'FAIL', err.message);
      }
    }

    // Test: emailsApi.getThread()
    {
      console.log('\n[TEST] emailsApi.getThread()');
      try {
        const threads = await emailsApi.getConversations({ limit: 1 });
        const threadId = threads[0]?.threadId;

        if (threadId) {
          const emails = await emailsApi.getThread(threadId);

          if (Array.isArray(emails)) {
            log('emailsApi.getThread()', 'PASS', `Got ${emails.length} emails in thread`);
          } else {
            log('emailsApi.getThread()', 'FAIL', 'Expected array');
          }
        } else {
          log('emailsApi.getThread()', 'PASS', 'No threads available (skipped)');
        }
      } catch (err: any) {
        log('emailsApi.getThread()', 'FAIL', err.message);
      }
    }

    // =========================================================================
    // TEST FOLDERS API
    // =========================================================================
    console.log('\n' + '='.repeat(50));
    console.log('TESTING foldersApi (frontend/lib/api/folders.ts)');
    console.log('='.repeat(50));

    // Test: foldersApi.getFolders()
    {
      console.log('\n[TEST] foldersApi.getFolders()');
      try {
        const result = await foldersApi.getFolders();

        if (Array.isArray(result.providers) && typeof result.foldersByProvider === 'object') {
          const totalFolders = Object.values(result.foldersByProvider).reduce(
            (sum, folders) => sum + folders.length, 0
          );
          log('foldersApi.getFolders()', 'PASS',
            `${result.providers.length} providers, ${totalFolders} folders`);
        } else {
          log('foldersApi.getFolders()', 'FAIL', 'Invalid response structure');
        }
      } catch (err: any) {
        log('foldersApi.getFolders()', 'FAIL', err.message);
      }
    }

    // Test: foldersApi.getFoldersByProvider()
    {
      console.log('\n[TEST] foldersApi.getFoldersByProvider()');
      try {
        const result = await foldersApi.getFoldersByProvider(providerId);

        if (result.provider && Array.isArray(result.folders)) {
          log('foldersApi.getFoldersByProvider()', 'PASS',
            `${result.folders.length} folders for ${result.provider.email}`);
        } else {
          log('foldersApi.getFoldersByProvider()', 'FAIL', 'Invalid response structure');
        }
      } catch (err: any) {
        log('foldersApi.getFoldersByProvider()', 'FAIL', err.message);
      }
    }

    // Test: foldersApi.syncFolders()
    {
      console.log('\n[TEST] foldersApi.syncFolders()');
      try {
        const result = await foldersApi.syncFolders(providerId);

        if (result.success && typeof result.foldersCount === 'number') {
          log('foldersApi.syncFolders()', 'PASS', `Synced ${result.foldersCount} folders`);
        } else {
          log('foldersApi.syncFolders()', 'FAIL', 'Invalid response structure');
        }
      } catch (err: any) {
        log('foldersApi.syncFolders()', 'FAIL', err.message);
      }
    }

    // =========================================================================
    // TEST LABELS API
    // =========================================================================
    console.log('\n' + '='.repeat(50));
    console.log('TESTING labelsApi (frontend/lib/api/labels.ts)');
    console.log('='.repeat(50));

    // Test: labelsApi.listLabels()
    {
      console.log('\n[TEST] labelsApi.listLabels()');
      try {
        const result = await labelsApi.listLabels();

        if (Array.isArray(result.labels)) {
          log('labelsApi.listLabels()', 'PASS', `Got ${result.labels.length} labels`);
        } else {
          log('labelsApi.listLabels()', 'FAIL', 'Expected { labels: [] }');
        }
      } catch (err: any) {
        if (err.response?.status === 403) {
          log('labelsApi.listLabels()', 'PASS', 'Feature disabled (expected)');
        } else {
          log('labelsApi.listLabels()', 'FAIL', err.message);
        }
      }
    }

    // Test: labelsApi.createLabel() & deleteLabel()
    {
      console.log('\n[TEST] labelsApi.createLabel() & deleteLabel()');
      try {
        const uniqueName = `DirectTest-${Date.now()}`;
        const createResult = await labelsApi.createLabel({
          name: uniqueName,
          color: { backgroundColor: '#E91E63', textColor: '#FFFFFF' },
        });

        if (createResult.label?.id) {
          log('labelsApi.createLabel()', 'PASS', `Created: ${uniqueName}`);

          // Delete it
          await labelsApi.deleteLabel(createResult.label.id);
          log('labelsApi.deleteLabel()', 'PASS', 'Deleted successfully');
        } else {
          log('labelsApi.createLabel()', 'FAIL', 'Missing label.id');
        }
      } catch (err: any) {
        if (err.response?.status === 403) {
          log('labelsApi (feature)', 'PASS', 'Feature disabled (expected)');
        } else {
          log('labelsApi.createLabel()', 'FAIL', err.message);
        }
      }
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('DIRECT FRONTEND API TEST SUMMARY');
    console.log('='.repeat(70));

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    console.log(`\n✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total: ${results.length}`);

    if (failed === 0) {
      console.log('\n🎉 ALL DIRECT FRONTEND API TESTS PASSED!');
      console.log('Frontend API modules work correctly with real backend.');
    } else {
      console.log('\n⚠️ Some tests failed. Review errors above.');
      process.exit(1);
    }

  } catch (err: any) {
    console.error('Test setup failed:', err.message);
    process.exit(1);
  }
}

main();
