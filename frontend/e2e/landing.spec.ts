/**
 * Landing Page E2E Tests
 *
 * Verifies all 6 dynamically-imported sections render correctly:
 * Hero, Features, Modules, Testimonial, CTA, Footer.
 * Tests run without auth state to see the public landing page.
 */

import { test, expect } from '@playwright/test';

// Landing page is public; bypass auth to avoid redirect to /dashboard
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Landing page', () => {
  test('renders all 6 sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Hero section -- has the main H1 heading
    const heroHeading = page.getByRole('heading', { level: 1 });
    await expect(heroHeading).toBeVisible({ timeout: 15_000 });

    // Features section -- has id="features" anchor or "features" text
    const featuresSection = page.locator('#features, [id="features"]');
    const featuresHeading = page.getByText(/features/i);
    const hasFeatures =
      (await featuresSection.isVisible({ timeout: 10_000 }).catch(() => false)) ||
      (await featuresHeading.first().isVisible({ timeout: 5_000 }).catch(() => false));
    expect(hasFeatures).toBe(true);

    // Modules section -- dynamically imported Modules component
    const modulesText = page.getByText(/module|everything you need/i);
    await expect(modulesText.first()).toBeVisible({ timeout: 10_000 });

    // Testimonial section
    const testimonialText = page.getByText(/testimonial|what.*say|trusted|love/i);
    await expect(testimonialText.first()).toBeVisible({ timeout: 10_000 });

    // CTA section -- contains a link to /auth/register
    const ctaLink = page.locator('a[href="/auth/register"]');
    await expect(ctaLink.first()).toBeVisible({ timeout: 10_000 });

    // Footer section
    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: 10_000 });
  });

  test('footer contains privacy and terms links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Footer should be visible
    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: 15_000 });

    // Privacy link
    const privacyLink = footer.locator('a[href*="privacy"]');
    await expect(privacyLink.first()).toBeVisible({ timeout: 5_000 });

    // Terms link
    const termsLink = footer.locator('a[href*="terms"]');
    await expect(termsLink.first()).toBeVisible({ timeout: 5_000 });
  });
});
