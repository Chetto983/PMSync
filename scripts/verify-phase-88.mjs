import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://localhost:3001';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];

  let page = context.pages().find(p => p.url().includes('/dashboard'));
  if (!page) {
    page = await context.newPage();
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(2000);

  // --- BUG-4: Refresh spin animation ---
  console.log('\n=== BUG-4: Refresh spin ===');
  // Find ALL buttons in widget headers (the small icon buttons top-right)
  const headerBtns = await page.locator('.MuiIconButton-root').all();
  console.log(`MuiIconButton buttons on page: ${headerBtns.length}`);

  // Click the first header refresh button and check for animation class/style
  if (headerBtns.length > 0) {
    // The refresh buttons are in the widget headers — click one
    for (let i = 0; i < Math.min(headerBtns.length, 5); i++) {
      const ariaLabel = await headerBtns[i].getAttribute('aria-label').catch(() => '');
      const title = await headerBtns[i].getAttribute('title').catch(() => '');
      console.log(`  Button ${i}: aria-label="${ariaLabel}", title="${title}"`);
    }

    // Click the first one (likely a refresh)
    await headerBtns[0].click();
    await page.waitForTimeout(300);

    // Check if any SVG has a spin animation applied
    const spinning = await page.evaluate(() => {
      const svgs = document.querySelectorAll('.MuiIconButton-root svg');
      return Array.from(svgs).map(s => {
        const style = getComputedStyle(s);
        return {
          animation: style.animation || style.animationName || 'none',
          hasKeyframes: style.animation?.includes('spin') || false,
        };
      }).filter(s => s.animation !== 'none').slice(0, 3);
    });
    console.log(`Spinning SVGs: ${JSON.stringify(spinning)}`);
    await page.screenshot({ path: 'scripts/verify-88-spin.png' });
  }

  // --- BUG-1: Follow-up snooze ---
  console.log('\n=== BUG-1: Follow-up snooze ===');
  // Scroll to Follow-up widget
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  // Find follow-up items and hover each to reveal actions
  const followUpItems = await page.locator('text="Follow-up"').locator('xpath=ancestor::*[contains(@class, "MuiPaper") or contains(@class, "MuiCard")]').first();
  if (await followUpItems.isVisible().catch(() => false)) {
    // Get the list items within the follow-up widget
    const items = await followUpItems.locator('.MuiListItem-root, .MuiListItemButton-root, [role="listitem"]').all();
    console.log(`Follow-up list items: ${items.length}`);

    if (items.length > 0) {
      // Hover the first item
      await items[0].hover();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'scripts/verify-88-snooze-hover.png' });
      console.log('Screenshot: Hover on follow-up item → scripts/verify-88-snooze-hover.png');

      // Check for any action buttons that appeared on hover
      const actionBtns = await items[0].locator('button, [role="button"]').all();
      for (const btn of actionBtns) {
        const label = await btn.getAttribute('aria-label').catch(() => '');
        const text = await btn.textContent().catch(() => '');
        console.log(`  Action button: aria="${label}" text="${text.trim().substring(0, 30)}"`);
      }
    }

    // Also check for a snooze menu or icon anywhere in the widget
    const allBtnsInWidget = await followUpItems.locator('button').all();
    console.log(`Total buttons in Follow-up widget: ${allBtnsInWidget.length}`);
    for (const btn of allBtnsInWidget.slice(0, 8)) {
      const label = await btn.getAttribute('aria-label').catch(() => '');
      const text = await btn.textContent().catch(() => '');
      const visible = await btn.isVisible().catch(() => false);
      if (visible) {
        console.log(`  Visible btn: aria="${label}" text="${text.trim().substring(0, 40)}"`);
      }
    }
  }

  // --- BUG-6: Insight card navigation ---
  console.log('\n=== BUG-6: Insight card navigation ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // The insight cards with arrows — check if they have onClick handlers
  const insightCard = page.locator(':text("in ritardo")').first();
  if (await insightCard.isVisible().catch(() => false)) {
    // Find the clickable parent
    const cardContainer = insightCard.locator('xpath=ancestor::*[contains(@class, "MuiCard") or contains(@class, "MuiPaper") or contains(@class, "MuiButtonBase")]').first();
    const cursor = await cardContainer.evaluate(el => getComputedStyle(el).cursor).catch(() => 'unknown');
    console.log(`Insight card cursor: ${cursor}`);

    // Check if it has onClick by looking for pointer cursor or role
    const hasClick = cursor === 'pointer';
    console.log(`Insight card appears clickable: ${hasClick}`);

    if (hasClick) {
      // Intercept navigation
      const currentUrl = page.url();
      const [response] = await Promise.all([
        page.waitForNavigation({ timeout: 3000 }).catch(() => null),
        cardContainer.click(),
      ]);
      const newUrl = page.url();
      console.log(`Navigation: ${currentUrl} → ${newUrl}`);

      if (newUrl !== currentUrl) {
        console.log('✓ Card navigated — going back');
        await page.goBack();
        await page.waitForTimeout(1000);
      } else {
        console.log('Card clicked but no navigation happened');
      }
    }
  }

  // --- BUG-2: Widget persistence — toggle a widget off, reload, check ---
  console.log('\n=== BUG-2: Widget visibility persistence ===');
  // Open Personalizza
  const customizeBtn = page.locator(':text("Personalizza")');
  if (await customizeBtn.isVisible().catch(() => false)) {
    await customizeBtn.click();
    await page.waitForTimeout(1000);

    // Find toggle switches
    const switches = await page.locator('.MuiSwitch-root').all();
    console.log(`Toggle switches: ${switches.length}`);

    // Get labels for each switch
    for (let i = 0; i < Math.min(switches.length, 10); i++) {
      const label = await switches[i].locator('xpath=ancestor::*[contains(@class,"MuiFormControlLabel")]').textContent().catch(() => `switch-${i}`);
      const checked = await switches[i].locator('input').isChecked().catch(() => 'unknown');
      console.log(`  ${label.trim()}: ${checked ? 'ON' : 'OFF'}`);
    }

    // Close panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  console.log('\n=== All checks done ===');
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
