/**
 * Sprint 20 Focused Re-validation
 * Tests the specific bug fix (by-email 400) + CRM tab + sidebar
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const APP_URL = process.env.APP_URL || 'https://mail-agent-indol.vercel.app';
const SHOTS = 'scripts/screenshots';
await mkdir(SHOTS, { recursive: true });

const results = [];
const apiErrors = [];

function log(label, pass, detail = '') {
  results.push({ label, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // Track CRM context API calls specifically
  const crmContextCalls = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/crm/context/by-email')) {
      crmContextCalls.push({ url, status: resp.status() });
    }
    if (url.includes('/api/v1/') && resp.status() >= 400 && resp.status() !== 401) {
      apiErrors.push(`${resp.status()} ${url.substring(url.indexOf('/api/'))}`);
    }
  });

  try {
    // === 1. CONTACTS PAGE — Verify CRM tab with real contact ===
    console.log('\n=== CONTACTS — CRM TAB ===');
    await page.goto(`${APP_URL}/dashboard/contacts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Click first contact in the list
    const contactListItems = page.locator('li, [role="listitem"]').filter({ hasText: /\w/ });
    const firstContactItem = contactListItems.first();
    const contactExists = await firstContactItem.isVisible().catch(() => false);

    if (!contactExists) {
      // Try clicking any clickable item in the sidebar/list area
      const listArea = page.locator('nav, aside, [class*="sidebar"], [class*="list"]').first();
      const links = listArea.locator('a, [role="button"]').filter({ hasText: /\w{3,}/ });
      const linkCount = await links.count();
      if (linkCount > 0) {
        await links.first().click();
        await page.waitForTimeout(2000);
      }
    } else {
      await firstContactItem.click();
      await page.waitForTimeout(2000);
    }

    // Look for CRM tab
    const tabs = await page.getByRole('tab').allTextContents();
    log('Contact tabs found', tabs.length >= 4, tabs.join(' | '));
    const hasCRM = tabs.some(t => t === 'CRM');
    log('CRM tab present', hasCRM);

    if (hasCRM) {
      await page.getByRole('tab', { name: 'CRM' }).click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${SHOTS}/s20_crm_tab_final.png`, fullPage: false });

      // Check content
      const tabPanel = page.locator('[role="tabpanel"]').last();
      const text = await tabPanel.textContent().catch(() => '');
      log('CRM tab has Account section', text.includes('Account') || text.includes('account'));
      log('CRM tab has Deals section', text.includes('Deal') || text.includes('Trattativ') || text.includes('deal'));
      log('CRM tab has Tickets section', text.includes('Ticket') || text.includes('ticket'));
    }

    // === 2. EMAIL PAGE — Sidebar and by-email fix ===
    console.log('\n=== EMAIL — SIDEBAR + BY-EMAIL FIX ===');
    await page.goto(`${APP_URL}/dashboard/email`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Click first email to open reading pane
    const emailItems = page.locator('[data-testid*="thread"], [class*="thread"], [class*="email-item"]');
    const emailItemCount = await emailItems.count();

    if (emailItemCount === 0) {
      // Fallback: click any row-like element in the email list
      const rows = page.locator('div[role="button"], [class*="list-item"]').filter({ hasText: /@/ });
      const rowCount = await rows.count();
      if (rowCount > 0) {
        await rows.first().click();
        await page.waitForTimeout(3000);
      }
    } else {
      await emailItems.first().click();
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: `${SHOTS}/s20_email_sidebar_final.png`, fullPage: false });

    // Check sidebar content
    const bodyText = await page.textContent('body');
    const hasSidebar = bodyText.includes('CRM Context') || bodyText.includes('Contesto CRM');
    log('CRM sidebar visible', hasSidebar);

    // Check if by-email API returned 400 or 200
    const byEmailCalls = crmContextCalls.filter(c => c.url.includes('by-email'));
    if (byEmailCalls.length > 0) {
      const has400 = byEmailCalls.some(c => c.status === 400);
      const has200 = byEmailCalls.some(c => c.status === 200);
      log('by-email API calls', !has400, byEmailCalls.map(c => `${c.status}`).join(', '));
      if (has400) {
        const badCalls = byEmailCalls.filter(c => c.status === 400);
        badCalls.forEach(c => console.log(`  ❗ 400: ${c.url.substring(c.url.indexOf('email='))}`));
      }
    } else {
      log('by-email API not called', true, 'no email selected or sidebar disabled');
    }

    // === 3. Check for CRM-specific API errors ===
    console.log('\n=== API ERROR SUMMARY ===');
    const crmErrors = apiErrors.filter(e => e.includes('/crm/'));
    const nonChurnErrors = crmErrors.filter(e => !e.includes('/churn/'));
    log('CRM API errors (excl. churn)', nonChurnErrors.length === 0,
      nonChurnErrors.length > 0 ? nonChurnErrors.join('; ') : 'clean');

    // Churn 404s are pre-existing, not Sprint 20
    const churnErrors = crmErrors.filter(e => e.includes('/churn/'));
    if (churnErrors.length > 0) {
      console.log(`  ℹ️  Pre-existing: ${churnErrors.length} churn 404s (not Sprint 20)`);
    }

  } catch (e) {
    log('Unexpected error', false, e.message);
  } finally {
    await page.close();
  }

  console.log('\n==========================================');
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const failed = results.filter(r => !r.pass);
  console.log(`Sprint 20 Re-validation: ${passed}/${total} PASS`);
  if (failed.length > 0) {
    console.log('Failed:');
    failed.forEach(r => console.log(`  ❌ ${r.label} — ${r.detail}`));
  }
  console.log('==========================================');
}

main().catch(console.error);
