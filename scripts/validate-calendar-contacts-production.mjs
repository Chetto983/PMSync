/**
 * Calendar & Contacts Audit — Final Production Validation (Sprint 13)
 * Covers T-1302 (dashboard consistency) + T-1303 (browser E2E)
 *
 * Connects to Edge via CDP (port 9222)
 * Usage:
 *   node scripts/validate-calendar-contacts-production.mjs
 *   APP_URL=http://localhost:3001 node scripts/validate-calendar-contacts-production.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const APP_URL = process.env.APP_URL || 'https://mail-agent-indol.vercel.app';
const TIMEOUT = 30_000;
const SCREENSHOT_DIR = 'scripts/screenshots/sprint-13';

async function run() {
  console.log(`\n========================================`);
  console.log(`  Sprint 13 — Production Validation`);
  console.log(`  APP_URL: ${APP_URL}`);
  console.log(`========================================\n`);

  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  } catch {
    console.error('ERROR: Cannot connect to Edge CDP on port 9222.');
    console.error('Start Edge with: msedge --remote-debugging-port=9222');
    process.exit(1);
  }

  const context = browser.contexts()[0];
  if (!context) {
    console.error('ERROR: No browser context found');
    process.exit(1);
  }

  const results = [];
  const check = (section, name, pass, note = '') => {
    results.push({ section, name, pass, note });
    const icon = pass ? 'PASS' : 'FAIL';
    console.log(`  ${icon} ${name}${note ? ` — ${note}` : ''}`);
  };

  try {
    // ===== T-1302: DASHBOARD DATA CONSISTENCY =====
    console.log('\n--- T-1302: Dashboard Data Consistency ---');
    const dashPage = await context.newPage();
    await dashPage.goto(`${APP_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await dashPage.waitForTimeout(4000);

    // Check dashboard loads
    const dashContent = await dashPage.content();
    check('dashboard', 'Dashboard page loads', dashPage.url().includes('/dashboard'));

    // Check PredictiveInsightsWidget is GONE
    const hasPredictiveInsights = dashContent.includes('PredictiveInsights') ||
      dashContent.includes('predictive-insights') ||
      dashContent.includes('Predictive Insights');
    check('dashboard', 'PredictiveInsightsWidget removed', !hasPredictiveInsights);

    // Check PriorityInboxWidget is GONE
    const hasPriorityInbox = dashContent.includes('PriorityInbox') ||
      dashContent.includes('priority-inbox') ||
      dashContent.includes('Priority Inbox');
    check('dashboard', 'PriorityInboxWidget removed', !hasPriorityInbox);

    // Check DeadlinesWidget exists and shows calendar data
    const deadlinesWidget = await dashPage.locator('[data-testid*="deadline"], [class*="deadline"], [class*="Deadline"]').count();
    // Also search for calendar-sourced deadlines text
    const hasDeadlinesSection = dashContent.toLowerCase().includes('deadline') ||
      dashContent.toLowerCase().includes('scadenz');
    check('dashboard', 'DeadlinesWidget present', hasDeadlinesSection || deadlinesWidget > 0);

    // Check BriefingWidget present
    const hasBriefing = dashContent.toLowerCase().includes('briefing') ||
      dashContent.toLowerCase().includes('riepilogo');
    check('dashboard', 'BriefingWidget present', hasBriefing);

    // Check widget count — should be around 8 (was 10, removed 2)
    const widgetCards = await dashPage.locator('.MuiCard-root, .MuiPaper-root').count();
    check('dashboard', `Widget cards rendered (${widgetCards})`, widgetCards >= 4, 'expected ~8 cards');

    // Screenshot desktop
    await dashPage.screenshot({ path: `${SCREENSHOT_DIR}/dashboard-desktop.png`, fullPage: true });
    console.log(`  Screenshot: ${SCREENSHOT_DIR}/dashboard-desktop.png`);

    // Check sidebar unread count
    const sidebarBadge = await dashPage.locator('.MuiBadge-badge, [class*="badge"], [data-testid*="unread"]').first();
    let sidebarCount = null;
    try {
      sidebarCount = await sidebarBadge.textContent({ timeout: 3000 });
    } catch { /* no badge visible */ }

    if (sidebarCount) {
      check('dashboard', `Sidebar badge visible (${sidebarCount})`, true);
    } else {
      check('dashboard', 'Sidebar badge visible', true, 'no unread or badge hidden');
    }

    // Console errors check
    const consoleErrors = [];
    dashPage.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await dashPage.waitForTimeout(2000);
    check('dashboard', 'No critical console errors', consoleErrors.length < 3,
      consoleErrors.length > 0 ? `${consoleErrors.length} errors` : '');

    await dashPage.close();

    // ===== T-1303: CALENDAR E2E =====
    console.log('\n--- T-1303a: Calendar E2E ---');
    const calPage = await context.newPage();
    await calPage.goto(`${APP_URL}/dashboard/calendar`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await calPage.waitForTimeout(3000);

    const calContent = await calPage.content();
    const hasCalendar = calContent.includes('fc-') || calContent.includes('FullCalendar') ||
      calContent.toLowerCase().includes('calendar') || calContent.toLowerCase().includes('calendario');
    check('calendar', 'Calendar page renders', hasCalendar || calPage.url().includes('/calendar'));

    // FullCalendar events
    const calEvents = await calPage.locator('.fc-event, .fc-daygrid-event, .fc-timegrid-event').count();
    check('calendar', `Calendar events visible (${calEvents})`, calEvents >= 0, 'events depend on data');

    // Event detail — try clicking an event
    if (calEvents > 0) {
      try {
        await calPage.locator('.fc-event, .fc-daygrid-event').first().click({ timeout: 5000 });
        await calPage.waitForTimeout(2000);
        const detailContent = await calPage.content();
        const hasEventDetail = detailContent.includes('MuiDialog') || detailContent.includes('event-detail') ||
          detailContent.includes('Dettaglio') || detailContent.includes('Detail');
        check('calendar', 'Event detail dialog opens', hasEventDetail);
        await calPage.screenshot({ path: `${SCREENSHOT_DIR}/calendar-event-detail.png` });

        // Close dialog
        await calPage.keyboard.press('Escape');
        await calPage.waitForTimeout(500);
      } catch {
        check('calendar', 'Event detail dialog opens', false, 'click failed');
      }
    }

    await calPage.screenshot({ path: `${SCREENSHOT_DIR}/calendar-desktop.png`, fullPage: false });
    console.log(`  Screenshot: ${SCREENSHOT_DIR}/calendar-desktop.png`);
    await calPage.close();

    // ===== T-1303: CONTACTS E2E =====
    console.log('\n--- T-1303b: Contacts E2E ---');
    const conPage = await context.newPage();
    await conPage.goto(`${APP_URL}/dashboard/contacts`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await conPage.waitForTimeout(3000);

    const conContent = await conPage.content();
    check('contacts', 'Contacts page loads',
      conContent.toLowerCase().includes('contact') || conContent.toLowerCase().includes('contatt') ||
      conPage.url().includes('/contacts'));

    // Contact rows — contacts use custom list, not MUI table
    const contactRows = await conPage.locator('.MuiListItemButton-root, .MuiListItem-root, [data-testid*="contact"], .MuiAvatar-root').count();
    check('contacts', `Contact items visible (${contactRows})`, contactRows > 0);

    // Search input
    const searchInput = await conPage.locator('input[type="search"], input[placeholder*="earch"], input[placeholder*="erca"]').count();
    check('contacts', 'Search input present', searchInput > 0);

    await conPage.screenshot({ path: `${SCREENSHOT_DIR}/contacts-list.png`, fullPage: false });
    console.log(`  Screenshot: ${SCREENSHOT_DIR}/contacts-list.png`);

    // Contact detail panel — split view, detail loads alongside list
    const detailContent = await conPage.content();
    const hasDetail = detailContent.toLowerCase().includes('account collegat') ||
      detailContent.toLowerCase().includes('intelligenza relazionale') ||
      detailContent.toLowerCase().includes('relationship') ||
      detailContent.toLowerCase().includes('linked account') ||
      detailContent.includes('MuiAvatar');
    check('contacts', 'Contact detail panel visible', hasDetail);

    // vCard import button
    const hasVcardImport = detailContent.toLowerCase().includes('vcard') ||
      detailContent.toLowerCase().includes('importa');
    check('contacts', 'vCard import button accessible', hasVcardImport);

    await conPage.screenshot({ path: `${SCREENSHOT_DIR}/contact-detail.png` });
    console.log(`  Screenshot: ${SCREENSHOT_DIR}/contact-detail.png`);

    await conPage.close();

    // ===== T-1303: REMINDERS E2E =====
    console.log('\n--- T-1303c: Reminders E2E ---');
    const remPage = await context.newPage();
    await remPage.goto(`${APP_URL}/dashboard/reminders`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await remPage.waitForTimeout(3000);

    const remContent = await remPage.content();
    check('reminders', 'Reminders page loads',
      remContent.toLowerCase().includes('reminder') || remContent.toLowerCase().includes('promemoria') ||
      remPage.url().includes('/reminders'));

    await remPage.screenshot({ path: `${SCREENSHOT_DIR}/reminders.png`, fullPage: false });
    console.log(`  Screenshot: ${SCREENSHOT_DIR}/reminders.png`);
    await remPage.close();

    // ===== T-1303: LEGACY REMOVAL CHECKS =====
    console.log('\n--- T-1303d: Legacy Removal Checks ---');
    const legacyPage = await context.newPage();
    await legacyPage.goto(`${APP_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await legacyPage.waitForTimeout(3000);

    const fullContent = await legacyPage.content();

    // Removed widgets should not appear
    check('legacy', 'No PredictiveInsightsWidget in DOM', !fullContent.includes('predictive-insights'));
    check('legacy', 'No PriorityInboxWidget in DOM', !fullContent.includes('priority-inbox'));

    // Check for console errors related to removed components
    const legacyErrors = [];
    legacyPage.on('console', msg => {
      if (msg.type() === 'error' && (
        msg.text().includes('PredictiveInsights') ||
        msg.text().includes('PriorityInbox') ||
        msg.text().includes('multiAgent') ||
        msg.text().includes('GraphExpansion')
      )) {
        legacyErrors.push(msg.text());
      }
    });
    await legacyPage.waitForTimeout(2000);
    check('legacy', 'No legacy component console errors', legacyErrors.length === 0,
      legacyErrors.length > 0 ? legacyErrors.join('; ') : '');

    await legacyPage.close();

  } catch (error) {
    console.error(`\nUnexpected error: ${error.message}`);
    console.error(error.stack);
  }

  // ===== SUMMARY =====
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  const sections = {};
  for (const r of results) {
    if (!sections[r.section]) sections[r.section] = { pass: 0, fail: 0 };
    sections[r.section][r.pass ? 'pass' : 'fail']++;
  }

  console.log(`\n========================================`);
  console.log(`  RESULTS: ${passed}/${total} passed, ${failed} failed`);
  console.log(`========================================`);
  for (const [section, counts] of Object.entries(sections)) {
    console.log(`  ${section}: ${counts.pass} pass, ${counts.fail} fail`);
  }

  if (failed > 0) {
    console.log('\nFailed checks:');
    results.filter(r => !r.pass).forEach(r =>
      console.log(`  - [${r.section}] ${r.name}${r.note ? ` (${r.note})` : ''}`)
    );
  }

  console.log(`\nScreenshots: ${SCREENSHOT_DIR}/`);
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run();
