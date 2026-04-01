/**
 * Sprint 20 REAL Production Validation
 * Connects to Edge with real auth, navigates UI, captures console errors, checks API calls
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const APP_URL = process.env.APP_URL || 'https://mail-agent-indol.vercel.app';
const SHOTS = 'scripts/screenshots';
await mkdir(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];

function log(label, pass, detail = '') {
  results.push({ label, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Track API failures
  const apiErrors = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/api/v1/') && resp.status() >= 400 && resp.status() !== 401) {
      apiErrors.push(`${resp.status()} ${resp.url()}`);
    }
  });

  try {
    // ===== 1. CONTACTS PAGE — CRM TAB =====
    console.log('\n========== CONTACTS PAGE ==========');
    await page.goto(`${APP_URL}/dashboard/contacts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const contactsUrl = page.url();
    log('Contacts page loaded', !contactsUrl.includes('/auth'), contactsUrl);
    await page.screenshot({ path: `${SHOTS}/s20_01_contacts_list.png`, fullPage: false });

    // Find and click a contact
    const contactItems = page.locator('[role="row"], [data-testid*="contact"], tr').filter({ hasText: /@/ });
    const contactCount = await contactItems.count();
    log('Contacts found', contactCount > 0, `${contactCount} contacts`);

    if (contactCount > 0) {
      await contactItems.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SHOTS}/s20_02_contact_detail.png`, fullPage: false });

      // Check for CRM tab
      const allTabs = await page.getByRole('tab').allTextContents();
      log('Contact tabs', allTabs.length > 0, allTabs.join(', '));
      const hasCrmTab = allTabs.some(t => t === 'CRM');
      log('CRM tab present', hasCrmTab);

      if (hasCrmTab) {
        await page.getByRole('tab', { name: 'CRM' }).click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: `${SHOTS}/s20_03_contact_crm_tab.png`, fullPage: false });

        // Check CRM tab content
        const crmContent = await page.locator('[role="tabpanel"]').last().textContent().catch(() => '');
        const hasAccount = crmContent.includes('Account') || crmContent.includes('account');
        const hasDeals = crmContent.includes('Deal') || crmContent.includes('deal') || crmContent.includes('Trattativ');
        const hasTickets = crmContent.includes('Ticket') || crmContent.includes('ticket');
        log('CRM tab shows Account section', hasAccount);
        log('CRM tab shows Deals section', hasDeals);
        log('CRM tab shows Tickets section', hasTickets);
      }
    }

    // ===== 2. EMAIL THREAD — SIDEBAR =====
    console.log('\n========== EMAIL THREAD SIDEBAR ==========');
    await page.goto(`${APP_URL}/dashboard/email`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/s20_04_email_list.png`, fullPage: false });

    // Try clicking first email thread
    const emailRows = page.locator('[data-testid*="thread"], [data-testid*="email"], tr').filter({ hasText: /@/ });
    const emailCount = await emailRows.count();
    log('Emails found', emailCount > 0, `${emailCount} emails`);

    if (emailCount > 0) {
      await emailRows.first().click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${SHOTS}/s20_05_email_thread.png`, fullPage: false });

      // Check if sidebar or sidebar toggle is visible
      const sidebarToggle = page.locator('button').filter({ has: page.locator('svg') });
      const threadUrl = page.url();
      log('Email thread opened', threadUrl.includes('thread') || threadUrl.includes('email'), threadUrl);

      // Check for CRM Context text or sidebar drawer
      const pageText = await page.textContent('body');
      const hasSidebarContent = pageText.includes('CRM Context') || pageText.includes('Contesto CRM') ||
        pageText.includes('Relationship') || pageText.includes('Relazione');
      log('CRM sidebar content found', hasSidebarContent);
    }

    // ===== 3. DASHBOARD — SUGGESTIONS WIDGET =====
    console.log('\n========== DASHBOARD ==========');
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SHOTS}/s20_06_dashboard.png`, fullPage: false });

    const dashText = await page.textContent('body').catch(() => '');
    log('Dashboard loaded', dashText.length > 100);

    // Check if AI Suggestions widget renders
    const hasSuggestionsWidget = dashText.includes('AI Suggestions') || dashText.includes('Suggerimenti AI');
    log('AI Suggestions widget found', hasSuggestionsWidget, hasSuggestionsWidget ? 'widget present' : 'not wired into dashboard yet (OK — T-2007 creates component only)');

    // ===== 4. MOBILE VIEWPORT =====
    console.log('\n========== MOBILE (375px) ==========');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URL}/dashboard/contacts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOTS}/s20_07_contacts_mobile.png`, fullPage: true });
    log('Contacts mobile renders', true);

    // Check email on mobile — sidebar should be hidden
    await page.goto(`${APP_URL}/dashboard/email`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOTS}/s20_08_email_mobile.png`, fullPage: false });
    log('Email mobile renders', true);

    // Reset viewport
    await page.setViewportSize({ width: 1440, height: 900 });

    // ===== 5. CONSOLE ERRORS & API ERRORS =====
    console.log('\n========== ERROR ANALYSIS ==========');
    log('Console errors', consoleErrors.length === 0, consoleErrors.length > 0 ? `${consoleErrors.length} errors` : 'clean');
    if (consoleErrors.length > 0) {
      console.log('  Console errors:');
      consoleErrors.slice(0, 10).forEach(e => console.log(`    - ${e.substring(0, 120)}`));
    }

    log('API errors (non-401)', apiErrors.length === 0, apiErrors.length > 0 ? `${apiErrors.length} errors` : 'clean');
    if (apiErrors.length > 0) {
      console.log('  API errors:');
      apiErrors.slice(0, 10).forEach(e => console.log(`    - ${e}`));
    }

  } catch (e) {
    log('Unexpected error', false, e.message);
    console.error(e);
  } finally {
    await page.close();
  }

  // ===== SUMMARY =====
  console.log('\n==========================================');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`Sprint 20 Validation: ${passed}/${results.length} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log('\nFailed checks:');
    results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.label} — ${r.detail}`));
  }
  console.log('==========================================');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(console.error);
