import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://localhost:3001';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];

  let page = context.pages().find(p => p.url().includes('localhost:3001'));
  if (!page) {
    page = await context.newPage();
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  }

  // Navigate fresh to dashboard to clear any open drawers
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // --- BUG-4: Refresh spin animation ---
  console.log('\n=== BUG-4: Refresh spin ===');
  // The refresh icons are in widget headers — find them by looking at IconButtons INSIDE paper/card widgets
  const widgetRefreshBtns = await page.locator('.MuiPaper-root .MuiIconButton-root, .MuiCard-root .MuiIconButton-root').all();
  console.log(`Widget-scoped IconButtons: ${widgetRefreshBtns.length}`);
  for (let i = 0; i < Math.min(widgetRefreshBtns.length, 6); i++) {
    const label = await widgetRefreshBtns[i].getAttribute('aria-label').catch(() => '');
    console.log(`  ${i}: aria-label="${label}"`);
  }

  // Click a refresh button that's inside a widget
  if (widgetRefreshBtns.length > 0) {
    const btn = widgetRefreshBtns[0];
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForTimeout(500);

    // Check for spin animation on the SVG inside
    const animState = await btn.evaluate(el => {
      const svg = el.querySelector('svg');
      if (!svg) return { found: false };
      const style = getComputedStyle(svg);
      return {
        found: true,
        animation: style.animation,
        animationName: style.animationName,
        transform: style.transform,
      };
    });
    console.log(`Refresh SVG animation state: ${JSON.stringify(animState)}`);
    await page.screenshot({ path: 'scripts/verify-88-spin.png' });
    console.log('Screenshot: After refresh click → scripts/verify-88-spin.png');
  }

  // --- BUG-1: Follow-up snooze ---
  console.log('\n=== BUG-1: Follow-up snooze ===');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'scripts/verify-88-followup-area.png', fullPage: false });

  // Find the Follow-up widget container
  const followUpWidget = page.locator('text="Follow-up"').locator('xpath=ancestor::*[contains(@class, "MuiPaper")]').first();
  if (await followUpWidget.isVisible().catch(() => false)) {
    // Get all interactive elements inside
    const btns = await followUpWidget.locator('button, [role="button"], .MuiIconButton-root').all();
    console.log(`Buttons in Follow-up widget: ${btns.length}`);
    for (const btn of btns) {
      const label = await btn.getAttribute('aria-label').catch(() => '');
      const text = (await btn.textContent().catch(() => '')).trim().substring(0, 40);
      const visible = await btn.isVisible().catch(() => false);
      if (visible) console.log(`  btn: aria="${label}" text="${text}"`);
    }

    // Check individual follow-up items for hover actions
    const listItems = await followUpWidget.locator('.MuiListItemButton-root, .MuiListItem-root').all();
    console.log(`List items in Follow-up: ${listItems.length}`);
    if (listItems.length > 0) {
      await listItems[0].hover();
      await page.waitForTimeout(500);

      // Check for newly visible action buttons
      const hoverBtns = await listItems[0].locator('button, .MuiIconButton-root').all();
      console.log(`Buttons after hover on first item: ${hoverBtns.length}`);
      for (const btn of hoverBtns) {
        const label = await btn.getAttribute('aria-label').catch(() => '');
        console.log(`  hover btn: aria="${label}"`);
      }
      await page.screenshot({ path: 'scripts/verify-88-snooze-hover.png' });
      console.log('Screenshot: Hover on follow-up item → scripts/verify-88-snooze-hover.png');
    }
  }

  // --- BUG-6: Insight card navigation ---
  console.log('\n=== BUG-6: Insight card click ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const insightCards = await page.locator(':text("in ritardo")').locator('xpath=ancestor::*[contains(@class, "MuiCard") or contains(@class, "MuiPaper") or contains(@class, "MuiButtonBase")]').all();
  console.log(`Insight card ancestors: ${insightCards.length}`);
  for (const card of insightCards) {
    const tag = await card.evaluate(el => el.tagName);
    const cursor = await card.evaluate(el => getComputedStyle(el).cursor);
    const cls = await card.evaluate(el => el.className.substring(0, 80));
    console.log(`  ${tag} cursor=${cursor} class="${cls}"`);
  }

  // Try clicking the arrow (→) icon next to "in ritardo"
  const arrowIcon = page.locator(':text("in ritardo")').locator('..').locator('svg, [data-testid*="Arrow"]').first();
  if (await arrowIcon.isVisible().catch(() => false)) {
    const currentUrl = page.url();
    await arrowIcon.click();
    await page.waitForTimeout(2000);
    const newUrl = page.url();
    console.log(`Navigation: ${currentUrl === newUrl ? 'SAME PAGE' : newUrl}`);
    if (newUrl !== currentUrl) {
      await page.goBack();
      await page.waitForTimeout(1000);
    }
  } else {
    // Try clicking the card text itself
    const card = page.locator(':text("in ritardo")').first();
    const clickParent = card.locator('xpath=ancestor::*[@role="button" or self::a or @tabindex]').first();
    if (await clickParent.isVisible().catch(() => false)) {
      const currentUrl = page.url();
      await clickParent.click();
      await page.waitForTimeout(2000);
      const newUrl = page.url();
      console.log(`Card parent click navigation: ${currentUrl === newUrl ? 'SAME PAGE' : newUrl}`);
      if (newUrl !== currentUrl) {
        await page.goBack();
        await page.waitForTimeout(1000);
      }
    } else {
      console.log('No clickable ancestor found for insight card');
    }
  }

  // --- BUG-2: Widget visibility persistence ---
  console.log('\n=== BUG-2: Widget visibility (Personalizza) ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const customizeBtn = page.locator('button:has-text("Personalizza")');
  await customizeBtn.click();
  await page.waitForTimeout(1000);

  const switches = await page.locator('.MuiSwitch-root').all();
  console.log(`Toggle switches: ${switches.length}`);
  for (let i = 0; i < Math.min(switches.length, 12); i++) {
    const label = await switches[i].locator('xpath=ancestor::*[contains(@class,"MuiFormControlLabel") or contains(@class, "MuiStack")]').first().textContent().catch(() => `switch-${i}`);
    const checked = await switches[i].locator('input').isChecked().catch(() => 'unknown');
    console.log(`  ${label.trim().substring(0, 35)}: ${checked ? 'ON' : 'OFF'}`);
  }

  await page.screenshot({ path: 'scripts/verify-88-personalizza.png' });

  // Close drawer
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  console.log('\n=== All checks done ===');
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
