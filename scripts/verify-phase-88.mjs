import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://localhost:3001';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];

  // Find an already-open dashboard page (don't navigate — preserves session)
  let page = context.pages().find(p => p.url().includes('/dashboard') && !p.url().includes('accounts.google'));
  if (!page) {
    // Try any localhost page
    page = context.pages().find(p => p.url().includes('localhost:3001'));
  }
  if (!page) {
    console.log('No dashboard page found. Open pages:');
    for (const p of context.pages()) console.log(`  ${p.url()}`);
    console.log('\nPlease navigate to http://localhost:3001/dashboard in Edge and re-run.');
    await browser.close();
    return;
  }

  // If not on dashboard, navigate there
  if (!page.url().includes('/dashboard')) {
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  }

  await page.waitForTimeout(2000);

  // Verify we're on the dashboard (not login)
  const pageText = await page.textContent('body');
  if (pageText.includes('Accedi') || pageText.includes('Password')) {
    console.log('ERROR: On login page, not dashboard. Please log in first.');
    await page.screenshot({ path: 'scripts/verify-88-login.png' });
    await browser.close();
    return;
  }
  console.log('✓ On dashboard page');

  // --- BUG-4: Refresh spin animation ---
  console.log('\n=== BUG-4: Refresh spin ===');
  // The refresh icons in widget headers — look for all icon buttons INSIDE widget containers
  // Widget headers have a title + an icon button area
  const allIconBtns = await page.evaluate(() => {
    const btns = document.querySelectorAll('button.MuiIconButton-root');
    return Array.from(btns).map(b => ({
      ariaLabel: b.getAttribute('aria-label') || '',
      parentClass: b.parentElement?.className?.substring(0, 60) || '',
      svgTestId: b.querySelector('svg')?.getAttribute('data-testid') || '',
      visible: b.offsetParent !== null,
    }));
  });
  console.log(`All MuiIconButtons (${allIconBtns.length}):`);
  allIconBtns.filter(b => b.visible).forEach((b, i) => {
    console.log(`  ${i}: aria="${b.ariaLabel}" svg="${b.svgTestId}" parent="${b.parentClass}"`);
  });

  // --- BUG-1: Follow-up snooze ---
  console.log('\n=== BUG-1: Follow-up snooze ===');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'scripts/verify-88-bottom.png', fullPage: false });
  console.log('Screenshot: Bottom → scripts/verify-88-bottom.png');

  // Dump the Follow-up widget HTML structure
  const followUpHtml = await page.evaluate(() => {
    const headers = document.querySelectorAll('h6, h5, h4, [class*="MuiTypography"]');
    for (const h of headers) {
      if (h.textContent?.includes('Follow-up')) {
        const widget = h.closest('[class*="MuiPaper"], [class*="MuiCard"]');
        if (widget) {
          // Get all buttons and their labels
          const btns = widget.querySelectorAll('button');
          return Array.from(btns).map(b => ({
            text: b.textContent?.trim().substring(0, 50),
            ariaLabel: b.getAttribute('aria-label'),
            className: b.className.substring(0, 60),
            visible: b.offsetParent !== null,
          }));
        }
      }
    }
    return [];
  });
  console.log(`Follow-up widget buttons: ${followUpHtml.length}`);
  followUpHtml.filter(b => b.visible).forEach(b => {
    console.log(`  text="${b.text}" aria="${b.ariaLabel}"`);
  });

  // Check for snooze-related elements anywhere
  const snoozeEls = await page.evaluate(() => {
    const all = document.querySelectorAll('[aria-label*="nooze"], [aria-label*="Snooze"], [data-testid*="nooze"], [title*="nooze"]');
    return Array.from(all).map(e => ({
      tag: e.tagName, ariaLabel: e.getAttribute('aria-label'), visible: e.offsetParent !== null,
    }));
  });
  console.log(`Snooze elements on page: ${snoozeEls.length}`);
  snoozeEls.forEach(e => console.log(`  ${e.tag} aria="${e.ariaLabel}" visible=${e.visible}`));

  // --- BUG-6: Insight card navigation ---
  console.log('\n=== BUG-6: Insight card click ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Dump insight cards structure
  const insightStructure = await page.evaluate(() => {
    const items = [];
    // Find "in ritardo" text
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.includes('in ritardo')) {
        let el = walker.currentNode.parentElement;
        // Walk up to find clickable ancestor
        const ancestry = [];
        while (el && el !== document.body) {
          ancestry.push({
            tag: el.tagName,
            role: el.getAttribute('role'),
            cursor: getComputedStyle(el).cursor,
            onClick: typeof el.onclick === 'function',
            className: el.className?.substring?.(0, 40) || '',
          });
          if (ancestry.length > 8) break;
          el = el.parentElement;
        }
        items.push(ancestry);
        break;
      }
    }
    return items;
  });
  console.log('Insight card "in ritardo" ancestry:');
  if (insightStructure[0]) {
    insightStructure[0].forEach((a, i) => {
      console.log(`  ${i}: <${a.tag}> role="${a.role}" cursor=${a.cursor} class="${a.className}"`);
    });
  }

  // --- BUG-2: Widget visibility persistence ---
  console.log('\n=== BUG-2: Personalizza toggles ===');
  const customizeBtn = page.locator('button:has-text("Personalizza")');
  if (await customizeBtn.isVisible().catch(() => false)) {
    await customizeBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'scripts/verify-88-personalizza.png' });
    console.log('Screenshot: Personalizza → scripts/verify-88-personalizza.png');

    const toggleInfo = await page.evaluate(() => {
      const switches = document.querySelectorAll('.MuiSwitch-root');
      return Array.from(switches).map(s => {
        const input = s.querySelector('input');
        const label = s.closest('.MuiFormControlLabel-root, .MuiStack-root, li, [role="listitem"]');
        return {
          label: label?.textContent?.trim().substring(0, 30) || 'unknown',
          checked: input?.checked || false,
        };
      });
    });
    console.log(`Toggles (${toggleInfo.length}):`);
    toggleInfo.forEach(t => console.log(`  ${t.checked ? '✓' : '○'} ${t.label}`));

    await page.keyboard.press('Escape');
  }

  // --- BUG-7: Reminder error feedback ---
  console.log('\n=== BUG-7: Reminder dialog ===');
  // Navigate to Promemoria page to test reminder dialog
  const reminderNav = page.locator('text="Promemoria"').first();
  if (await reminderNav.isVisible().catch(() => false)) {
    await reminderNav.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'scripts/verify-88-reminders.png' });
    console.log('Screenshot: Reminders page → scripts/verify-88-reminders.png');
  }

  console.log('\n=== All checks done ===');
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
