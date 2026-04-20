// READ-ONLY. Looking for any surviving trace of "Andrea" tenant/user.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
console.log(`[target] ${new URL(connectionString).host}`);

const adapter = new PrismaPg({ connectionString, max: 3 });
const prisma = new PrismaClient({ adapter, log: ['warn', 'error'] });

try {
  const currentTenantIds = (
    await prisma.tenant.findMany({ select: { id: true } })
  ).map((t) => t.id);
  console.log(`known tenants: ${currentTenantIds.length} -> ${currentTenantIds.join(', ')}`);

  // Users table — any andrea by email/name, including soft-deleted
  const andreaUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: 'andrea', mode: 'insensitive' } },
        { name: { contains: 'andrea', mode: 'insensitive' } },
        { firstName: { contains: 'andrea', mode: 'insensitive' } },
        { lastName: { contains: 'andrea', mode: 'insensitive' } },
      ],
    },
    select: { id: true, email: true, name: true, tenantId: true, createdAt: true, deletedAt: true },
  });
  console.log(`\nusers matching "andrea": ${andreaUsers.length}`);
  for (const u of andreaUsers) console.log('  ', u);

  // Soft-deleted tenants (deletedAt != null)
  const softDeleted = await prisma.tenant.findMany({
    where: { deletedAt: { not: null } },
  });
  console.log(`\nsoft-deleted tenants: ${softDeleted.length}`);
  for (const t of softDeleted) console.log('  ', t);

  // Orphans: rows pointing at a tenantId that no longer exists
  const emailOrphans = await prisma.email.groupBy({
    by: ['tenantId'],
    _count: true,
  });
  const orphanEmailTenants = emailOrphans.filter((g) => !currentTenantIds.includes(g.tenantId));
  console.log(`\norphan emails by tenantId: ${orphanEmailTenants.length}`);
  for (const o of orphanEmailTenants) console.log('  ', o);

  // Contacts from "andrea"
  const contactMatches = await prisma.contact.findMany({
    where: {
      OR: [
        { primaryEmail: { contains: 'andrea', mode: 'insensitive' } },
        { displayName: { contains: 'andrea', mode: 'insensitive' } },
        { firstName: { contains: 'andrea', mode: 'insensitive' } },
      ],
    },
    select: { id: true, primaryEmail: true, displayName: true, tenantId: true },
    take: 20,
  });
  console.log(`\ncontacts matching "andrea": ${contactMatches.length}`);
  for (const c of contactMatches) console.log('  ', c);

  // Better-auth sessions for anything non-current-tenant? Session has userId only, skip.

  // Tables to scan for orphan tenantIds
  const counts = {};
  const models = [
    'email',
    'emailLabel',
    'auditLog',
    'agentLearningProfile',
    'agentActionFeedback',
    'contact',
    'calendarEvent',
    'emailAnalysis',
    'aiRunLedger',
  ];
  for (const m of models) {
    try {
      const grouped = await prisma[m].groupBy({
        by: ['tenantId'],
        _count: true,
      });
      const orphans = grouped.filter((g) => !currentTenantIds.includes(g.tenantId));
      if (orphans.length) counts[m] = orphans;
    } catch (e) {
      counts[m] = `ERR: ${e.message.split('\n')[0]}`;
    }
  }
  console.log(`\norphan tenantIds per table:`);
  console.log(JSON.stringify(counts, null, 2));
} finally {
  await prisma.$disconnect();
}
