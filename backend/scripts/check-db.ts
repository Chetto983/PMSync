import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function run() {
  const p = createPrismaClient();
  const tenants = await p.tenant.findMany();
  console.log('Tenants:', JSON.stringify(tenants, null, 2));
  const users = await p.user.findMany({ select: { id: true, email: true, tenantId: true, isMfaEnabled: true } });
  console.log('Users:', JSON.stringify(users, null, 2));
  const emailCount = await p.email.count();
  console.log('Email count:', emailCount);
  await p.$disconnect();
}
run();
