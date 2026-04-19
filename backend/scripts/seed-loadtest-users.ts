/**
 * SCALE-04 — Seed N synthetic users into the loadtest-tenant via better-auth.
 *
 * IMPORTANT: Uses `auth.api.signUpEmail` (NOT raw prisma.user.create) so bcrypt
 * password hashing runs and the `account` row is written. Without this, every
 * Artillery /sign-in/email request returns 401.
 *
 * After signUp, directly sets `emailVerified: true` to bypass
 * `requireEmailVerification: true` (better-auth.instance.ts:402) — synthetic
 * test users are not real humans; verification flow is irrelevant.
 *
 * Includes a smoke-login validation step: after seeding the first chunk (10 users),
 * the script POSTs to /api/auth/sign-in/email for those 10 users against
 * LOADTEST_TARGET and aborts the bulk seed if ANY return non-200.
 *
 * Run via: npm run load-test:seed
 * Smoke-login only (no seed): npm run load-test:smoke-login
 *
 * Env vars required (see .env.loadtest.example):
 *   LOADTEST_TENANT_ID    (default: loadtest-tenant)
 *   LOADTEST_PASSWORD     (mandatory)
 *   LOADTEST_TARGET       (mandatory; for smoke-login HTTP call)
 *   LOADTEST_USER_COUNT   (default: 1000)
 *   DATABASE_URL          (mandatory; better-auth instance bootstrap)
 *   BETTER_AUTH_SECRET    (mandatory; better-auth instance bootstrap)
 *   FRONTEND_URL          (mandatory; better-auth instance bootstrap)
 *
 * RESEARCH.md §Open Question 6 RESOLVED:
 *   - Chunks of 10 (NOT 50) — bcrypt CPU saturation
 *   - Target: < 3 min for 1000 users
 *   - Smoke-login validation acceptance criterion
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { createBetterAuthInstance } from '../src/common/auth/better-auth.instance';
import { EmailService } from '../src/modules/email/services/email.service';

const TENANT_ID = process.env.LOADTEST_TENANT_ID || 'loadtest-tenant';
const PASSWORD = process.env.LOADTEST_PASSWORD;
const USER_COUNT = Number(process.env.LOADTEST_USER_COUNT || 1000);
const LOADTEST_TARGET = process.env.LOADTEST_TARGET;
const CHUNK_SIZE = 10; // RESEARCH §Open Q#6 RESOLVED — bcrypt saturates CPU; 10 not 50
const SMOKE_LOGIN_USER_COUNT = 10;

const SMOKE_LOGIN_ONLY = process.argv.includes('--smoke-login-only');

const prisma = createPrismaClient();

async function smokeLoginValidation(emails: string[]): Promise<void> {
  if (!LOADTEST_TARGET) {
    throw new Error('LOADTEST_TARGET must be set for smoke-login validation');
  }
  if (!PASSWORD) {
    throw new Error('LOADTEST_PASSWORD must be set for smoke-login validation');
  }
  const url = `${LOADTEST_TARGET.replace(/\/$/, '')}/api/auth/sign-in/email`;
  console.log(`[smoke-login] validating ${emails.length} users against ${url}`);

  const results = await Promise.all(
    emails.map(async (email) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: PASSWORD }),
        });
        return { email, status: res.status, ok: res.status === 200 };
      } catch (err) {
        return { email, status: 0, ok: false, error: String(err) };
      }
    }),
  );

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(
      `[smoke-login] ${r.email} -> HTTP ${r.status}${r.ok ? ' OK' : ' FAIL'}`,
    );
  }

  if (failed.length > 0) {
    console.error(
      `[smoke-login] FATAL: ${failed.length}/${emails.length} sign-ins failed`,
    );
    process.exit(1);
  }
  console.log(
    `[smoke-login] PASS — all ${emails.length} sign-ins returned HTTP 200`,
  );
}

async function main(): Promise<void> {
  if (!PASSWORD) {
    console.error('FATAL: LOADTEST_PASSWORD must be set');
    process.exit(1);
  }
  if (USER_COUNT < 1 || USER_COUNT > 10_000) {
    console.error(`FATAL: LOADTEST_USER_COUNT out of range: ${USER_COUNT}`);
    process.exit(1);
  }

  // ---------- SMOKE-LOGIN-ONLY MODE ----------
  if (SMOKE_LOGIN_ONLY) {
    const emails = Array.from(
      { length: SMOKE_LOGIN_USER_COUNT },
      (_, i) => `loadtest+${i}@pmsync.local`,
    );
    await smokeLoginValidation(emails);
    await prisma.$disconnect();
    return;
  }

  console.log(`[seed] target tenant: ${TENANT_ID}`);
  console.log(`[seed] target user count: ${USER_COUNT}`);

  // Bootstrap better-auth instance (factory needs prisma + emailService).
  // EmailService has a no-arg constructor (verified at email.service.ts:11).
  // sendVerificationEmail will fail silently if SendGrid is not configured —
  // tolerable because we set emailVerified=true directly below.
  const emailService = new EmailService();
  const auth = createBetterAuthInstance(prisma, emailService);

  // Ensure tenant exists (multi-tenant rule). `slug` is @unique + required by schema.
  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: 'Load Test Tenant',
      slug: TENANT_ID,
    },
  });
  console.log(`[seed] tenant ready: ${tenant.id}`);

  const emails = Array.from(
    { length: USER_COUNT },
    (_, i) => `loadtest+${i}@pmsync.local`,
  );
  let createdCount = 0;
  let skippedCount = 0;
  let smokeLoginRan = false;

  for (let start = 0; start < emails.length; start += CHUNK_SIZE) {
    const chunk = emails.slice(start, start + CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map(async (email) => {
        // Idempotent: skip if user already exists for this tenant.
        const existing = await prisma.user.findFirst({
          where: { email, tenantId: TENANT_ID },
          select: { id: true },
        });
        if (existing) {
          // Ensure idempotent runs also have emailVerified=true (in case a
          // previous run crashed between signUp and the verification update).
          await prisma.user.update({
            where: { id: existing.id },
            data: { emailVerified: true },
          });
          return { email, status: 'skipped' as const };
        }

        // Real signUp — runs bcrypt and writes user + account rows.
        // No headers / cookies needed for server-side signUpEmail.
        await auth.api.signUpEmail({
          body: {
            email,
            password: PASSWORD!,
            name: `Load Test User ${email}`,
          },
        });

        // Look up the created user to set emailVerified + tenantId.
        // (better-auth doesn't expose tenantId in signUpEmail body; we set it after.)
        const createdUser = await prisma.user.findFirst({
          where: { email },
          select: { id: true },
        });
        if (!createdUser) {
          throw new Error(`User row missing after signUpEmail for ${email}`);
        }
        await prisma.user.update({
          where: { id: createdUser.id },
          data: {
            emailVerified: true,
            tenantId: TENANT_ID,
          },
        });
        return { email, status: 'created' as const };
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.status === 'created') createdCount++;
        else skippedCount++;
      } else {
        console.error(`[seed] error:`, r.reason);
      }
    }
    const done = Math.min(start + CHUNK_SIZE, emails.length);
    console.log(
      `[seed] progress: ${done}/${emails.length} (created=${createdCount} skipped=${skippedCount})`,
    );

    // After the FIRST chunk completes, run smoke-login validation BEFORE
    // continuing the bulk seed. If smoke-login fails, abort early so the
    // operator doesn't wait 3 minutes only to discover seeding is broken.
    if (!smokeLoginRan && done >= SMOKE_LOGIN_USER_COUNT) {
      const smokeEmails = emails.slice(0, SMOKE_LOGIN_USER_COUNT);
      await smokeLoginValidation(smokeEmails);
      smokeLoginRan = true;
    }
  }

  console.log(`[seed] done — created=${createdCount} skipped=${skippedCount}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[seed] fatal:', err);
  process.exit(1);
});
