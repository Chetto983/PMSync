/**
 * Email Module Audit Script
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/audit-email-module.ts
 *
 * Optional env:
 *   TENANT_ID=...         Audit a single tenant
 *   MAX_TENANTS=10        Limit number of tenants (when TENANT_ID not set)
 *   MAX_PENDING_SAMPLE=5000  Limit pending-attachment sample size
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

type Status = 'PASS' | 'WARN' | 'FAIL';

type Result = {
  tenantId: string;
  category: string;
  check: string;
  status: Status;
  details: string;
};

const results: Result[] = [];

const TENANT_ID = process.env.TENANT_ID;
const MAX_TENANTS = Number.parseInt(process.env.MAX_TENANTS || '10', 10);
const MAX_PENDING_SAMPLE = Number.parseInt(process.env.MAX_PENDING_SAMPLE || '5000', 10);

const REQUIRED_SPECIAL_USE = ['INBOX', 'SENT', 'DRAFTS', 'TRASH'];

function record(tenantId: string, category: string, check: string, status: Status, details: string) {
  results.push({ tenantId, category, check, status, details });
  const icon = status === 'PASS' ? 'OK' : status === 'WARN' ? 'WARN' : 'FAIL';
  console.log(`[${icon}] [${tenantId}] ${category} - ${check}: ${details}`);
}

function formatCount(count: number) {
  return count.toLocaleString();
}

async function getTenants() {
  if (TENANT_ID) {
    return prisma.tenant.findMany({
      where: { id: TENANT_ID },
      select: { id: true, name: true, isActive: true },
    });
  }

  return prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true, isActive: true },
    take: MAX_TENANTS,
    orderBy: { createdAt: 'asc' },
  });
}

async function auditProviders(tenantId: string) {
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId },
    select: {
      id: true,
      email: true,
      providerType: true,
      isActive: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      imapHost: true,
      imapUsername: true,
      imapPassword: true,
      smtpHost: true,
      smtpUsername: true,
      smtpPassword: true,
    },
  });

  const activeProviders = providers.filter((p) => p.isActive);
  record(
    tenantId,
    'Providers',
    'Active provider count',
    activeProviders.length > 0 ? 'PASS' : 'WARN',
    `${formatCount(activeProviders.length)} active / ${formatCount(providers.length)} total`,
  );

  const now = new Date();

  for (const provider of activeProviders) {
    const type = provider.providerType;
    const emailLabel = `${type}:${provider.email}`;

    if (type === 'google' || type === 'microsoft') {
      const hasAccess = Boolean(provider.accessToken);
      const hasRefresh = Boolean(provider.refreshToken);
      const expired = provider.tokenExpiresAt
        ? new Date(provider.tokenExpiresAt) < now
        : false;

      record(
        tenantId,
        'Providers',
        `${emailLabel} access token`,
        hasAccess ? 'PASS' : 'FAIL',
        hasAccess ? 'present' : 'missing',
      );
      record(
        tenantId,
        'Providers',
        `${emailLabel} refresh token`,
        hasRefresh ? 'PASS' : 'WARN',
        hasRefresh ? 'present' : 'missing',
      );
      record(
        tenantId,
        'Providers',
        `${emailLabel} token expiry`,
        expired ? 'WARN' : 'PASS',
        provider.tokenExpiresAt ? `expires ${provider.tokenExpiresAt.toISOString()}` : 'no expiry set',
      );
    } else if (type === 'imap' || type === 'generic') {
      const hasImap = Boolean(provider.imapHost && provider.imapUsername && provider.imapPassword);
      const hasSmtp = Boolean(provider.smtpHost && provider.smtpUsername && provider.smtpPassword);

      record(
        tenantId,
        'Providers',
        `${emailLabel} IMAP credentials`,
        hasImap ? 'PASS' : 'WARN',
        hasImap ? 'configured' : 'missing host/user/password',
      );
      record(
        tenantId,
        'Providers',
        `${emailLabel} SMTP credentials`,
        hasSmtp ? 'PASS' : 'WARN',
        hasSmtp ? 'configured' : 'missing host/user/password',
      );
    }
  }

  return providers;
}

async function auditFolders(tenantId: string, providers: Array<{ id: string; providerType: string }>) {
  const folders = await prisma.folder.findMany({
    where: { tenantId },
    select: { providerId: true, path: true, name: true, specialUse: true },
  });

  record(
    tenantId,
    'Folders',
    'Total folders',
    folders.length > 0 ? 'PASS' : 'WARN',
    formatCount(folders.length),
  );

  const byProvider = new Map<string, { path: string | null; name: string | null; specialUse: string | null }[]>();
  for (const folder of folders) {
    if (!byProvider.has(folder.providerId)) {
      byProvider.set(folder.providerId, []);
    }
    byProvider.get(folder.providerId)!.push(folder);
  }

  for (const provider of providers) {
    const providerFolders = byProvider.get(provider.id) ?? [];
    const specialUses = new Set(
      providerFolders
        .map((f) => f.specialUse)
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toUpperCase()),
    );

    for (const required of REQUIRED_SPECIAL_USE) {
      const found = specialUses.has(required);
      record(
        tenantId,
        'Folders',
        `${provider.providerType} ${required} mapping`,
        found ? 'PASS' : 'WARN',
        found ? 'present' : 'missing specialUse',
      );
    }
  }

  return folders;
}

function getSpecialUseNames(
  folders: Array<{ providerId: string; path: string | null; name: string | null; specialUse: string | null }>,
  providerId: string,
  specialUse: string,
): Set<string> {
  const set = new Set<string>();
  for (const folder of folders) {
    if (folder.providerId !== providerId) continue;
    if (folder.specialUse && folder.specialUse.toUpperCase() === specialUse) {
      if (folder.path) set.add(folder.path);
      if (folder.name) set.add(folder.name);
      set.add(folder.specialUse.toUpperCase());
    }
  }
  if (set.size === 0) {
    set.add(specialUse);
  }
  return set;
}

async function auditEmails(
  tenantId: string,
  providers: Array<{ id: string; providerType: string }>,
  folders: Array<{ providerId: string; path: string | null; name: string | null; specialUse: string | null }>,
) {
  const [total, deleted, drafts, archived] = await Promise.all([
    prisma.email.count({ where: { tenantId } }),
    prisma.email.count({ where: { tenantId, isDeleted: true } }),
    prisma.email.count({ where: { tenantId, isDraft: true } }),
    prisma.email.count({ where: { tenantId, isArchived: true } }),
  ]);

  record(tenantId, 'Emails', 'Total emails', total > 0 ? 'PASS' : 'WARN', formatCount(total));
  record(tenantId, 'Emails', 'Deleted emails', 'PASS', formatCount(deleted));
  record(tenantId, 'Emails', 'Draft emails', 'PASS', formatCount(drafts));
  record(tenantId, 'Emails', 'Archived emails', 'PASS', formatCount(archived));

  const missingBody = await prisma.email.count({
    where: {
      tenantId,
      isArchived: false,
      isDeleted: false,
      bodyText: null,
      bodyHtml: null,
    },
  });

  record(
    tenantId,
    'Emails',
    'Missing body (not archived)',
    missingBody === 0 ? 'PASS' : 'WARN',
    formatCount(missingBody),
  );

  for (const provider of providers) {
    const trashNames = Array.from(getSpecialUseNames(folders, provider.id, 'TRASH'));
    const draftNames = Array.from(getSpecialUseNames(folders, provider.id, 'DRAFTS'));

    if (trashNames.length > 0) {
      const deletedOutsideTrash = await prisma.email.count({
        where: {
          tenantId,
          providerId: provider.id,
          isDeleted: true,
          folder: { notIn: trashNames, mode: 'insensitive' },
        },
      });
      record(
        tenantId,
        'Emails',
        `${provider.providerType} deleted outside trash`,
        deletedOutsideTrash === 0 ? 'PASS' : 'WARN',
        formatCount(deletedOutsideTrash),
      );

      const trashNotDeleted = await prisma.email.count({
        where: {
          tenantId,
          providerId: provider.id,
          isDeleted: false,
          folder: { in: trashNames, mode: 'insensitive' },
        },
      });
      record(
        tenantId,
        'Emails',
        `${provider.providerType} trash not marked deleted`,
        trashNotDeleted === 0 ? 'PASS' : 'WARN',
        formatCount(trashNotDeleted),
      );
    }

    if (draftNames.length > 0) {
      const draftOutsideFolder = await prisma.email.count({
        where: {
          tenantId,
          providerId: provider.id,
          isDraft: true,
          folder: { notIn: draftNames, mode: 'insensitive' },
        },
      });
      record(
        tenantId,
        'Emails',
        `${provider.providerType} drafts outside drafts folder`,
        draftOutsideFolder === 0 ? 'PASS' : 'WARN',
        formatCount(draftOutsideFolder),
      );
    }
  }
}

async function auditAttachments(tenantId: string) {
  const [total, pending, s3] = await Promise.all([
    prisma.emailAttachment.count({ where: { email: { tenantId } } }),
    prisma.emailAttachment.count({ where: { email: { tenantId }, storageType: 'pending' } }),
    prisma.emailAttachment.count({ where: { email: { tenantId }, storageType: 's3' } }),
  ]);

  record(tenantId, 'Attachments', 'Total attachments', total > 0 ? 'PASS' : 'WARN', formatCount(total));
  record(tenantId, 'Attachments', 'Pending attachments', 'PASS', formatCount(pending));
  record(tenantId, 'Attachments', 'S3 attachments', 'PASS', formatCount(s3));

  const [pendingMissingPath, s3MissingPath] = await Promise.all([
    prisma.emailAttachment.count({
      where: {
        email: { tenantId },
        storageType: 'pending',
        OR: [{ storagePath: null }, { storagePath: '' }],
      },
    }),
    prisma.emailAttachment.count({
      where: {
        email: { tenantId },
        storageType: 's3',
        OR: [{ storagePath: null }, { storagePath: '' }],
      },
    }),
  ]);

  record(
    tenantId,
    'Attachments',
    'Pending missing storagePath',
    pendingMissingPath === 0 ? 'PASS' : 'FAIL',
    formatCount(pendingMissingPath),
  );
  record(
    tenantId,
    'Attachments',
    'S3 missing storagePath',
    s3MissingPath === 0 ? 'PASS' : 'FAIL',
    formatCount(s3MissingPath),
  );

  const pendingSample = await prisma.emailAttachment.findMany({
    where: { email: { tenantId }, storageType: 'pending' },
    select: { id: true, storagePath: true },
    take: MAX_PENDING_SAMPLE,
  });

  let invalidPending = 0;
  for (const attachment of pendingSample) {
    const storagePath = attachment.storagePath || '';
    if (storagePath.split('/').length !== 3) {
      invalidPending += 1;
    }
  }

  record(
    tenantId,
    'Attachments',
    'Pending storagePath format',
    invalidPending === 0 ? 'PASS' : 'WARN',
    `${invalidPending} invalid in sample of ${pendingSample.length}`,
  );
}

async function auditScheduledEmails(tenantId: string) {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const [pendingPastDue, stuckProcessing, failed] = await Promise.all([
    prisma.scheduledEmail.count({
      where: {
        tenantId,
        status: 'pending',
        scheduledAt: { lt: fiveMinutesAgo },
      },
    }),
    prisma.scheduledEmail.count({
      where: {
        tenantId,
        status: 'processing',
        updatedAt: { lt: thirtyMinutesAgo },
      },
    }),
    prisma.scheduledEmail.count({
      where: {
        tenantId,
        status: 'failed',
      },
    }),
  ]);

  record(
    tenantId,
    'Scheduled Emails',
    'Pending past due',
    pendingPastDue === 0 ? 'PASS' : 'WARN',
    formatCount(pendingPastDue),
  );
  record(
    tenantId,
    'Scheduled Emails',
    'Processing > 30 min',
    stuckProcessing === 0 ? 'PASS' : 'WARN',
    formatCount(stuckProcessing),
  );
  record(
    tenantId,
    'Scheduled Emails',
    'Failed scheduled emails',
    failed === 0 ? 'PASS' : 'WARN',
    formatCount(failed),
  );
}

async function auditTenant(tenant: { id: string; name: string }) {
  console.log(`\n=== Auditing tenant ${tenant.name} (${tenant.id}) ===\n`);

  const providers = await auditProviders(tenant.id);
  const folders = await auditFolders(tenant.id, providers.map((p) => ({ id: p.id, providerType: p.providerType })));

  await auditEmails(
    tenant.id,
    providers.map((p) => ({ id: p.id, providerType: p.providerType })),
    folders,
  );
  await auditAttachments(tenant.id);
  await auditScheduledEmails(tenant.id);
}

async function main() {
  console.log('=== Email Module Audit ===');
  const tenants = await getTenants();

  if (tenants.length === 0) {
    console.log('No tenants found to audit.');
    return;
  }

  for (const tenant of tenants) {
    await auditTenant(tenant);
  }

  const totals = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { PASS: 0, WARN: 0, FAIL: 0 },
  );

  console.log('\n=== Summary ===');
  console.log(`PASS: ${totals.PASS}`);
  console.log(`WARN: ${totals.WARN}`);
  console.log(`FAIL: ${totals.FAIL}`);
}

main()
  .catch((error) => {
    console.error('Audit failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
