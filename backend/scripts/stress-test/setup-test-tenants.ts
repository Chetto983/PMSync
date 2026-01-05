/**
 * Setup Test Tenants for Stress Testing
 *
 * Creates N test tenants with synthetic email data.
 *
 * Run: npx ts-node -r dotenv/config scripts/stress-test/setup-test-tenants.ts
 */

import 'dotenv/config';
import { createPrismaClient } from '../../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

interface TestTenantConfig {
  numTenants: number;
  emailsPerTenant: number;
  foldersPerTenant: number;
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg: string, color = colors.reset): void {
  console.log(`${color}${msg}${colors.reset}`);
}

function progressBar(current: number, total: number, label: string): void {
  const width = 40;
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  process.stdout.write(`\r${colors.cyan}${label}${colors.reset} [${bar}] ${percent}% (${current}/${total})`);
  if (current === total) console.log();
}

// Generate synthetic email
function generateSyntheticEmail(index: number): {
  subject: string;
  snippet: string;
  from: string;
  to: string[];
  date: Date;
} {
  const subjects = [
    'Meeting tomorrow at 10am',
    'RE: Project update',
    'FW: Important document',
    'Action required: Review needed',
    'Weekly report',
    'Quick question',
    'Follow up on our call',
    'Urgent: Deadline approaching',
    'Thanks for your help',
    'New feature request',
  ];

  const bodies = [
    'Hi, Just wanted to follow up on our previous discussion. Let me know your thoughts. Best regards',
    'Please find attached the document we discussed. Let me know if you have any questions.',
    'I wanted to touch base regarding the project timeline. Can we schedule a call?',
    'Thank you for your email. I will review and get back to you by end of day.',
    'As discussed in our meeting, here are the action items: 1. Review proposal 2. Update timeline 3. Send feedback',
  ];

  return {
    subject: subjects[index % subjects.length] + ` #${index}`,
    snippet: bodies[index % bodies.length],
    from: `user${index % 100}@company${Math.floor(index / 100)}.com`,
    to: [`recipient${index % 50}@test.local`],
    date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Last 30 days
  };
}

// Create test tenant
async function createTestTenant(index: number): Promise<string> {
  const slug = `stress-test-${index}`;

  // Check if already exists
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) return existing.id;

  const tenant = await prisma.tenant.create({
    data: {
      name: `Stress Test Tenant ${index}`,
      slug,
      isActive: true,
    },
  });

  return tenant.id;
}

// Create test user
async function createTestUser(tenantId: string, index: number): Promise<string> {
  const email = `stress-test-${index}@test.local`;

  // Check if already exists
  const existing = await prisma.user.findFirst({
    where: { tenantId, email },
  });
  if (existing) return existing.id;

  const user = await prisma.user.create({
    data: {
      tenantId,
      email,
      firstName: 'Stress',
      lastName: `User ${index}`,
      passwordHash: 'stress-test-disabled',
      isActive: true,
    },
  });

  return user.id;
}

// Create test provider for tenant
async function createTestProvider(
  tenantId: string,
  userId: string,
  index: number
): Promise<string> {
  const email = `stress-tenant-${index}@test.local`;

  // Check if already exists
  const existing = await prisma.providerConfig.findFirst({
    where: { tenantId, email },
  });
  if (existing) return existing.id;

  const provider = await prisma.providerConfig.create({
    data: {
      tenantId,
      userId,
      providerType: 'IMAP',
      email,
      displayName: `Stress Test Provider ${index}`,
      supportsEmail: true,
      supportsCalendar: false,
      supportsContacts: false,
      imapHost: 'test.local',
      imapPort: 993,
      imapUseTls: true,
    },
  });

  return provider.id;
}

// Create folders for provider
async function createTestFolders(
  tenantId: string,
  providerId: string,
  numFolders: number
): Promise<Map<string, string>> {
  const folderMap = new Map<string, string>();

  const systemFolders = [
    { name: 'INBOX', path: 'INBOX', specialUse: 'INBOX', isSystem: true },
    { name: 'Sent', path: 'Sent', specialUse: 'SENT', isSystem: true },
    { name: 'Drafts', path: 'Drafts', specialUse: 'DRAFTS', isSystem: true },
    { name: 'Trash', path: 'Trash', specialUse: 'TRASH', isSystem: true },
    { name: 'Spam', path: 'Spam', specialUse: 'JUNK', isSystem: true },
  ];

  // Create system folders
  for (const folder of systemFolders) {
    const existing = await prisma.folder.findFirst({
      where: { tenantId, providerId, path: folder.path },
    });

    if (existing) {
      folderMap.set(folder.path, existing.id);
      continue;
    }

    const created = await prisma.folder.create({
      data: {
        tenantId,
        providerId,
        name: folder.name,
        path: folder.path,
        specialUse: folder.specialUse,
        isSystem: folder.isSystem,
        totalCount: 0,
        unreadCount: 0,
        uidValidity: String(Math.floor(Math.random() * 1000000)),
        uidNext: 1,
      },
    });
    folderMap.set(folder.path, created.id);
  }

  // Create additional folders
  const additionalFolders = [
    'Projects', 'Archive', 'Work', 'Personal', 'Newsletters',
  ];

  for (let i = 0; i < Math.min(numFolders - 5, additionalFolders.length); i++) {
    const name = additionalFolders[i];
    const path = name;

    const existing = await prisma.folder.findFirst({
      where: { tenantId, providerId, path },
    });

    if (existing) {
      folderMap.set(path, existing.id);
      continue;
    }

    const created = await prisma.folder.create({
      data: {
        tenantId,
        providerId,
        name,
        path,
        specialUse: null,
        isSystem: false,
        totalCount: 0,
        unreadCount: 0,
        uidValidity: String(Math.floor(Math.random() * 1000000)),
        uidNext: 1,
      },
    });
    folderMap.set(path, created.id);
  }

  return folderMap;
}

// Insert emails for provider
async function insertTestEmails(
  tenantId: string,
  providerId: string,
  folderMap: Map<string, string>, // path -> folderId
  numEmails: number,
  batchSize: number = 100
): Promise<number> {
  const folderPaths = Array.from(folderMap.keys());
  let inserted = 0;

  for (let i = 0; i < numEmails; i += batchSize) {
    const batch = [];
    const batchEnd = Math.min(i + batchSize, numEmails);

    for (let j = i; j < batchEnd; j++) {
      const email = generateSyntheticEmail(j);
      const folderIndex = j % folderPaths.length;
      const folderPath = folderPaths[folderIndex];

      batch.push({
        tenantId,
        providerId,
        folder: folderPath, // folder is a string path in schema
        messageId: `<synthetic-${providerId}-${j}@test.local>`,
        externalId: `ext-${j}-${Date.now()}`,
        threadId: `thread-${Math.floor(j / 5)}`, // 5 emails per thread
        subject: email.subject,
        snippet: email.snippet,
        bodyText: email.snippet,
        from: email.from,
        to: email.to,
        cc: [],
        bcc: [],
        sentAt: email.date,
        receivedAt: email.date,
        isRead: Math.random() > 0.3,
        isStarred: Math.random() > 0.9,
        isDraft: false,
        size: email.snippet.length,
      });
    }

    try {
      await prisma.email.createMany({
        data: batch,
        skipDuplicates: true,
      });
      inserted += batch.length;
    } catch (error) {
      // Handle duplicates gracefully
      for (const data of batch) {
        try {
          await prisma.email.create({ data });
          inserted++;
        } catch {
          // Skip duplicate
        }
      }
    }
  }

  // Update folder counts
  for (const [folderPath, folderId] of folderMap) {
    const totalCount = await prisma.email.count({
      where: { tenantId, providerId, folder: folderPath },
    });

    const unreadCount = await prisma.email.count({
      where: { tenantId, providerId, folder: folderPath, isRead: false },
    });

    await prisma.folder.update({
      where: { id: folderId },
      data: {
        totalCount,
        unreadCount,
        uidNext: totalCount + 1,
      },
    });
  }

  return inserted;
}

// Main setup function
async function setupTestTenants(config: TestTenantConfig): Promise<void> {
  log('\n' + '═'.repeat(70), colors.yellow);
  log('  STRESS TEST TENANT SETUP', colors.yellow);
  log('═'.repeat(70) + '\n', colors.yellow);

  log(`Configuration:`, colors.cyan);
  log(`  - Tenants: ${config.numTenants}`);
  log(`  - Emails per tenant: ${config.emailsPerTenant}`);
  log(`  - Folders per tenant: ${config.foldersPerTenant}`);
  log('');

  const stats = {
    tenants: 0,
    folders: 0,
    emails: 0,
    startTime: Date.now(),
  };

  for (let i = 0; i < config.numTenants; i++) {
    progressBar(i + 1, config.numTenants, 'Creating tenants');

    try {
      // Create tenant
      const tenantId = await createTestTenant(i);

      // Create user
      const userId = await createTestUser(tenantId, i);

      // Create provider
      const providerId = await createTestProvider(tenantId, userId, i);

      // Create folders
      const folderMap = await createTestFolders(tenantId, providerId, config.foldersPerTenant);
      stats.folders += folderMap.size;

      // Insert emails
      const inserted = await insertTestEmails(
        tenantId,
        providerId,
        folderMap,
        config.emailsPerTenant
      );
      stats.emails += inserted;
      stats.tenants++;

    } catch (error) {
      log(`\nError creating tenant ${i}: ${error}`, colors.red);
    }
  }

  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);

  log('\n' + '═'.repeat(70), colors.green);
  log('  SETUP COMPLETE', colors.green);
  log('═'.repeat(70), colors.green);
  log(`\n  Tenants created: ${stats.tenants}`);
  log(`  Folders created: ${stats.folders}`);
  log(`  Emails inserted: ${stats.emails}`);
  log(`  Duration: ${duration}s`);
  log(`  Rate: ${(stats.emails / parseFloat(duration)).toFixed(0)} emails/sec\n`);
}

// Cleanup test data
async function cleanupTestTenants(): Promise<void> {
  log('\nCleaning up test data...', colors.yellow);

  // Find all stress test tenants
  const testTenants = await prisma.tenant.findMany({
    where: { slug: { startsWith: 'stress-test-' } },
    select: { id: true },
  });

  const tenantIds = testTenants.map(t => t.id);

  if (tenantIds.length === 0) {
    log('No test data found', colors.cyan);
    return;
  }

  // Find providers
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true },
  });

  const providerIds = providers.map(p => p.id);

  // Delete in order (respecting foreign keys)
  log(`Deleting emails...`, colors.dim);
  await prisma.email.deleteMany({ where: { tenantId: { in: tenantIds } } });

  log(`Deleting folders...`, colors.dim);
  await prisma.folder.deleteMany({ where: { tenantId: { in: tenantIds } } });

  log(`Deleting providers...`, colors.dim);
  await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });

  log(`Deleting users...`, colors.dim);
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });

  log(`Deleting tenants...`, colors.dim);
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });

  log(`Cleaned up ${tenantIds.length} test tenants`, colors.green);
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--cleanup')) {
    await cleanupTestTenants();
    await prisma.$disconnect();
    return;
  }

  // Parse arguments
  const numTenants = parseInt(args.find(a => a.startsWith('--tenants='))?.split('=')[1] || '20');
  const emailsPerTenant = parseInt(args.find(a => a.startsWith('--emails='))?.split('=')[1] || '500');
  const foldersPerTenant = parseInt(args.find(a => a.startsWith('--folders='))?.split('=')[1] || '10');

  const config: TestTenantConfig = {
    numTenants,
    emailsPerTenant,
    foldersPerTenant,
  };

  await setupTestTenants(config);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
