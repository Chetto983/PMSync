import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const p = createPrismaClient();

  console.log('=== Users ===');
  const users = await p.$queryRawUnsafe<any[]>(
    `SELECT id, email, "tenantId", role, "onboardingComplete", image IS NOT NULL as has_image FROM "users"`,
  );
  console.table(users);

  console.log('\n=== Tenants ===');
  const tenants = await p.$queryRawUnsafe<any[]>(`SELECT id, name, slug FROM "tenants"`);
  console.table(tenants);

  console.log('\n=== Members ===');
  const members = await p.$queryRawUnsafe<any[]>(
    `SELECT id, "organizationId", "userId", role FROM "member"`,
  );
  console.table(members);

  console.log('\n=== Sessions ===');
  const sessions = await p.$queryRawUnsafe<any[]>(
    `SELECT id, "userId", "activeOrganizationId", "expiresAt" FROM "sessions"`,
  );
  console.table(sessions);

  console.log('\n=== Accounts ===');
  const accounts = await p.$queryRawUnsafe<any[]>(
    `SELECT id, "userId", "providerId", "accessToken" IS NOT NULL as has_access FROM "accounts"`,
  );
  console.table(accounts);

  await p.$disconnect();
}
main();
