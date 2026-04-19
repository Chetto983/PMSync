/**
 * SCALE-04 — Delete all users + tenant row for loadtest-tenant.
 * Run via: npm run load-test:cleanup
 *
 * Pitfall 5 mitigation: dashboards must not show loadtest users after a run.
 * ALWAYS run this after load-test:1000 (chain with `&&` in CI).
 *
 * Cleanup uses raw Prisma deleteMany — no need to invoke better-auth here
 * since delete doesn't require password verification. Cascade rules in the
 * schema handle dependent rows (sessions, accounts, etc.) but we delete
 * them explicitly first as belt-and-suspenders.
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();
const TENANT_ID = process.env.LOADTEST_TENANT_ID || 'loadtest-tenant';

async function main(): Promise<void> {
  console.log(`[cleanup] target tenant: ${TENANT_ID}`);

  // Safety: refuse to delete if tenant doesn't match the expected loadtest pattern.
  // Prevents accidental production deletion if env var is misconfigured.
  if (!TENANT_ID.startsWith('loadtest-')) {
    console.error(
      `FATAL: LOADTEST_TENANT_ID '${TENANT_ID}' does not start with 'loadtest-' — refusing to delete`,
    );
    process.exit(1);
  }

  // Delete sessions and accounts first (FK constraint chain).
  // Both have onDelete: Cascade on the user relation so this is technically
  // redundant, but explicit deletion makes the cleanup observable.
  const sessionDel = await prisma.session
    .deleteMany({
      where: { user: { tenantId: TENANT_ID } },
    })
    .catch(() => ({ count: 0 }));
  console.log(`[cleanup] deleted sessions: ${sessionDel.count}`);

  const accountDel = await prisma.account
    .deleteMany({
      where: { user: { tenantId: TENANT_ID } },
    })
    .catch(() => ({ count: 0 }));
  console.log(`[cleanup] deleted accounts: ${accountDel.count}`);

  const userDel = await prisma.user.deleteMany({
    where: { tenantId: TENANT_ID },
  });
  console.log(`[cleanup] deleted users: ${userDel.count}`);

  const tenantDel = await prisma.tenant.deleteMany({
    where: { id: TENANT_ID },
  });
  console.log(`[cleanup] deleted tenant rows: ${tenantDel.count}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[cleanup] fatal:', err);
  process.exit(1);
});
