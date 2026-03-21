/**
 * Debug script: Launch Edge (Default profile) with remote debugging,
 * connect Playwright, and reproduce new chat creation flow.
 *
 * Usage: node scripts/debug-chat-creation.mjs
 *
 * Prerequisites:
 *   - Close all Edge windows first (or use a different --user-data-dir)
 *   - Frontend running on localhost:3001
 *   - Backend running on localhost:3000
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';

const EDGE_PATH =
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const USER_DATA_DIR =
  'C:/Users/Davide/AppData/Local/Microsoft/Edge/User Data';
const DEBUG_PORT = 9222;
const APP_URL = process.env.APP_URL || 'https://mail-agent-indol.vercel.app';
const AI_CHAT_PATH = '/dashboard/ai';

async function launchEdge() {
  // Check if Edge is already listening on the debug port
  try {
    const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (resp.ok) {
      console.log('✓ Edge already running with remote debugging on', DEBUG_PORT);
      return null;
    }
  } catch {
    // Not running yet — launch it
  }

  console.log('◆ Launching Edge (Default profile, debug port', DEBUG_PORT, ')...');
  const proc = spawn(
    EDGE_PATH,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${USER_DATA_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      APP_URL,
    ],
    { detached: true, stdio: 'ignore' },
  );
  proc.unref();

  // Wait for debug endpoint to be ready
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (resp.ok) {
        console.log('✓ Edge ready');
        return proc;
      }
    } catch {
      // retry
    }
  }
  throw new Error('Edge did not start within 15s');
}

async function main() {
  const edgeProc = await launchEdge();

  console.log('◆ Connecting Playwright via CDP...');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
  console.log('✓ Connected. Contexts:', browser.contexts().length);

  const context = browser.contexts()[0];
  if (!context) throw new Error('No browser context found');

  // List all open pages to find a logged-in session
  const allPages = context.pages();
  console.log('  Open tabs:', allPages.length);
  for (const p of allPages) {
    console.log(`    - ${p.url()}`);
  }

  // Find an existing app tab (already logged in) — match Vercel or localhost
  const appHost = new URL(APP_URL).host;
  let page = allPages.find(
    (p) => p.url().includes(appHost) && !p.url().includes('/auth/'),
  );
  if (!page) {
    // Fall back to any tab on the app host
    page = allPages.find((p) => p.url().includes(appHost));
  }
  if (!page) {
    console.log('◆ No app tab found, creating one...');
    page = await context.newPage();
    await page.goto(`${APP_URL}${AI_CHAT_PATH}`, { waitUntil: 'networkidle' });
  } else {
    console.log('✓ Using existing tab:', page.url());
  }

  // --- Reproduce: create a new chat ---
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Reproducing: New Chat Creation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Navigate to AI chat page
  if (!page.url().includes('/dashboard/ai')) {
    console.log('◆ Navigating to', AI_CHAT_PATH, '...');
    await page.goto(`${APP_URL}${AI_CHAT_PATH}`, { waitUntil: 'networkidle' });
  }
  console.log('✓ On page:', page.url());
  await page.screenshot({ path: 'scripts/debug-chat-page.png', fullPage: true });

  // Look for "new chat" button — .chat-sidebar-new-btn (ThreadListPrimitive.New)
  const newChatBtn = page.locator(
    '.chat-sidebar-new-btn, [aria-label*="new chat" i], [aria-label*="nuova chat" i], [aria-label*="Nuova" i]'
  );

  if (await newChatBtn.count() > 0) {
    console.log('◆ Clicking New Chat button...');
    await newChatBtn.first().click();
    await page.waitForTimeout(2000);
    console.log('✓ New chat created. Current URL:', page.url());
  } else {
    console.log('⚠ No "New Chat" button found. Dumping page structure...');
    const buttons = await page.locator('button').allTextContents();
    console.log('  Buttons on page:', buttons.slice(0, 20));
  }

  // Listen for network requests to capture the API call
  console.log('\n◆ Monitoring network for /ai/chat requests (10s)...');
  const requests = [];
  page.on('request', (req) => {
    if (req.url().includes('/ai/chat')) {
      requests.push({
        method: req.method(),
        url: req.url(),
        headers: Object.fromEntries(
          Object.entries(req.headers()).filter(([k]) =>
            ['cookie', 'content-type', 'authorization'].includes(k),
          ),
        ),
        postData: req.postData()?.slice(0, 500),
      });
    }
  });

  page.on('response', (resp) => {
    if (resp.url().includes('/ai/chat')) {
      console.log(`  ← ${resp.status()} ${resp.url()}`);
    }
  });

  // Type a test message if composer is visible
  // assistant-ui uses controlled React textarea — fill() doesn't work, must use type()
  const composer = page.locator('textarea').first();
  if (await composer.count() > 0) {
    console.log('◆ Clicking composer...');
    await composer.click();
    await page.waitForTimeout(300);
    console.log('◆ Typing test message (character-by-character)...');
    await composer.type('Ciao, quante email non lette ho?', { delay: 30 });
    await page.waitForTimeout(500);

    // Submit with Enter key (assistant-ui default)
    console.log('◆ Pressing Enter to send...');
    await page.keyboard.press('Enter');
    console.log('◆ Waiting 30s for AI response...');

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`  [${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      console.log(`  [PAGE ERROR] ${err.message}`);
    });

    await page.waitForTimeout(30000);
  } else {
    console.log('⚠ No textarea found on page');
    const allInputs = await page.locator('textarea, input, [contenteditable]').all();
    console.log('  Input elements found:', allInputs.length);
    for (const el of allInputs.slice(0, 5)) {
      console.log('    -', await el.evaluate(e => `${e.tagName} placeholder="${e.placeholder || ''}" class="${e.className?.slice(0,50)}"`));
    }
  }

  // Print captured requests
  if (requests.length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' Captured /ai/chat requests:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    for (const r of requests) {
      console.log(`  ${r.method} ${r.url}`);
      console.log(`  Headers:`, JSON.stringify(r.headers, null, 2));
      if (r.postData) console.log(`  Body:`, r.postData);
      console.log();
    }
  } else {
    console.log('\n⚠ No /ai/chat requests captured in 10s window');
  }

  // Take final screenshot
  await page.screenshot({ path: 'scripts/debug-chat-result.png', fullPage: true });
  console.log('✓ Screenshot saved: scripts/debug-chat-result.png');

  // Disconnect (don't close — keep Edge open)
  console.log('\n◆ Disconnecting Playwright (Edge stays open)...');
  await browser.close();
  console.log('✓ Done');
}

main().catch((err) => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
