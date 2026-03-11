import 'dotenv/config';
import { randomBytes, scryptSync } from 'crypto';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function hashBetterAuthPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });

  return `${salt}:${derivedKey.toString('hex')}`;
}

async function upsertCredentialAccount(params: {
  userId: string;
  email: string;
  password: string;
}) {
  const passwordHash = await hashBetterAuthPassword(params.password);
  const existingAccount = await prisma.account.findFirst({
    where: {
      userId: params.userId,
      providerId: 'credential',
    },
    select: { id: true },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: {
        accountId: params.email,
        password: passwordHash,
      },
    });
    return;
  }

  await prisma.account.create({
    data: {
      userId: params.userId,
      accountId: params.email,
      providerId: 'credential',
      password: passwordHash,
    },
  });
}

async function seedUser(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
  onboardingComplete?: boolean;
  memberRole?: string;
}) {
  const name = `${params.firstName} ${params.lastName}`;
  const onboardingComplete = params.onboardingComplete ?? false;
  const memberRole = params.memberRole ?? 'member';

  const user = await prisma.user.upsert({
    where: { email: params.email },
    update: {
      tenantId: params.tenantId,
      name,
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      isActive: true,
      emailVerified: true,
      twoFactorEnabled: false,
      onboardingComplete,
    },
    create: {
      tenantId: params.tenantId,
      email: params.email,
      name,
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      isActive: true,
      emailVerified: true,
      twoFactorEnabled: false,
      onboardingComplete,
    },
  });

  await prisma.member.upsert({
    where: {
      organizationId_userId: {
        organizationId: params.tenantId,
        userId: user.id,
      },
    },
    update: {
      role: memberRole,
    },
    create: {
      organizationId: params.tenantId,
      userId: user.id,
      role: memberRole,
    },
  });

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: { tenantId: params.tenantId },
    create: {
      tenantId: params.tenantId,
      userId: user.id,
      folderOrders: {},
      sidebarSmartFiltersExpanded: true,
      sidebarLabelsExpanded: true,
      theme: 'light',
      language: 'en',
      timezone: 'UTC',
      emailDensity: 'comfortable',
    },
  });

  await upsertCredentialAccount({
    userId: user.id,
    email: params.email,
    password: params.password,
  });

  return user;
}

async function main() {
  console.log('Seeding database with test data...');
  console.log('');

  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {
      name: 'Default Tenant',
      description: 'Default tenant for local development',
      isActive: true,
    },
    create: {
      name: 'Default Tenant',
      slug: 'default',
      description: 'Default tenant for local development',
      isActive: true,
    },
  });

  console.log(`Created default tenant: ${defaultTenant.name}`);

  const adminUser = await seedUser({
    email: 'admin@pmsync.local',
    password: 'TestPassword123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'super-admin',
    tenantId: defaultTenant.id,
    onboardingComplete: true,
    memberRole: 'admin',
  });

  console.log(`Created admin user: ${adminUser.email}`);

  const memberUser = await seedUser({
    email: 'member@pmsync.local',
    password: 'MemberPassword123!',
    firstName: 'Member',
    lastName: 'User',
    role: 'user',
    tenantId: defaultTenant.id,
    onboardingComplete: true,
    memberRole: 'member',
  });

  console.log(`Created member user: ${memberUser.email}`);

  const regularUser = await seedUser({
    email: 'test@pmsync.local',
    password: 'UserPassword123!',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    tenantId: defaultTenant.id,
    onboardingComplete: false,
    memberRole: 'member',
  });

  console.log(`Created test user: ${regularUser.email}`);
  console.log('');
  console.log('Database seeding completed successfully.');
  console.log('');
  console.log('Test accounts created:');
  console.log('  Admin account:  admin@pmsync.local / TestPassword123!');
  console.log('  Member account: member@pmsync.local / MemberPassword123!');
  console.log('  Test account:   test@pmsync.local / UserPassword123! (onboardingComplete: false — used by onboarding E2E spec)');
  console.log('');
  console.log('Notes:');
  console.log('  MFA is disabled in seed data unless configured manually.');
  console.log('  All accounts use Better Auth credential accounts.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Visit http://localhost:3001/auth/login');
  console.log('  2. Sign in with one of the seeded accounts');
  console.log('');
}

main()
  .catch((error) => {
    console.error('Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
