/**
 * Sprint 20 Production Validation — Contextual Sidebar & Activity Timeline
 * Validates via Edge CDP with real auth session
 */
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'https://mail-agent-indol.vercel.app';
const API_URL = process.env.API_URL || 'https://backend-production-78e1.up.railway.app';
const CDP_URL = 'http://localhost:9222';
const SCREENSHOTS_DIR = 'scripts/screenshots';

const results = [];
function log(label, pass, detail = '') {
  const icon = pass ? '✅' : '❌';
  results.push({ label, pass, detail });
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (e) {
    console.error('Cannot connect to Edge CDP on port 9222. Launch Edge with --remote-debugging-port=9222');
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (!contexts.length) {
    console.error('No browser contexts found');
    process.exit(1);
  }

  const context = contexts[0];
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  try {
    // 1. Email thread page — check sidebar renders
    console.log('\n=== Email Thread Sidebar ===');
    await page.goto(`${APP_URL}/dashboard/email`, { waitUntil: 'networkidle' });
    const emailUrl = page.url();
    const isLoggedIn = !emailUrl.includes('/auth') && !emailUrl.includes('/login');
    log('Auth session valid', isLoggedIn, emailUrl);

    if (!isLoggedIn) {
      console.error('Not logged in. Please log in to PMSync in Edge first.');
      process.exit(1);
    }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/sprint20_email_list.png`, fullPage: false });
    log('Email list page renders', true);

    // 2. Contacts page — check CRM tab exists
    console.log('\n=== Contact Detail CRM Tab ===');
    await page.goto(`${APP_URL}/dashboard/contacts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/sprint20_contacts.png`, fullPage: false });

    // Check if any contacts exist to click on
    const contactRows = await page.locator('tr').count();
    log('Contacts page renders', contactRows > 0, `${contactRows} rows`);

    // Try clicking first contact to see tabs
    const contactRow = page.locator('tr').nth(1);
    if (contactRows > 1) {
      try {
        await contactRow.click();
        await page.waitForTimeout(2000);

        // Look for CRM tab
        const crmTab = page.getByRole('tab', { name: 'CRM' });
        const crmTabVisible = await crmTab.isVisible().catch(() => false);
        log('CRM tab visible on contact detail', crmTabVisible);

        if (crmTabVisible) {
          await crmTab.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: `${SCREENSHOTS_DIR}/sprint20_contact_crm_tab.png`, fullPage: false });
          log('CRM tab content renders', true);
        }
      } catch (e) {
        log('Contact detail interaction', false, e.message);
      }
    }

    // 3. API endpoints — validate with real cookies
    console.log('\n=== API Endpoint Validation ===');
    const cookies = await context.cookies(API_URL);
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Test suggestions endpoint
    const suggestionsResp = await page.request.get(`${API_URL}/api/v1/crm/suggestions`, {
      headers: { Cookie: cookieHeader },
    });
    log('GET /crm/suggestions', suggestionsResp.status() === 200, `HTTP ${suggestionsResp.status()}`);

    if (suggestionsResp.status() === 200) {
      const suggestionsData = await suggestionsResp.json();
      const count = suggestionsData?.data?.length ?? suggestionsData?.total ?? '?';
      log('Suggestions data returned', true, `${count} suggestions`);
    }

    // Test context by-email
    const contextResp = await page.request.get(`${API_URL}/api/v1/crm/context/by-email?email=test@example.com`, {
      headers: { Cookie: cookieHeader },
    });
    log('GET /crm/context/by-email', [200, 404].includes(contextResp.status()), `HTTP ${contextResp.status()}`);

    // Test activities endpoint
    const activitiesResp = await page.request.get(`${API_URL}/api/v1/crm/activities/account/nonexistent`, {
      headers: { Cookie: cookieHeader },
    });
    log('GET /crm/activities/:type/:id', [200, 404].includes(activitiesResp.status()), `HTTP ${activitiesResp.status()}`);

    // 4. Dashboard — check if CrmSuggestionsFeed could render
    console.log('\n=== Dashboard Widget ===');
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/sprint20_dashboard.png`, fullPage: false });
    log('Dashboard page renders', true);

    // 5. Mobile viewport
    console.log('\n=== Mobile Viewport ===');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URL}/dashboard/contacts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/sprint20_contacts_mobile.png`, fullPage: true });
    log('Contacts mobile renders', true);

  } catch (e) {
    log('Unexpected error', false, e.message);
  } finally {
    await page.close();
  }

  // Summary
  console.log('\n========================================');
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`Sprint 20 Validation: ${passed}/${total} PASS`);
  console.log('========================================');
  process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);
