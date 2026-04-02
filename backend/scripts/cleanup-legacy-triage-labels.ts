import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

const LEGACY_LABELS = [
  ['Info', 'info'],
  ['Personal', 'personal'],
  ['Finance', 'finance'],
  ['Promotions', 'promotions'],
  ['Updates', 'updates'],
  ['Customer', 'customer'],
  ['System Alert', 'system-alert'],
  ['Important', 'important'],
  ['Action Items', 'action-items'],
  ['Follow-up', 'follow-up'],
  ['Review Later', 'review-later'],
] as const;

const LEGACY_NAME_TO_SLUG = new Map<string, string>(LEGACY_LABELS);

function getFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg === `--${name}`);
  if (direct) return 'true';
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const APPLY = getFlag('apply') === 'true';
const JSON_OUTPUT = getFlag('json') === 'true';
const TENANT_FILTER = getFlag('tenant');

type CandidateLabel = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  parentId: string | null;
  category: string;
  suppressUrgency: boolean;
  defaultLane: string | null;
  actionType: string;
  roles: string[];
  contents: string[];
  mutuallyExclusiveWith: string[];
  tenant: {
    slug: string;
    name: string;
  };
};

function isLegacyCandidate(label: CandidateLabel): boolean {
  const expectedSlug = LEGACY_NAME_TO_SLUG.get(label.name);
  if (!expectedSlug || label.slug !== expectedSlug) return false;

  return (
    label.parentId === null
    && label.category === 'custom'
    && label.suppressUrgency === false
    && label.defaultLane === null
    && label.actionType === 'none'
    && label.roles.length === 0
    && label.contents.length === 0
    && label.mutuallyExclusiveWith.length === 0
  );
}

async function main() {
  const candidatePool = await prisma.userLabel.findMany({
    where: {
      type: 'USER',
      isArchived: false,
      name: { in: LEGACY_LABELS.map(([name]) => name) },
      ...(TENANT_FILTER
        ? {
            tenant: {
              OR: [{ slug: TENANT_FILTER }, { id: TENANT_FILTER }],
            },
          }
        : {}),
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      parentId: true,
      category: true,
      suppressUrgency: true,
      defaultLane: true,
      actionType: true,
      roles: true,
      contents: true,
      mutuallyExclusiveWith: true,
      tenant: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
    orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
  });

  const candidates = candidatePool.filter(isLegacyCandidate);
  const grouped = new Map<
    string,
    {
      tenantId: string;
      slug: string;
      name: string;
      labels: CandidateLabel[];
    }
  >();

  for (const label of candidates) {
    const existing = grouped.get(label.tenantId);
    if (existing) {
      existing.labels.push(label);
      continue;
    }

    grouped.set(label.tenantId, {
      tenantId: label.tenantId,
      slug: label.tenant.slug,
      name: label.tenant.name,
      labels: [label],
    });
  }

  const tenantSummaries = Array.from(grouped.values()).map((tenant) => ({
    tenantId: tenant.tenantId,
    slug: tenant.slug,
    name: tenant.name,
    labels: tenant.labels.map((label) => label.name),
    labelCount: tenant.labels.length,
  }));

  if (!APPLY) {
    const report = {
      mode: 'report',
      tenantCount: tenantSummaries.length,
      tenants: tenantSummaries,
    };
    if (JSON_OUTPUT) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Legacy triage label candidates: ${tenantSummaries.length} tenant(s)`);
      for (const tenant of tenantSummaries) {
        console.log(`- ${tenant.slug} (${tenant.labelCount}): ${tenant.labels.join(', ')}`);
      }
    }
    return;
  }

  const results: Array<{
    tenantId: string;
    slug: string;
    deletedLabels: number;
    touchedEmails: number;
    expiredAnalyses: number;
    deletedNames: string[];
  }> = [];

  for (const tenant of grouped.values()) {
    const deletedNames = tenant.labels.map((label) => label.name);
    const deletedIds = tenant.labels.map((label) => label.id);
    const affectedEmails = await prisma.email.findMany({
      where: {
        tenantId: tenant.tenantId,
        aiLabels: {
          hasSome: deletedNames,
        },
      },
      select: {
        id: true,
        tenantId: true,
        aiLabels: true,
      },
    });

    for (const email of affectedEmails) {
      const nextLabels = email.aiLabels.filter((label) => !deletedNames.includes(label));
      await prisma.email.update({
        where: {
          id_tenantId: {
            id: email.id,
            tenantId: email.tenantId,
          },
        },
        data: {
          aiLabels: nextLabels,
          aiPriority: null,
          aiPriorityReason: null,
          aiLane: null,
          aiIntent: null,
          aiActionability: null,
          isAutoTriaged: false,
          autoTriagedAt: null,
        },
      });
    }

    const expiredAnalyses = await prisma.emailAnalysis.updateMany({
      where: { tenantId: tenant.tenantId },
      data: { processedAt: new Date(0) },
    });

    const deleted = await prisma.userLabel.deleteMany({
      where: {
        tenantId: tenant.tenantId,
        id: { in: deletedIds },
      },
    });

    results.push({
      tenantId: tenant.tenantId,
      slug: tenant.slug,
      deletedLabels: deleted.count,
      touchedEmails: affectedEmails.length,
      expiredAnalyses: expiredAnalyses.count,
      deletedNames,
    });
  }

  const report = {
    mode: 'apply',
    tenantCount: results.length,
    tenants: results,
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Cleaned ${results.length} tenant(s)`);
    for (const result of results) {
      console.log(
        `- ${result.slug}: deleted=${result.deletedLabels}, emails=${result.touchedEmails}, analyses=${result.expiredAnalyses} :: ${result.deletedNames.join(', ')}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
