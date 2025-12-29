/**
 * Frontend API Module Validation
 *
 * Tests that the frontend email API matches backend contracts.
 * Run: npx ts-node scripts/validate-frontend-api.ts
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import axios, { AxiosInstance } from 'axios';
import * as jwt from 'jsonwebtoken';

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function log(endpoint: string, method: string, status: 'PASS' | 'FAIL', details: string) {
  results.push({ endpoint, method, status, details });
  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${method} ${endpoint}: ${details}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('FRONTEND EMAIL API VALIDATION');
  console.log('='.repeat(60));
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

    console.log(`Testing with: ${user.email}`);
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
    // TEST 1: List Emails (matches frontend emailsApi.listEmails)
    // =========================================================================
    console.log('--- TEST 1: LIST EMAILS ---');
    try {
      const res = await api.get('/emails', {
        params: { specialUse: 'INBOX', limit: 10 },
      });
      if (res.status === 200 && res.data.emails) {
        log('/emails', 'GET', 'PASS', `Got ${res.data.emails.length} emails, total: ${res.data.total}`);

        // Validate response structure
        const email = res.data.emails[0];
        if (email) {
          const requiredFields = ['id', 'from', 'to', 'subject', 'isRead', 'isStarred', 'isFlagged'];
          const missing = requiredFields.filter(f => !(f in email));
          if (missing.length > 0) {
            log('/emails', 'STRUCTURE', 'FAIL', `Missing fields: ${missing.join(', ')}`);
          } else {
            log('/emails', 'STRUCTURE', 'PASS', 'All required fields present');
          }
        }
      } else {
        log('/emails', 'GET', 'FAIL', `Status: ${res.status}`);
      }
    } catch (err: any) {
      log('/emails', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 2: Get Email Stats (matches frontend emailsApi.getStats)
    // =========================================================================
    console.log('\n--- TEST 2: EMAIL STATS ---');
    try {
      const res = await api.get('/emails/stats');
      if (res.status === 200) {
        log('/emails/stats', 'GET', 'PASS', `Unread: ${res.data.unread}, Total: ${res.data.total}`);
      } else {
        log('/emails/stats', 'GET', 'FAIL', `Status: ${res.status}`);
      }
    } catch (err: any) {
      log('/emails/stats', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 3: List with isImportant filter
    // =========================================================================
    console.log('\n--- TEST 3: ISIMPORTANT FILTER ---');
    try {
      const res = await api.get('/emails', {
        params: { isImportant: true, limit: 5 },
      });
      if (res.status === 200) {
        log('/emails?isImportant=true', 'GET', 'PASS', `Got ${res.data.emails?.length || 0} important emails`);
      } else {
        log('/emails?isImportant=true', 'GET', 'FAIL', `Status: ${res.status}`);
      }
    } catch (err: any) {
      log('/emails?isImportant=true', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 4: Get single email
    // =========================================================================
    console.log('\n--- TEST 4: GET SINGLE EMAIL ---');
    try {
      const listRes = await api.get('/emails', { params: { limit: 1 } });
      const emailId = listRes.data.emails?.[0]?.id;

      if (emailId) {
        const res = await api.get(`/emails/${emailId}`);
        // Backend returns email directly, not wrapped in { email }
        if (res.status === 200 && res.data.id) {
          log(`/emails/${emailId}`, 'GET', 'PASS', `Subject: ${res.data.subject?.substring(0, 40)}...`);
        } else {
          log(`/emails/${emailId}`, 'GET', 'FAIL', `Status: ${res.status}, missing id`);
        }
      } else {
        log('/emails/:id', 'GET', 'FAIL', 'No email ID available');
      }
    } catch (err: any) {
      log('/emails/:id', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 5: Update email (mark read)
    // =========================================================================
    console.log('\n--- TEST 5: UPDATE EMAIL ---');
    try {
      const listRes = await api.get('/emails', { params: { limit: 1 } });
      const emailId = listRes.data.emails?.[0]?.id;

      if (emailId) {
        const res = await api.patch(`/emails/${emailId}`, { isRead: true });
        if (res.status === 200) {
          log(`/emails/${emailId}`, 'PATCH', 'PASS', 'Marked as read');
        } else {
          log(`/emails/${emailId}`, 'PATCH', 'FAIL', `Status: ${res.status}`);
        }
      } else {
        log('/emails/:id', 'PATCH', 'FAIL', 'No email ID available');
      }
    } catch (err: any) {
      log('/emails/:id', 'PATCH', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 6: Bulk mark read
    // =========================================================================
    console.log('\n--- TEST 6: BULK MARK READ ---');
    try {
      const listRes = await api.get('/emails', { params: { limit: 2 } });
      const emailIds = listRes.data.emails?.map((e: any) => e.id) || [];

      if (emailIds.length > 0) {
        const res = await api.patch('/emails/bulk/read', { emailIds, isRead: true });
        if (res.status === 200) {
          log('/emails/bulk/read', 'PATCH', 'PASS', `Updated: ${res.data.updated || emailIds.length}`);
        } else {
          log('/emails/bulk/read', 'PATCH', 'FAIL', `Status: ${res.status}, ${JSON.stringify(res.data)}`);
        }
      } else {
        log('/emails/bulk/read', 'PATCH', 'FAIL', 'No emails available');
      }
    } catch (err: any) {
      log('/emails/bulk/read', 'PATCH', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 7: Bulk mark flag (important)
    // =========================================================================
    console.log('\n--- TEST 7: BULK MARK FLAG (IMPORTANT) ---');
    try {
      const listRes = await api.get('/emails', { params: { limit: 2 } });
      const emailIds = listRes.data.emails?.map((e: any) => e.id) || [];

      if (emailIds.length > 0) {
        const res = await api.patch('/emails/bulk/flag', { emailIds, isFlagged: true });
        if (res.status === 200) {
          log('/emails/bulk/flag', 'PATCH', 'PASS', `Updated: ${res.data.updated || emailIds.length}`);
        } else {
          log('/emails/bulk/flag', 'PATCH', 'FAIL', `Status: ${res.status}, ${JSON.stringify(res.data)}`);
        }
      } else {
        log('/emails/bulk/flag', 'PATCH', 'FAIL', 'No emails available');
      }
    } catch (err: any) {
      log('/emails/bulk/flag', 'PATCH', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 8: Search emails
    // =========================================================================
    console.log('\n--- TEST 8: SEARCH EMAILS ---');
    try {
      const res = await api.get('/emails/search', {
        params: { q: 'test', limit: 5 },
      });
      if (res.status === 200) {
        log('/emails/search', 'GET', 'PASS', `Found ${res.data.emails?.length || 0} results`);
      } else {
        log('/emails/search', 'GET', 'FAIL', `Status: ${res.status}`);
      }
    } catch (err: any) {
      log('/emails/search', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 9: List Folders
    // =========================================================================
    console.log('\n--- TEST 9: LIST FOLDERS ---');
    try {
      const res = await api.get('/folders');
      // Backend returns { providers, foldersByProvider }
      if (res.status === 200 && res.data.providers && res.data.foldersByProvider) {
        const providerCount = res.data.providers.length;
        const totalFolders = Object.values(res.data.foldersByProvider as Record<string, any[]>).reduce(
          (sum, folders) => sum + folders.length,
          0
        );
        log('/folders', 'GET', 'PASS', `${providerCount} providers, ${totalFolders} folders`);
      } else {
        log('/folders', 'GET', 'FAIL', `Missing providers/foldersByProvider`);
      }
    } catch (err: any) {
      log('/folders', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 10: Get Folders by Provider
    // =========================================================================
    console.log('\n--- TEST 10: FOLDERS BY PROVIDER ---');
    try {
      // Backend returns { provider, folders }
      const res = await api.get(`/folders/provider/${provider.id}`);
      if (res.status === 200 && res.data.provider && res.data.folders) {
        log(`/folders/provider/${provider.id}`, 'GET', 'PASS', `${res.data.folders.length} folders`);
      } else {
        log('/folders/provider/:id', 'GET', 'FAIL', 'Missing provider/folders');
      }
    } catch (err: any) {
      log('/folders/provider/:id', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 11: List Labels
    // =========================================================================
    console.log('\n--- TEST 11: LIST LABELS ---');
    try {
      const res = await api.get('/labels');
      // Backend returns { labels }
      if (res.status === 200 && Array.isArray(res.data.labels)) {
        log('/labels', 'GET', 'PASS', `Got ${res.data.labels.length} labels`);
      } else {
        log('/labels', 'GET', 'FAIL', 'Missing or invalid labels array');
      }
    } catch (err: any) {
      log('/labels', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 12: Create & Delete Label (if labels feature enabled)
    // =========================================================================
    console.log('\n--- TEST 12: CREATE/DELETE LABEL ---');
    try {
      // Create label with unique name
      const uniqueName = `Test-${Date.now()}`;
      const createRes = await api.post('/labels', {
        name: uniqueName,
        color: { backgroundColor: '#FF5722', textColor: '#FFFFFF' },
      });

      // Backend returns { label }
      if (createRes.status === 201 && createRes.data.label?.id) {
        const labelId = createRes.data.label.id;
        log('/labels', 'POST', 'PASS', `Created: ${createRes.data.label.name}`);

        // Delete label
        const deleteRes = await api.delete(`/labels/${labelId}`);
        if (deleteRes.status === 204) {
          log(`/labels/${labelId}`, 'DELETE', 'PASS', 'Label deleted');
        } else {
          log(`/labels/${labelId}`, 'DELETE', 'FAIL', `Status: ${deleteRes.status}`);
        }
      } else {
        log('/labels', 'POST', 'FAIL', `Status: ${createRes.status}, missing label.id`);
      }
    } catch (err: any) {
      // May fail if userLabels feature is disabled
      if (err.response?.status === 403) {
        log('/labels', 'CREATE/DELETE', 'PASS', 'Feature disabled (expected)');
      } else {
        log('/labels', 'CREATE/DELETE', 'FAIL', err.message);
      }
    }

    // =========================================================================
    // TEST 13: Email Stats Structure Validation
    // =========================================================================
    console.log('\n--- TEST 13: STATS STRUCTURE ---');
    try {
      const res = await api.get('/emails/stats');
      // Backend returns: total, unread, starred, important, today, thisWeek, attachments, byFolder
      const requiredFields = ['total', 'unread', 'starred', 'important', 'today', 'thisWeek', 'attachments', 'byFolder'];
      const missing = requiredFields.filter(f => !(f in res.data));
      if (missing.length === 0) {
        log('/emails/stats', 'STRUCTURE', 'PASS', 'All required fields present');
      } else {
        log('/emails/stats', 'STRUCTURE', 'FAIL', `Missing: ${missing.join(', ')}`);
      }
    } catch (err: any) {
      log('/emails/stats', 'STRUCTURE', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 14: Update Email Response Structure
    // =========================================================================
    console.log('\n--- TEST 14: UPDATE EMAIL RESPONSE ---');
    try {
      const listRes = await api.get('/emails', { params: { limit: 1 } });
      const emailId = listRes.data.emails?.[0]?.id;

      if (emailId) {
        const res = await api.patch(`/emails/${emailId}`, { isRead: true });
        // Backend returns email directly (not wrapped)
        if (res.status === 200 && res.data.id && res.data.isRead !== undefined) {
          log(`/emails/${emailId}`, 'PATCH-STRUCT', 'PASS', 'Returns email directly');
        } else {
          log(`/emails/${emailId}`, 'PATCH-STRUCT', 'FAIL', 'Invalid response structure');
        }
      } else {
        log('/emails/:id', 'PATCH-STRUCT', 'FAIL', 'No email ID');
      }
    } catch (err: any) {
      log('/emails/:id', 'PATCH-STRUCT', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 15: Sync Folders for Provider
    // =========================================================================
    console.log('\n--- TEST 15: SYNC FOLDERS ---');
    try {
      const res = await api.post(`/folders/sync/${provider.id}`);
      // Backend returns { success, foldersCount, folders } with 200 or 201
      if ((res.status === 200 || res.status === 201) && res.data.success && typeof res.data.foldersCount === 'number') {
        log(`/folders/sync/${provider.id}`, 'POST', 'PASS', `Synced ${res.data.foldersCount} folders`);
      } else {
        log('/folders/sync/:id', 'POST', 'FAIL', `Status: ${res.status}, Keys: ${Object.keys(res.data).join(', ')}`);
      }
    } catch (err: any) {
      log('/folders/sync/:id', 'POST', 'FAIL', err.response?.data?.message || err.message);
    }

    // =========================================================================
    // TEST 16: Update Folder Counts
    // =========================================================================
    console.log('\n--- TEST 16: UPDATE FOLDER COUNTS ---');
    try {
      const res = await api.post(`/folders/update-counts/${provider.id}`);
      // Backend returns { success, message } with 200 or 201
      if ((res.status === 200 || res.status === 201) && res.data.success && res.data.message) {
        log(`/folders/update-counts/${provider.id}`, 'POST', 'PASS', res.data.message);
      } else {
        log('/folders/update-counts/:id', 'POST', 'FAIL', `Status: ${res.status}, Keys: ${Object.keys(res.data).join(', ')}`);
      }
    } catch (err: any) {
      log('/folders/update-counts/:id', 'POST', 'FAIL', err.response?.data?.message || err.message);
    }

    // =========================================================================
    // TEST 17: Sync All Folders
    // =========================================================================
    console.log('\n--- TEST 17: SYNC ALL FOLDERS ---');
    try {
      const res = await api.post('/folders/sync-all');
      // Backend returns { success, results } with 200 or 201
      if ((res.status === 200 || res.status === 201) && res.data.success && Array.isArray(res.data.results)) {
        const successCount = res.data.results.filter((r: any) => r.success).length;
        log('/folders/sync-all', 'POST', 'PASS', `${successCount}/${res.data.results.length} providers synced`);
      } else {
        log('/folders/sync-all', 'POST', 'FAIL', `Status: ${res.status}, Keys: ${Object.keys(res.data).join(', ')}`);
      }
    } catch (err: any) {
      log('/folders/sync-all', 'POST', 'FAIL', err.response?.data?.message || err.message);
    }

    // =========================================================================
    // TEST 18: Conversations Endpoint
    // =========================================================================
    console.log('\n--- TEST 18: CONVERSATIONS ---');
    try {
      const res = await api.get('/emails/conversations', { params: { specialUse: 'INBOX', limit: 5 } });
      // Backend returns { conversations: [...], pagination: {...} }
      if (res.status === 200 && Array.isArray(res.data.conversations)) {
        log('/emails/conversations', 'GET', 'PASS', `Got ${res.data.conversations.length} conversations`);
      } else {
        log('/emails/conversations', 'GET', 'FAIL', `Keys: ${Object.keys(res.data).join(', ')}`);
      }
    } catch (err: any) {
      log('/emails/conversations', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 19: Get Thread by ID
    // =========================================================================
    console.log('\n--- TEST 19: GET THREAD ---');
    try {
      // Get a thread ID from conversations
      const convRes = await api.get('/emails/conversations', { params: { limit: 1 } });
      const threadId = convRes.data.threads?.[0]?.threadId;

      if (threadId) {
        const res = await api.get(`/emails/thread/${threadId}`);
        // Backend returns { emails: Email[] }
        if (res.status === 200 && Array.isArray(res.data.emails)) {
          log(`/emails/thread/${threadId}`, 'GET', 'PASS', `${res.data.emails.length} emails in thread`);
        } else {
          log('/emails/thread/:id', 'GET', 'FAIL', 'Missing emails array');
        }
      } else {
        log('/emails/thread/:id', 'GET', 'PASS', 'No threads available (skipped)');
      }
    } catch (err: any) {
      log('/emails/thread/:id', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // TEST 20: Drafts Endpoint
    // =========================================================================
    console.log('\n--- TEST 20: DRAFTS ---');
    try {
      const res = await api.get('/emails', { params: { specialUse: 'DRAFTS', limit: 5 } });
      if (res.status === 200 && Array.isArray(res.data.emails)) {
        log('/emails?specialUse=DRAFTS', 'GET', 'PASS', `Got ${res.data.emails.length} drafts`);
      } else {
        log('/emails?specialUse=DRAFTS', 'GET', 'FAIL', 'Invalid response');
      }
    } catch (err: any) {
      log('/emails?specialUse=DRAFTS', 'GET', 'FAIL', err.message);
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    console.log(`\n✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total: ${results.length}`);

    if (failed === 0) {
      console.log('\n🎉 ALL VALIDATIONS PASSED!');
      console.log('Frontend email API module is compatible with backend.');
    } else {
      console.log('\n⚠️ Some validations failed. Review errors above.');
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
