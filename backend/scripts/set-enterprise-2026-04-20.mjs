// MUTATING - upsert Subscription for current tenant to ENTERPRISE.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const host = new URL(connectionString).host;
console.log(`[target] ${host}`);

const adapter = new PrismaPg({ connectionString, max: 3 });
const prisma = new PrismaClient({ adapter, log: ['warn', 'error'] });

const TENANT_ID = 'cmo791sec000101pepteva3ab';

try {
  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    include: { subscription: true },
  });
  if (!tenant) throw new Error(`tenant ${TENANT_ID} not found`);

  console.log(
    `[pre ] tenant="${tenant.name}" existingSubscription=${tenant.subscription ? JSON.stringify({ plan: tenant.subscription.plan, status: tenant.subscription.status, maxUsers: tenant.subscription.maxUsers, emailLimit: tenant.subscription.monthlyEmailLimit, aiLimit: tenant.subscription.monthlyAICallLimit }) : 'none'}`,
  );

  const sub = await prisma.subscription.upsert({
    where: { tenantId: TENANT_ID },
    create: {
      tenantId: TENANT_ID,
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      monthlyEmailLimit: 999999,
      monthlyAICallLimit: 999999,
      maxUsers: 999,
    },
    update: {
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      monthlyEmailLimit: 999999,
      monthlyAICallLimit: 999999,
      maxUsers: 999,
    },
  });

  console.log(
    `[post] plan=${sub.plan} status=${sub.status} maxUsers=${sub.maxUsers} emailLimit=${sub.monthlyEmailLimit} aiLimit=${sub.monthlyAICallLimit}`,
  );
} finally {
  await prisma.$disconnect();
}
