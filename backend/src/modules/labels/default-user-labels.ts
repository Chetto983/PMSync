import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface DefaultLabelDef {
  name: string;
  aiPrompt: string;
  color: { backgroundColor: string; textColor: string };
  category: 'workflow' | 'semantic' | 'suppression' | 'custom';
  suppressUrgency: boolean;
  mutuallyExclusiveWith: string[];
  defaultLane: string | null;
}

export const DEFAULT_AI_USER_LABELS: DefaultLabelDef[] = [
  {
    name: 'Important',
    aiPrompt: 'Use only for urgent or business-critical emails that require prompt attention. Do not use for routine notifications, release notes, newsletters, or passive alerts.',
    color: { backgroundColor: '#FEE2E2', textColor: '#991B1B' },
    category: 'workflow',
    suppressUrgency: false,
    mutuallyExclusiveWith: [],
    defaultLane: 'action-now',
  },
  {
    name: 'Follow-up',
    aiPrompt: 'Use only when the user should revisit the email later to reply, check in, or wait for a response. Do not use for passive informational notifications.',
    color: { backgroundColor: '#FEF3C7', textColor: '#92400E' },
    category: 'workflow',
    suppressUrgency: false,
    mutuallyExclusiveWith: [],
    defaultLane: 'waiting-on-reply',
  },
  {
    name: 'Action Items',
    aiPrompt: 'Use when the email contains concrete tasks, deliverables, approvals, or deadlines that require someone to act.',
    color: { backgroundColor: '#FFEDD5', textColor: '#9A3412' },
    category: 'workflow',
    suppressUrgency: false,
    mutuallyExclusiveWith: [],
    defaultLane: 'action-now',
  },
  {
    name: 'Info',
    aiPrompt: 'Use for informational emails worth keeping that do not require action.',
    color: { backgroundColor: '#E0F2FE', textColor: '#075985' },
    category: 'semantic',
    suppressUrgency: false,
    mutuallyExclusiveWith: [],
    defaultLane: 'review-later',
  },
  {
    name: 'Personal',
    aiPrompt: 'Use for personal conversations, relationship-building messages, or informal 1:1 emails.',
    color: { backgroundColor: '#DCFCE7', textColor: '#166534' },
    category: 'semantic',
    suppressUrgency: false,
    mutuallyExclusiveWith: [],
    defaultLane: null,
  },
  {
    name: 'Finance',
    aiPrompt: 'Use for invoices, billing, payments, receipts, refunds, subscriptions, and money-related operations.',
    color: { backgroundColor: '#D1FAE5', textColor: '#065F46' },
    category: 'semantic',
    suppressUrgency: false,
    mutuallyExclusiveWith: [],
    defaultLane: null,
  },
  {
    name: 'Promotions',
    aiPrompt: 'Use for marketing emails, sales offers, newsletters, discounts, and promotional campaigns. These are usually low priority and do not need follow-up.',
    color: { backgroundColor: '#FCE7F3', textColor: '#9D174D' },
    category: 'suppression',
    suppressUrgency: true,
    mutuallyExclusiveWith: ['Important', 'Action Items'],
    defaultLane: 'review-later',
  },
  {
    name: 'Updates',
    aiPrompt: 'Use for product updates, announcements, release notes, changelogs, system alerts, and GitHub/Vercel/Railway notifications. Do not combine with Important or Follow-up unless the email clearly requires action, a reply, or a real deadline.',
    color: { backgroundColor: '#E0E7FF', textColor: '#3730A3' },
    category: 'suppression',
    suppressUrgency: true,
    mutuallyExclusiveWith: ['Important'],
    defaultLane: 'system-alerts',
  },
  {
    name: 'Customer',
    aiPrompt: 'Use for emails from known customers, clients, or accounts. Includes support requests, account inquiries, and business correspondence from paying or prospective customers.',
    color: { backgroundColor: '#FDF4FF', textColor: '#6B21A8' },
    category: 'semantic',
    suppressUrgency: false,
    mutuallyExclusiveWith: [],
    defaultLane: 'customer-vip',
  },
  {
    name: 'System Alert',
    aiPrompt: 'Use for automated system notifications: CI/CD failures, monitoring alerts, deployment notices, error reports from GitHub, Vercel, Railway, Sentry, etc. Only mark as Important if it describes an active outage or incident.',
    color: { backgroundColor: '#FEF9C3', textColor: '#854D0E' },
    category: 'suppression',
    suppressUrgency: true,
    mutuallyExclusiveWith: [],
    defaultLane: 'system-alerts',
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
      category: label.category,
      suppressUrgency: label.suppressUrgency,
      mutuallyExclusiveWith: label.mutuallyExclusiveWith,
      defaultLane: label.defaultLane,
      orderIndex: index,
      level: 0,
      parentId: null,
    })),
    skipDuplicates: true,
  });
}
