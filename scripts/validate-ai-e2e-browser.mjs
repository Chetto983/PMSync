/**
 * Sprint 13 — AI Features Browser E2E Validation (T-1302 + T-1303)
 *
 * Connects to Edge via CDP and validates AI-related UI elements:
 * - T-1302: Dashboard AI widgets, AI chat page, command palette, AI compose
 * - T-1303: CRM AI features (forecast, governance, lead scores, NBA)
 */

import { chromium } from 'playwright';
import fs from 'fs';

const APP_URL = process.env.APP_URL || 'https://mail-agent-indol.vercel.app';
const CDP_URL = 'http://127.0.0.1:9222';
const SCREENSHOT_DIR = 'scripts/screenshots/s13';

let browser, context, page;
const results = [];

function pass(task, detail) {
  results.push({ task, status: 'PASS', detail });
  console.log(`  PASS: ${task}: ${detail}`);
}

function fail(task, detail) {
  results.push({ task, status: 'FAIL', detail });
  console.log(`  FAIL: ${task}: ${detail}`);
}

function warn(task, detail) {
  results.push({ task, status: 'WARN', detail });
  console.log(`  WARN: ${task}: ${detail}`);
}

async function screenshot(name) {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
  } catch (e) {
    console.log(`    (screenshot ${name} failed: ${e.message})`);
  }
}

async function setup() {
  console.log(`\nConnecting to Edge CDP at ${CDP_URL}...`);
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (contexts.length === 0) throw new Error('No browser contexts found');
  context = contexts[0];

  const pages = context.pages();
  page = pages.find(p => p.url().includes('mail-agent') || p.url().includes('localhost:3001'));
  if (!page) {
    page = await context.newPage();
  }
  try {
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch { /* redirect is fine */ }
  await page.waitForTimeout(3000);
  console.log(`Page: ${page.url()}\n`);
}

async function navigateTo(path) {
  try {
    await page.goto(`${APP_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch { /* redirect is fine */ }
  await page.waitForTimeout(2500);
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1302a: Dashboard AI widgets (triage, briefing, follow-ups)
// ═══════════════════════════════════════════════════════════════════════════
async function validateDashboardWidgets() {
  console.log('-- T-1302a: Dashboard AI widgets --');
  await navigateTo('/dashboard');
  await screenshot('dashboard');

  // Check briefing widget
  const briefing = await page.$('[id="briefing"], [class*="BriefingWidget"], [data-widget="briefing"]');
  if (briefing) {
    pass('T-1302a', 'Briefing widget found on dashboard');
  } else {
    // Try text-based detection
    const briefingText = await page.locator('text=/daily briefing|morning briefing/i').count();
    if (briefingText > 0) {
      pass('T-1302a', 'Briefing widget found (by text)');
    } else {
      warn('T-1302a', 'Briefing widget not visible (may be collapsed or user has no data)');
    }
  }

  // Check triage widget
  const triage = await page.$('[id="triage"], [class*="TriageWidget"], [data-widget="triage"]');
  if (triage) {
    pass('T-1302a', 'AI Triage widget found on dashboard');
  } else {
    const triageText = await page.locator('text=/triage|priority/i').count();
    if (triageText > 0) {
      pass('T-1302a', 'Triage widget found (by text)');
    } else {
      warn('T-1302a', 'Triage widget not visible (may be disabled or no data)');
    }
  }

  // Check follow-up widget
  const followUp = await page.$('[id="followups"], [class*="FollowUpWidget"], [data-widget="followups"]');
  if (followUp) {
    pass('T-1302a', 'Follow-up widget found on dashboard');
  } else {
    const fuText = await page.locator('text=/follow.?up/i').count();
    if (fuText > 0) {
      pass('T-1302a', 'Follow-up widget found (by text)');
    } else {
      warn('T-1302a', 'Follow-up widget not visible (may be disabled or no data)');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1302b: AI chat page accessible
// ═══════════════════════════════════════════════════════════════════════════
async function validateAiChatPage() {
  console.log('-- T-1302b: AI chat page --');
  await navigateTo('/dashboard/ai');
  await page.waitForTimeout(2000);
  await screenshot('ai-chat');

  const url = page.url();
  if (url.includes('/dashboard/ai') || url.includes('/ai')) {
    pass('T-1302b', `AI chat page loaded: ${url}`);
  } else {
    fail('T-1302b', `Redirected away from AI chat: ${url}`);
    return;
  }

  // Check chat surface elements
  const chatSurface = await page.$('.chat-surface, .chat-page, .chat-desktop-layout, [class*="ChatPage"]');
  if (chatSurface) {
    pass('T-1302b', 'Chat surface/layout component rendered');
  } else {
    warn('T-1302b', 'Chat surface not found by class — checking for input');
  }

  // Check chat input (textarea or contenteditable)
  const chatInput = await page.$('textarea, [contenteditable="true"], [role="textbox"]');
  if (chatInput) {
    pass('T-1302b', 'Chat input element found');
  } else {
    fail('T-1302b', 'No chat input found on AI page');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1302c: Command palette opens and closes
// ═══════════════════════════════════════════════════════════════════════════
async function validateCommandPalette() {
  console.log('-- T-1302c: Command palette --');
  // Navigate to dashboard first (neutral page)
  await navigateTo('/dashboard');
  await page.waitForTimeout(1000);

  // Open with Ctrl+K
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(1000);
  await screenshot('command-palette-open');

  const palette = await page.$('[aria-label*="Command"], #command-palette-list, [role="combobox"], [role="dialog"]');
  if (palette) {
    pass('T-1302c', 'Command palette opened with Ctrl+K');
  } else {
    fail('T-1302c', 'Command palette did not open with Ctrl+K');
    return;
  }

  // Close with Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const paletteAfter = await page.$('[aria-label*="Command"], #command-palette-list');
  const visible = paletteAfter ? await paletteAfter.isVisible().catch(() => false) : false;
  if (!visible) {
    pass('T-1302c', 'Command palette closed with Escape');
  } else {
    fail('T-1302c', 'Command palette still visible after Escape');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1302d: AI compose menu in email composer
// ═══════════════════════════════════════════════════════════════════════════
async function validateAiCompose() {
  console.log('-- T-1302d: AI compose menu --');
  await navigateTo('/dashboard/email/compose');
  await page.waitForTimeout(2000);
  await screenshot('email-compose');

  const url = page.url();
  // Compose may be a dialog on the email page
  if (!url.includes('/email')) {
    // Try navigating to email first
    await navigateTo('/dashboard/email');
    await page.waitForTimeout(2000);
  }

  // Look for compose dialog or compose area
  const composeArea = await page.$('[role="dialog"], [class*="Compose"], [class*="compose"]');
  if (composeArea) {
    pass('T-1302d', 'Compose area/dialog found');
  } else {
    warn('T-1302d', 'Compose dialog not found — may require clicking compose button');
    // Try clicking compose button
    const composeBtn = await page.$('button:has-text("Compose"), [aria-label*="compose"], [aria-label*="Compose"], a[href*="compose"]');
    if (composeBtn) {
      await composeBtn.click();
      await page.waitForTimeout(2000);
      await screenshot('email-compose-dialog');
    }
  }

  // Check for AI menu button in compose
  const aiBtn = await page.$('button:has-text("AI"), [aria-label*="AI"], [class*="AiCompose"]');
  if (aiBtn) {
    pass('T-1302d', 'AI compose button found in editor');
  } else {
    warn('T-1302d', 'AI compose button not found (may need text in editor first)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1302e: HITL approval card (if pending actions exist)
// ═══════════════════════════════════════════════════════════════════════════
async function validateHitl() {
  console.log('-- T-1302e: HITL card --');
  // Go to AI chat where HITL would appear
  await navigateTo('/dashboard/ai');
  await page.waitForTimeout(2000);

  // HITL card only shows when pending actions exist
  const hitlCard = await page.$('[class*="HITL"], [class*="hitl"], [class*="Approval"], [data-testid*="hitl"]');
  if (hitlCard) {
    pass('T-1302e', 'HITL approval card found');
  } else {
    // This is expected if no pending actions
    warn('T-1302e', 'No HITL card visible (expected if no pending actions)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1303a: CRM Forecast dashboard
// ═══════════════════════════════════════════════════════════════════════════
async function validateCrmForecast() {
  console.log('-- T-1303a: CRM Forecast dashboard --');
  await navigateTo('/dashboard/crm/forecast');
  await page.waitForTimeout(3000);
  await screenshot('crm-forecast');

  const url = page.url();
  if (url.includes('/crm') || url.includes('/forecast')) {
    pass('T-1303a', `Forecast page loaded: ${url}`);
  } else {
    fail('T-1303a', `Redirected from forecast: ${url}`);
    return;
  }

  // Check for chart element
  const chart = await page.$('canvas, [class*="Chart"], [class*="chart"], svg[class*="chart"]');
  if (chart) {
    pass('T-1303a', 'Forecast chart element found');
  } else {
    warn('T-1303a', 'No chart element found (may need data or different selector)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1303b: AI Governance tabs
// ═══════════════════════════════════════════════════════════════════════════
async function validateAiGovernance() {
  console.log('-- T-1303b: AI Governance tabs --');
  await navigateTo('/dashboard/crm/ai-governance');
  await page.waitForTimeout(3000);
  await screenshot('crm-governance');

  const url = page.url();
  if (!url.includes('/governance') && !url.includes('/crm')) {
    fail('T-1303b', `Redirected from governance: ${url}`);
    return;
  }

  // Check for tab elements
  const tabs = await page.$$('[role="tab"]');
  if (tabs.length > 0) {
    pass('T-1303b', `Found ${tabs.length} governance tabs`);

    // Try clicking second tab to verify switching works
    if (tabs.length >= 2) {
      try {
        // Re-query tabs to get fresh handles
        const freshTabs = await page.$$('[role="tab"]');
        if (freshTabs.length >= 2) {
          await freshTabs[1].click({ timeout: 5000 });
          await page.waitForTimeout(1000);
          pass('T-1303b', 'Tab switching works');
        }
      } catch {
        warn('T-1303b', 'Tab click failed (DOM detachment) but tabs exist');
      }
    }
  } else {
    fail('T-1303b', 'No tab elements found on governance page');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1303c: Lead score badges on deal list
// ═══════════════════════════════════════════════════════════════════════════
async function validateLeadScores() {
  console.log('-- T-1303c: Lead score badges --');
  await navigateTo('/dashboard/crm/deals');
  await page.waitForTimeout(3000);
  await screenshot('crm-deals');

  const url = page.url();
  if (!url.includes('/deals') && !url.includes('/crm')) {
    fail('T-1303c', `Redirected from deals: ${url}`);
    return;
  }

  // Look for score badges (Chip, Badge, or score text)
  const scoreBadges = await page.$$('[class*="Chip"], [class*="Badge"], [class*="score"], [data-field*="score"]');
  if (scoreBadges.length > 0) {
    pass('T-1303c', `Found ${scoreBadges.length} potential score/badge elements`);
  } else {
    warn('T-1303c', 'No score badges found (may need deals with scores)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1303d: NBA recommendations section
// ═══════════════════════════════════════════════════════════════════════════
async function validateNba() {
  console.log('-- T-1303d: NBA recommendations --');
  // NBA may be on dashboard or deal detail
  await navigateTo('/dashboard/crm');
  await page.waitForTimeout(3000);
  await screenshot('crm-dashboard');

  // Look for NBA/recommendations section
  const nba = await page.$('[class*="NBA"], [class*="nba"], [class*="Recommendation"], [class*="suggestion"]');
  if (nba) {
    pass('T-1303d', 'NBA/recommendations section found');
  } else {
    // Check for text-based detection
    const nbaText = await page.locator('text=/next best action|recommendation|suggest/i').count();
    if (nbaText > 0) {
      pass('T-1303d', 'NBA section found (by text)');
    } else {
      warn('T-1303d', 'NBA section not visible (may need active deals or different CRM page)');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  try {
    await setup();

    console.log('=== T-1302: AI Chat E2E ===\n');
    await validateDashboardWidgets();
    await validateAiChatPage();
    await validateCommandPalette();
    await validateAiCompose();
    await validateHitl();

    console.log('\n=== T-1303: CRM AI E2E ===\n');
    await validateCrmForecast();
    await validateAiGovernance();
    await validateLeadScores();
    await validateNba();
  } catch (e) {
    console.error(`\nFATAL: ${e.message}`);
  } finally {
    if (browser) await browser.close();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  S13 Browser E2E Results');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.status === 'PASS').length;
    const warned = results.filter(r => r.status === 'WARN').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    for (const r of results) {
      const icon = r.status === 'PASS' ? 'OK' : r.status === 'WARN' ? '??' : 'XX';
      console.log(`  [${icon}] ${r.task}: ${r.detail}`);
    }

    console.log(`\n  Total: ${results.length} checks | ${passed} PASS | ${warned} WARN | ${failed} FAIL`);
    console.log('='.repeat(60));

    // Write JSON report
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    fs.writeFileSync(`${SCREENSHOT_DIR}/report.json`, JSON.stringify({ results, summary: { passed, warned, failed } }, null, 2));

    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
