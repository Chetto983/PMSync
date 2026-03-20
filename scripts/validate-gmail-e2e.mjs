/**
 * Gmail E2E Validation Script
 *
 * Connects to Edge via CDP (authenticated session) and validates
 * all Gmail/email API endpoints using the browser's cookies.
 */
import { chromium } from 'playwright';

const BACKEND_URL = 'https://backend-production-78e1.up.railway.app';
const FRONTEND_URL = 'https://mail-agent-indol.vercel.app';

async function main() {
  console.log('=== Gmail E2E Validation ===\n');

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const context = contexts[0];

  // Get cookies from BOTH domains
  const backendCookies = await context.cookies(BACKEND_URL);
  const frontendCookies = await context.cookies(FRONTEND_URL);

  console.log(`Cookies for backend domain: ${backendCookies.length}`);
  backendCookies.forEach(c => console.log(`  ${c.name}: ${c.value.substring(0, 30)}...`));
  console.log(`Cookies for frontend domain: ${frontendCookies.length}`);
  frontendCookies.forEach(c => console.log(`  ${c.name}: ${c.value.substring(0, 30)}...`));

  // Merge all cookies (backend cookies take priority)
  const cookieMap = new Map();
  for (const c of frontendCookies) cookieMap.set(c.name, c);
  for (const c of backendCookies) cookieMap.set(c.name, c);
  const allCookies = [...cookieMap.values()];

  const cookieHeader = allCookies.map(c => `${c.name}=${c.value}`).join('; ');

  if (!cookieHeader || allCookies.length === 0) {
    console.log('\n⚠️  No cookies found. Please open the app in Edge first and login.');
    await browser.close();
    process.exit(1);
  }

  // Find an app page (skip devtools, about:blank, etc.)
  const allPages = context.pages();
  let page = allPages.find(p => p.url().includes('mail-agent') || p.url().includes('localhost:3001'))
    || allPages.find(p => !p.url().startsWith('devtools://') && !p.url().startsWith('about:'))
    || await context.newPage();
  console.log(`\nCurrent page: ${page.url()}`);

  // If not on the app, navigate there
  if (!page.url().includes('mail-agent') && !page.url().includes('localhost:3001')) {
    console.log('Navigating to app...');
    await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // Re-read cookies after navigation
    const refreshed = await context.cookies(BACKEND_URL);
    console.log(`Cookies after navigation: ${refreshed.length}`);
    refreshed.forEach(c => console.log(`  ${c.name}: ${c.value.substring(0, 30)}...`));
    for (const c of refreshed) cookieMap.set(c.name, c);
  }

  // Build final cookie header from merged map
  const finalCookies = [...cookieMap.values()];
  const finalCookieHeader = finalCookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log(`\nFinal cookie header (${finalCookies.length} cookies): ${finalCookieHeader.substring(0, 80)}...`);

  // Create API request context with cookies
  const api = await context.request;

  // Fetch CSRF token for mutating requests
  console.log('\nFetching CSRF token...');
  const csrfRes = await api.get(BACKEND_URL + '/api/v1/auth/csrf-token', {
    headers: { 'Cookie': finalCookieHeader },
  });
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData?.csrfToken || csrfData?.data?.csrfToken;
  console.log(`CSRF token: ${csrfToken ? csrfToken.substring(0, 30) + '...' : 'NONE'}`);

  // Re-read cookies after CSRF fetch (new csrf cookie may have been set)
  const postCsrfCookies = await context.cookies(BACKEND_URL);
  for (const c of postCsrfCookies) cookieMap.set(c.name, c);
  const updatedCookieHeader = [...cookieMap.values()].map(c => `${c.name}=${c.value}`).join('; ');

  const results = [];

  async function testEndpoint(name, method, path, body = null) {
    try {
      const url = BACKEND_URL + path;
      const headers = { 'Cookie': updatedCookieHeader };
      if (method !== 'GET' && csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      const opts = { headers };

      let response;
      if (method === 'GET') {
        response = await api.get(url, opts);
      } else if (method === 'POST') {
        response = await api.post(url, { ...opts, data: body });
      } else if (method === 'PATCH') {
        response = await api.patch(url, { ...opts, data: body });
      } else if (method === 'DELETE') {
        response = await api.delete(url, opts);
      }

      const status = response.status();
      let data;
      try { data = await response.json(); } catch { data = await response.text(); }

      const ok = status >= 200 && status < 400;
      const statusStr = ok ? 'PASS' : 'FAIL';
      const detail = ok
        ? summarize(data)
        : `HTTP ${status}: ${JSON.stringify(data).substring(0, 120)}`;

      results.push({ name, status: statusStr, detail });
      console.log(`  ${ok ? '✅' : '❌'} ${name}: ${detail}`);
      return { status, data };
    } catch (err) {
      results.push({ name, status: 'ERROR', detail: err.message });
      console.log(`  ❌ ${name}: ERROR - ${err.message}`);
      return null;
    }
  }

  function summarize(data) {
    if (data?.data && Array.isArray(data.data)) return `${data.data.length} items`;
    if (data?.data && typeof data.data === 'object') {
      const keys = Object.keys(data.data);
      if (data.data.email) return `user: ${data.data.email}`;
      if (data.data.status) return `status: ${data.data.status}`;
      return keys.slice(0, 5).join(', ') + (keys.length > 5 ? `... (${keys.length} keys)` : '');
    }
    if (Array.isArray(data)) return `${data.length} items (raw array)`;
    return JSON.stringify(data).substring(0, 100);
  }

  // ===== 1. AUTH & SESSION =====
  console.log('\n--- 1. Auth & Session ---');
  await testEndpoint('Get Session', 'GET', '/api/auth/get-session');

  // ===== 2. PROVIDERS =====
  console.log('\n--- 2. Providers ---');
  const providersRes = await testEndpoint('List Providers', 'GET', '/api/v1/providers');

  let providerId = null;
  if (providersRes?.data?.data) {
    const list = Array.isArray(providersRes.data.data) ? providersRes.data.data : [];
    const google = list.find(p => p.providerType === 'google');
    providerId = google?.id;
    if (providerId) console.log(`  📌 Google provider: ${providerId} (${google.email})`);
  }

  // ===== 3. FOLDERS =====
  console.log('\n--- 3. Folders ---');
  const foldersRes = await testEndpoint('List All Folders', 'GET', '/api/v1/folders');
  if (providerId) {
    await testEndpoint('Provider Folders', 'GET', `/api/v1/folders/provider/${providerId}`);
    await testEndpoint('Folder Audit', 'GET', `/api/v1/folders/audit/${providerId}`);
    await testEndpoint('Update Counts', 'POST', `/api/v1/folders/update-counts/${providerId}`, {});
  }

  // ===== 4. EMAILS =====
  console.log('\n--- 4. Emails ---');
  const emailsRes = await testEndpoint('List INBOX', 'GET', '/api/v1/emails?folder=INBOX&limit=5');
  await testEndpoint('List SENT', 'GET', '/api/v1/emails?folder=SENT&limit=3');
  await testEndpoint('List TRASH', 'GET', '/api/v1/emails?folder=TRASH&limit=3');
  await testEndpoint('List DRAFTS', 'GET', '/api/v1/emails?folder=DRAFT&limit=3');

  let emailId = null;
  const emailList = emailsRes?.data?.data?.emails ?? emailsRes?.data?.emails ?? emailsRes?.data?.data;
  if (Array.isArray(emailList) && emailList.length > 0) {
    emailId = emailList[0].id;
    console.log(`  📌 Test email ID: ${emailId}`);
  } else {
    console.log('  ⚠️  Could not extract emailId. Response shape:', JSON.stringify(emailsRes?.data).substring(0, 200));
  }

  if (emailId) {
    await testEndpoint('Get Single Email', 'GET', `/api/v1/emails/${emailId}`);
  }

  // ===== 5. SEARCH =====
  console.log('\n--- 5. Search ---');
  await testEndpoint('Search by query', 'GET', '/api/v1/emails?q=railway&limit=3');

  // ===== 6. EMAIL OPERATIONS =====
  console.log('\n--- 6. Email Operations ---');
  if (emailId) {
    await testEndpoint('Mark as Read', 'PATCH', `/api/v1/emails/${emailId}`, { isRead: true });
    await testEndpoint('Mark as Unread', 'PATCH', `/api/v1/emails/${emailId}`, { isRead: false });
    await testEndpoint('Star Email', 'PATCH', `/api/v1/emails/${emailId}`, { isStarred: true });
    await testEndpoint('Unstar Email', 'PATCH', `/api/v1/emails/${emailId}`, { isStarred: false });
  }

  // ===== 7. SYNC =====
  console.log('\n--- 7. Sync ---');
  await testEndpoint('Sync Status', 'GET', '/api/v1/email-sync/status');
  await testEndpoint('Sync Health', 'GET', '/api/v1/email-sync/health');
  await testEndpoint('Sync Queues', 'GET', '/api/v1/email-sync/queues');

  // ===== 8. WEBHOOKS =====
  console.log('\n--- 8. Webhooks ---');
  await testEndpoint('Webhook Health (public)', 'GET', '/webhooks/health');
  await testEndpoint('Webhook Health (auth)', 'GET', '/api/v1/email-sync/webhooks/health');

  // ===== 9. CONTACTS =====
  console.log('\n--- 9. Contacts ---');
  await testEndpoint('List Contacts', 'GET', '/api/v1/contacts?limit=5');
  await testEndpoint('Contact Counts', 'GET', '/api/v1/contacts/counts');

  // ===== 10. AI TRIAGE =====
  console.log('\n--- 10. AI Triage ---');
  await testEndpoint('Backfill Status', 'GET', '/api/v1/ai/triage/backfill/status');
  await testEndpoint('Suggested VIPs', 'GET', '/api/v1/ai/triage/suggested-vips');

  // ===== 11. AI CHAT =====
  console.log('\n--- 11. AI Chat ---');
  await testEndpoint('List Conversations', 'GET', '/api/v1/ai/chat/conversations');

  // ===== 12. GMAIL TEST ENDPOINTS =====
  console.log('\n--- 12. Gmail Test Endpoints ---');
  if (providerId) {
    await testEndpoint('Gmail Labels (live)', 'GET', `/api/v1/providers/${providerId}/test/gmail-labels`);
    await testEndpoint('Gmail Messages (live)', 'GET', `/api/v1/providers/${providerId}/test/gmail-messages`);
  }

  // ===== 13. ATTACHMENTS =====
  console.log('\n--- 13. Attachments ---');
  if (emailId) {
    const emailDetail = await testEndpoint('Email Detail', 'GET', `/api/v1/emails/${emailId}`);
    const attachments = emailDetail?.data?.data?.attachments;
    if (attachments?.length > 0) {
      await testEndpoint('Attachment Meta', 'GET', `/api/v1/email/attachments/${attachments[0].id}/metadata`);
    } else {
      console.log('  ⏭️  No attachments on test email');
    }
  }

  // ===== 14. SIGNATURES =====
  console.log('\n--- 14. Signatures ---');
  await testEndpoint('List Signatures', 'GET', '/api/v1/emails/signatures');

  // ===== 15. TEMPLATES =====
  console.log('\n--- 15. Templates ---');
  await testEndpoint('List Templates', 'GET', '/api/v1/emails/templates');
  await testEndpoint('Template Categories', 'GET', '/api/v1/emails/templates/categories');

  // ===== 16. SCHEDULED EMAILS =====
  console.log('\n--- 16. Scheduled Emails ---');
  await testEndpoint('List Scheduled', 'GET', '/api/v1/emails/scheduled');

  // ===== 17. FOLLOW-UPS =====
  console.log('\n--- 17. Follow-ups ---');
  await testEndpoint('Pending Follow-ups', 'GET', '/api/v1/ai/follow-ups/pending');
  await testEndpoint('Follow-up Stats', 'GET', '/api/v1/ai/follow-ups/stats');
  if (emailId) {
    await testEndpoint('Follow-up by Email', 'GET', `/api/v1/ai/follow-ups/by-email/${emailId}`);
  }

  // ===== 18. CALENDAR =====
  console.log('\n--- 18. Calendar ---');
  await testEndpoint('Calendar Events', 'GET', '/api/v1/calendar/events');

  // ===== SUMMARY =====
  console.log('\n\n' + '='.repeat(50));
  console.log('           VALIDATION SUMMARY');
  console.log('='.repeat(50));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;
  const total = results.length;
  const score = Math.round((passed / total) * 10 * 10) / 10;

  console.log(`\n  Total:   ${total}`);
  console.log(`  Passed:  ${passed} ✅`);
  console.log(`  Failed:  ${failed} ❌`);
  console.log(`  Errors:  ${errors} 💥`);
  console.log(`  Score:   ${score}/10`);

  if (failed > 0 || errors > 0) {
    console.log('\n  FAILURES:');
    results.filter(r => r.status !== 'PASS').forEach(r => {
      console.log(`    ❌ ${r.name}: ${r.detail}`);
    });
  }

  console.log('\n' + '='.repeat(50) + '\n');

  await browser.close();
  process.exit(failed + errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
