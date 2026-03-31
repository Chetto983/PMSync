import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const DEFAULT_AI_USER_LABELS: Array<{
  name: string;
  aiPrompt: string;
  color: { backgroundColor: string; textColor: string };
}> = [
  {
    name: 'Important',
    aiPrompt: 'Use for urgent or business-critical emails that require prompt attention.',
    color: { backgroundColor: '#FEE2E2', textColor: '#991B1B' },
  },
  {
    name: 'Follow-up',
    aiPrompt: 'Use when the message needs a reply later, a check-in, or a waiting-state reminder.',
    color: { backgroundColor: '#FEF3C7', textColor: '#92400E' },
  },
  {
    name: 'Action Items',
    aiPrompt: 'Use when the email contains concrete tasks, deliverables, approvals, or deadlines.',
    color: { backgroundColor: '#FFEDD5', textColor: '#9A3412' },
  },
  {
    name: 'Info',
    aiPrompt: 'Use for informational emails worth keeping that do not require action.',
    color: { backgroundColor: '#E0F2FE', textColor: '#075985' },
  },
  {
    name: 'Personal',
    aiPrompt: 'Use for personal conversations, relationship-building messages, or informal 1:1 emails.',
    color: { backgroundColor: '#DCFCE7', textColor: '#166534' },
  },
  {
    name: 'Finance',
    aiPrompt: 'Use for invoices, billing, payments, receipts, refunds, subscriptions, and money-related operations.',
    color: { backgroundColor: '#D1FAE5', textColor: '#065F46' },
  },
  {
    name: 'Promotions',
    aiPrompt: 'Use for marketing emails, sales offers, newsletters, discounts, and promotional campaigns.',
    color: { backgroundColor: '#FCE7F3', textColor: '#9D174D' },
  },
  {
    name: 'Updates',
    aiPrompt: 'Use for product updates, announcements, release notes, changelogs, system alerts, and GitHub/Vercel/Railway notifications.',
    color: { backgroundColor: '#E0E7FF', textColor: '#3730A3' },
  },
];

function slugifyLabel(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `label-${Date.now()}`;
}

export async function ensureDefaultUserLabels(prisma: PrismaService, tenantId: string): Promise<void> {
  const activeCount = await prisma.userLabel.count({
    where: { tenantId, isArchived: false },
  });

  if (activeCount > 0) {
    return;
  }

  await prisma.userLabel.createMany({
    data: DEFAULT_AI_USER_LABELS.map((label, index) => ({
      tenantId,
      name: label.name,
      slug: slugifyLabel(label.name),
      type: 'USER',
      color: label.color as Prisma.InputJsonValue,
      aiPrompt: label.aiPrompt,
      orderIndex: index,
      level: 0,
      parentId: null,
    })),
    skipDuplicates: true,
  });
}
