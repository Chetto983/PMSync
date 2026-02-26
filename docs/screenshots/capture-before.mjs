/**
 * Phase 22 Bug Audit: Before-state screenshot capture
 * Captures screenshots at 3 breakpoints for all major pages.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3001';
const OUTPUT_DIR = join(import.meta.dirname, 'before');

const BREAKPOINTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-375', width: 375, height: 812 },
];

const PAGES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'email-list', path: '/dashboard/email' },
  { name: 'contacts', path: '/dashboard/contacts' },
  { name: 'calendar', path: '/dashboard/calendar' },
  { name: 'settings', path: '/dashboard/settings' },
  { name: 'ai-chat', path: '/dashboard/ai' },
  { name: 'login', path: '/auth/login' },
];

mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

let count = 0;
for (const page of PAGES) {
  for (const bp of BREAKPOINTS) {
    const pageName = `${page.name}-${bp.name}.png`;
    const pageObj = await context.newPage();
    await pageObj.setViewportSize({ width: bp.width, height: bp.height });
    try {
      await pageObj.goto(`${BASE_URL}${page.path}`, { timeout: 15000, waitUntil: 'networkidle' });
      await pageObj.waitForTimeout(1000);
    } catch {
      // Page may redirect to login or fail -- still capture what's shown
    }
    await pageObj.screenshot({ path: join(OUTPUT_DIR, pageName), fullPage: false });
    await pageObj.close();
    count++;
    console.log(`[${count}] Captured: ${pageName}`);
  }
}

await browser.close();
console.log(`\nDone: ${count} screenshots captured in ${OUTPUT_DIR}`);
