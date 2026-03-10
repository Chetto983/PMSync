/**
 * Authentication Setup Project
 *
 * Creates reusable storageState for other tests.
 * Authenticates by inserting a real session row directly into the test DB via Prisma.
 */

import { test as setup } from '@playwright/test';
import { randomBytes } from 'crypto';
import { createPrismaClient } from '../../backend/src/prisma/prisma-client.factory';

const authFile = 'playwright/.auth/user.json';

/** Seed user email — must exist in the test DB (created by seed or global-setup). */
const TEST_USER_EMAIL = 'test@pmsync.local';

setup('authenticate', async ({ page }) => {
  const prisma = createPrismaClient();

  try {
    // Find or create the seed test user
    let user = await prisma.user.findUnique({
      where: { email: TEST_USER_EMAIL },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: TEST_USER_EMAIL,
          name: 'Test User',
          emailVerified: true,
        },
      });
    }

    // Create a real session token
    const token = randomBytes(32).toString('hex');
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });

    // Set the session cookie via Playwright context
    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false, // localhost in test
      },
    ]);

    // Pre-accept cookie consent to avoid modal blocking UI
    await page.addInitScript(() => {
      localStorage.setItem(
        'pmsync:cookie-consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });

    // Navigate to trigger session check against real backend
    await page.goto('/');

    // Save auth state for other tests
    await page.context().storageState({ path: authFile });
  } finally {
    await prisma.$disconnect();
  }
});
