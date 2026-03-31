import 'dotenv/config';
import { randomBytes, scryptSync } from 'crypto';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

function isProductionLikeSeedTarget(): boolean {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  const railwayEnv = (process.env.RAILWAY_ENVIRONMENT || '').toLowerCase();
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();

  return (
    nodeEnv === 'production' ||
    railwayEnv === 'production' ||
    vercelEnv === 'production'
  );
}

function assertSeedingAllowed(): void {
  const allowProductionSeed =
    (process.env.ALLOW_PRODUCTION_SEED || '').toLowerCase() === 'true';

  if (isProductionLikeSeedTarget() && !allowProductionSeed) {
    throw new Error(
      'Refusing to run prisma seed against a production-like environment. Set ALLOW_PRODUCTION_SEED=true only for an explicit, reviewed operation.',
    );
  }
}

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
      banned: false,
      banReason: null,
      banExpires: null,
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
  assertSeedingAllowed();

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

  // Seed default SLA policies
  const slaPolicies = [
    { priority: 'urgent', name: 'Urgent SLA', responseTimeMinutes: 30, resolutionTimeMinutes: 240, businessHoursOnly: false },
    { priority: 'high', name: 'High SLA', responseTimeMinutes: 60, resolutionTimeMinutes: 480, businessHoursOnly: true },
    { priority: 'medium', name: 'Medium SLA', responseTimeMinutes: 240, resolutionTimeMinutes: 1440, businessHoursOnly: true },
    { priority: 'low', name: 'Low SLA', responseTimeMinutes: 480, resolutionTimeMinutes: 2880, businessHoursOnly: true },
  ];

  for (const policy of slaPolicies) {
    await prisma.slaPolicy.upsert({
      where: {
        tenantId_priority: {
          tenantId: defaultTenant.id,
          priority: policy.priority,
        },
      },
      update: {
        name: policy.name,
        responseTimeMinutes: policy.responseTimeMinutes,
        resolutionTimeMinutes: policy.resolutionTimeMinutes,
        businessHoursOnly: policy.businessHoursOnly,
      },
      create: {
        tenantId: defaultTenant.id,
        ...policy,
      },
    });
  }

  console.log(`Created ${slaPolicies.length} default SLA policies`);

  // ---- Phase 3: Ticketing seed data ----

  // Sample tickets
  const tickets = [
    { subject: 'Cannot access dashboard', description: 'Getting 403 error when loading /dashboard. Browser: Chrome 120.', status: 'open', priority: 'high' },
    { subject: 'Invoice PDF not downloading', description: 'Clicking download on invoice #1234 returns blank page.', status: 'in_progress', priority: 'medium', assigneeId: adminUser.id },
    { subject: 'Password reset email not received', description: 'Customer waited 30 minutes, checked spam folder.', status: 'resolved', priority: 'medium', assigneeId: memberUser.id, resolvedAt: new Date('2026-03-28') },
    { subject: 'Mobile app crashes on startup', description: 'iOS 18, iPhone 15 Pro. Crash after splash screen.', status: 'closed', priority: 'urgent', assigneeId: adminUser.id, resolvedAt: new Date('2026-03-25'), closedAt: new Date('2026-03-26') },
    { subject: 'Feature request: dark mode', description: 'Would love a dark mode option in settings.', status: 'open', priority: 'low' },
  ];

  for (const t of tickets) {
    await prisma.ticket.create({
      data: {
        tenantId: defaultTenant.id,
        subject: t.subject,
        description: t.description,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assigneeId,
        resolvedAt: t.resolvedAt,
        closedAt: t.closedAt,
      },
    });
  }
  console.log(`Created ${tickets.length} sample tickets`);

  // KB Categories
  const gettingStarted = await prisma.kBCategory.create({
    data: {
      tenantId: defaultTenant.id,
      name: 'Getting Started',
      slug: 'getting-started',
      description: 'Guides for new users',
      sortOrder: 1,
    },
  });

  const troubleshooting = await prisma.kBCategory.create({
    data: {
      tenantId: defaultTenant.id,
      name: 'Troubleshooting',
      slug: 'troubleshooting',
      description: 'Common issues and fixes',
      sortOrder: 2,
    },
  });

  console.log('Created 2 KB categories');

  // KB Articles
  const articles = [
    {
      categoryId: gettingStarted.id,
      title: 'How to set up your account',
      slug: 'how-to-set-up-your-account',
      body: '# Setting up your account\n\n1. Go to Settings > Account\n2. Fill in your profile information\n3. Connect your email provider\n4. Configure notification preferences\n\nYou\'re all set!',
      status: 'published',
      publishedAt: new Date('2026-03-15'),
    },
    {
      categoryId: gettingStarted.id,
      title: 'Connecting your email',
      slug: 'connecting-your-email',
      body: '# Email Connection Guide\n\nPMSync supports Gmail and Outlook via OAuth2.\n\n## Gmail\n1. Click "Connect Gmail"\n2. Authorize access\n\n## Outlook\n1. Click "Connect Outlook"\n2. Sign in with Microsoft account',
      status: 'published',
      publishedAt: new Date('2026-03-16'),
    },
    {
      categoryId: troubleshooting.id,
      title: 'Email sync not working',
      slug: 'email-sync-not-working',
      body: '# Email Sync Issues\n\n## Common Causes\n- OAuth token expired: reconnect your account\n- Rate limiting: wait 15 minutes\n- Server error: check status page\n\n## Steps\n1. Go to Settings > Connections\n2. Click "Reconnect" on your email account\n3. Re-authorize access',
      status: 'published',
      publishedAt: new Date('2026-03-20'),
    },
  ];

  for (const a of articles) {
    await prisma.kBArticle.create({
      data: {
        tenantId: defaultTenant.id,
        authorId: adminUser.id,
        ...a,
      },
    });
  }
  console.log(`Created ${articles.length} KB articles`);

  // Canned response templates
  const templates = [
    { name: 'Acknowledge receipt', body: 'Thank you for contacting us. We have received your request and a team member will be assigned shortly. You can track your ticket status at any time using the portal link in your email.', category: 'general' },
    { name: 'Request more info', body: 'To help us resolve your issue faster, could you please provide:\n- Steps to reproduce the problem\n- Browser/device information\n- Any error messages you see\n\nThank you for your patience.', category: 'general' },
    { name: 'Issue resolved', body: 'We have resolved the issue you reported. Please verify that everything is working correctly on your end. If you experience any further problems, feel free to reopen this ticket.\n\nThank you for your patience.', category: 'resolution' },
  ];

  for (const t of templates) {
    await prisma.ticketTemplate.create({
      data: {
        tenantId: defaultTenant.id,
        name: t.name,
        body: t.body,
        category: t.category,
      },
    });
  }
  console.log(`Created ${templates.length} canned response templates`);

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
