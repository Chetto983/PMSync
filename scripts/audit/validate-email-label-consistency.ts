/**
 * Email & Label Data Consistency Validation Script
 * Sprint 07 — T-0704
 *
 * Comprehensive checks:
 * 1. Email.folder matches derivation from Email.labels[] (Google only)
 * 2. No stale Gmail label IDs (cross-ref with Folder.externalId)
 * 3. No ghost EmailLabel records (soft-deleted UserLabels)
 * 4. Email count per label matches _count.emailLabels
 * 5. All UserLabel colors are valid JSON with hex colors
 *
 * Usage:
 *   cd backend && npx ts-node ../scripts/audit/validate-email-label-consistency.ts
 *
 * Output: JSON report to stdout with totals, inconsistencies, and suggested fixes.
 */

/**
 * NOTE: Run from the backend/ directory:
 *   cd backend && npx ts-node ../scripts/audit/validate-email-label-consistency.ts
 *
 * Or with dotenv explicitly:
 *   cd backend && npx ts-node -r dotenv/config ../scripts/audit/validate-email-label-consistency.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- Helpers ---

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const SYSTEM_LABELS = new Set([
  'INBOX', 'SENT', 'DRAFTS', 'DRAFT', 'TRASH', 'SPAM', 'ARCHIVE',
  'IMPORTANT', 'STARRED', 'OUTBOX', 'JUNK', 'FLAGGED',
  'UNREAD', 'MUTED', 'CHAT', 'ALL',
  'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES',
  'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS',
]);

function deriveFolder(labels: string[]): string {
  if (!labels || labels.length === 0) return 'INBOX';
  if (labels.includes('TRASH')) return 'TRASH';
  if (labels.includes('SPAM')) return 'SPAM';
  if (labels.includes('SENT')) return 'SENT';
  if (labels.includes('DRAFT') || labels.includes('DRAFTS')) return 'DRAFTS';

  const cat = labels.find((l) => l.startsWith('CATEGORY_'));
  if (cat) {
    const map: Record<string, string> = {
      CATEGORY_PERSONAL: 'INBOX',
      CATEGORY_SOCIAL: 'SOCIAL',
      CATEGORY_PROMOTIONS: 'PROMOTIONS',
      CATEGORY_UPDATES: 'UPDATES',
      CATEGORY_FORUMS: 'FORUMS',
    };
    if (map[cat]) return map[cat];
  }

  if (labels.includes('INBOX')) return 'INBOX';
  return 'ARCHIVE';
}

// --- Checks ---

interface CheckResult {
  check: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  total: number;
  issues: number;
  samples: unknown[];
  suggestion?: string;
}

async function checkFolderLabelDerivation(): Promise<CheckResult> {
  // Only check Google provider emails
  const emails = await prisma.email.findMany({
    where: {
      provider: { providerType: 'google' },
      NOT: { labels: { isEmpty: true } },
    },
    select: { id: true, folder: true, labels: true, subject: true },
    take: 10000,
  });

  const mismatches: unknown[] = [];
  for (const email of emails) {
    const expected = deriveFolder(email.labels);
    if (expected.toUpperCase() !== (email.folder || '').toUpperCase()) {
      if (mismatches.length < 10) {
        mismatches.push({
          id: email.id,
          folder: email.folder,
          expected,
          labels: email.labels.slice(0, 5),
          subject: (email.subject || '').substring(0, 50),
        });
      }
    }
  }

  const issueCount = emails.filter(
    (e) => deriveFolder(e.labels).toUpperCase() !== (e.folder || '').toUpperCase(),
  ).length;

  return {
    check: 'folder-label-derivation',
    status: issueCount === 0 ? 'PASS' : 'FAIL',
    total: emails.length,
    issues: issueCount,
    samples: mismatches,
    suggestion: issueCount > 0
      ? 'Run scripts/audit/fix-email-folder-drift.mjs to re-derive folders'
      : undefined,
  };
}

async function checkStaleLabelIds(): Promise<CheckResult> {
  const folders = await prisma.folder.findMany({
    where: { externalId: { not: null } },
    select: { externalId: true },
  });
  const validExternalIds = new Set(folders.map((f) => f.externalId));

  const emails = await prisma.email.findMany({
    where: {
      provider: { providerType: 'google' },
      NOT: { labels: { isEmpty: true } },
    },
    select: { id: true, labels: true },
    take: 10000,
  });

  const staleEmails: unknown[] = [];
  let issueCount = 0;
  for (const email of emails) {
    const staleIds = email.labels.filter(
      (id) => !SYSTEM_LABELS.has(id) && !validExternalIds.has(id),
    );
    if (staleIds.length > 0) {
      issueCount++;
      if (staleEmails.length < 5) {
        staleEmails.push({ id: email.id, staleIds });
      }
    }
  }

  return {
    check: 'stale-label-ids',
    status: issueCount === 0 ? 'PASS' : 'WARN',
    total: emails.length,
    issues: issueCount,
    samples: staleEmails,
    suggestion: issueCount > 0
      ? 'Stale label IDs may indicate labels deleted from Gmail but not cleaned in DB'
      : undefined,
  };
}

async function checkGhostEmailLabels(): Promise<CheckResult> {
  // Find EmailLabel records pointing to archived (soft-deleted) UserLabels
  const ghostRecords = await prisma.emailLabel.findMany({
    where: {
      label: { isArchived: true },
    },
    select: {
      id: true,
      emailId: true,
      labelId: true,
      label: { select: { name: true, isArchived: true } },
    },
    take: 100,
  });

  return {
    check: 'ghost-email-labels',
    status: ghostRecords.length === 0 ? 'PASS' : 'WARN',
    total: ghostRecords.length,
    issues: ghostRecords.length,
    samples: ghostRecords.slice(0, 5).map((r) => ({
      emailLabelId: r.id,
      emailId: r.emailId,
      labelId: r.labelId,
      labelName: r.label.name,
    })),
    suggestion: ghostRecords.length > 0
      ? 'Consider cleaning EmailLabel records for archived labels if not needed for restore'
      : undefined,
  };
}

async function checkLabelCountConsistency(): Promise<CheckResult> {
  // Compare UserLabel._count.emailLabels with actual count
  const labels = await prisma.userLabel.findMany({
    where: { isArchived: false },
    select: {
      id: true,
      name: true,
      tenantId: true,
      _count: { select: { emailLabels: true } },
    },
  });

  const mismatches: unknown[] = [];
  for (const label of labels) {
    const actualCount = await prisma.emailLabel.count({
      where: { labelId: label.id },
    });
    if (actualCount !== label._count.emailLabels) {
      mismatches.push({
        labelId: label.id,
        name: label.name,
        prismaCount: label._count.emailLabels,
        actualCount,
      });
    }
  }

  return {
    check: 'label-count-consistency',
    status: mismatches.length === 0 ? 'PASS' : 'FAIL',
    total: labels.length,
    issues: mismatches.length,
    samples: mismatches.slice(0, 5),
    suggestion: mismatches.length > 0
      ? 'Prisma _count and actual COUNT disagree — possible data corruption'
      : undefined,
  };
}

async function checkLabelColors(): Promise<CheckResult> {
  const labels = await prisma.userLabel.findMany({
    where: { isArchived: false, color: { not: null } },
    select: { id: true, name: true, color: true },
  });

  const invalid: unknown[] = [];
  for (const label of labels) {
    const color = label.color as Record<string, unknown> | null;
    if (!color || typeof color !== 'object') {
      invalid.push({ labelId: label.id, name: label.name, reason: 'color is not an object' });
      continue;
    }
    const bg = color.backgroundColor as string | undefined;
    const text = color.textColor as string | undefined;
    if (bg && !HEX_COLOR_REGEX.test(bg)) {
      invalid.push({ labelId: label.id, name: label.name, reason: `invalid backgroundColor: ${bg}` });
    }
    if (text && !HEX_COLOR_REGEX.test(text)) {
      invalid.push({ labelId: label.id, name: label.name, reason: `invalid textColor: ${text}` });
    }
  }

  return {
    check: 'label-color-validation',
    status: invalid.length === 0 ? 'PASS' : 'WARN',
    total: labels.length,
    issues: invalid.length,
    samples: invalid.slice(0, 5),
    suggestion: invalid.length > 0
      ? 'Fix invalid color values via PATCH /labels/:id with valid hex colors'
      : undefined,
  };
}

// --- Main ---

async function main() {
  console.log('=== Email & Label Data Consistency Validation ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const results: CheckResult[] = [];

  console.log('Running check 1/5: Folder vs Labels derivation...');
  results.push(await checkFolderLabelDerivation());

  console.log('Running check 2/5: Stale label IDs...');
  results.push(await checkStaleLabelIds());

  console.log('Running check 3/5: Ghost EmailLabel records...');
  results.push(await checkGhostEmailLabels());

  console.log('Running check 4/5: Label count consistency...');
  results.push(await checkLabelCountConsistency());

  console.log('Running check 5/5: Label color validation...');
  results.push(await checkLabelColors());

  // Summary
  console.log('\n=== RESULTS ===\n');
  const totalIssues = results.reduce((sum, r) => sum + r.issues, 0);
  const allPass = results.every((r) => r.status === 'PASS');

  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : r.status === 'WARN' ? 'WARN' : 'FAIL';
    console.log(`[${icon}] ${r.check}: ${r.issues}/${r.total} issues`);
    if (r.suggestion) console.log(`       -> ${r.suggestion}`);
    if (r.samples.length > 0) {
      console.log(`       Samples: ${JSON.stringify(r.samples.slice(0, 3), null, 2)}`);
    }
  }

  console.log(`\nTotal issues: ${totalIssues}`);
  console.log(allPass ? '\nALL CHECKS PASSED' : '\nISSUES FOUND — review above');

  // JSON report to stderr for machine consumption
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), results, totalIssues }, null, 2));

  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Script failed:', err.message);
  await prisma.$disconnect();
  process.exit(2);
});
