/**
 * Test database cleanup utility.
 * Truncates all test tables with CASCADE to leave the DB clean between suites.
 */
import { getTestPrismaClient } from './prisma-test-client';

/**
 * Truncates all tables that may contain test data.
 * Uses a single TRUNCATE ... CASCADE statement for speed.
 * Table order does not matter with CASCADE.
 */
export async function cleanupTestData(): Promise<void> {
  const prisma = getTestPrismaClient();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "sessions",
      "member",
      "accounts",
      "invitation",
      "user_preferences",
      "dashboard_preferences",
      "mfa_secrets",
      "mfa_backup_codes",
      "trusted_devices",
      "webauthn_credentials",
      "two_factor",
      "passkeys",
      "verifications",
      "password_reset_tokens",
      "users",
      "user_labels",
      "tenants"
    CASCADE
  `);
}
