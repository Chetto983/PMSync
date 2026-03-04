import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import * as bcrypt from 'bcrypt';

const prisma = createPrismaClient();

async function fix() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'admin@pmsync.local' },
    update: {},
    create: {
      name: 'Admin Workspace',
      slug: 'admin@pmsync.local',
      description: 'Admin dev workspace',
      isActive: true,
    },
  });
  console.log('Tenant:', tenant.id, tenant.slug);

  const hash = await bcrypt.hash('TestPassword123!', 10);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@pmsync.local' } },
    update: { isMfaEnabled: false },
    create: {
      tenantId: tenant.id,
      email: 'admin@pmsync.local',
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      isMfaEnabled: false,
    },
  });
  console.log('User:', user.id, user.email, 'MFA:', user.isMfaEnabled);
  await prisma.$disconnect();
}
fix().catch(e => { console.error(e); process.exit(1); });
