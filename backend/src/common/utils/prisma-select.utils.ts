/**
 * Reusable Prisma `select` fragments.
 *
 * Centralises the field selections that were duplicated across
 * EmailCrudService, EmailSearchService, and AI chat tools.
 * Using `as const` + `satisfies` so Prisma still infers the return type.
 */
import { Prisma } from '@prisma/client';

/* ──────────────────── Attachment ──────────────────── */

export const attachmentListSelect = {
  id: true,
  filename: true,
  size: true,
  mimeType: true,
  isInline: true,
  contentId: true,
} as const satisfies Prisma.EmailAttachmentSelect;

/* ──────────────────── Email ──────────────────── */

/** Reusable emailLabels include fragment for all email queries. */
export const emailLabelsInclude = {
  emailLabels: {
    select: {
      label: {
        select: { id: true, name: true, color: true },
      },
    },
  },
} as const satisfies Pick<Prisma.EmailInclude, 'emailLabels'>;

/** emailLabels as a select fragment (for use inside `select:` blocks). */
export const emailLabelsSelect = {
  emailLabels: {
    select: {
      label: {
        select: { id: true, name: true, color: true },
      },
    },
  },
} as const satisfies Pick<Prisma.EmailSelect, 'emailLabels'>;

/** Minimal provider info included in email lists. */
export const emailProviderSelect = {
  id: true,
  email: true,
  providerType: true,
} as const satisfies Prisma.ProviderConfigSelect;

/** Fields returned for email list/search results. */
export const emailListSelect = {
  id: true,
  externalId: true,
  threadId: true,
  providerId: true,
  from: true,
  to: true,
  cc: true,
  bcc: true,
  subject: true,
  snippet: true,
  folder: true,
  labels: true,
  isRead: true,
  isStarred: true,
  isFlagged: true,
  isDraft: true,
  sentAt: true,
  receivedAt: true,
  size: true,
  aiPriority: true,
  aiPriorityReason: true,
  aiSentiment: true,
  aiLabels: true,
  isAutoTriaged: true,
  autoTriagedAt: true,
  attachments: { select: attachmentListSelect },
  ...emailLabelsSelect,
  provider: { select: emailProviderSelect },
} as const satisfies Prisma.EmailSelect;

/** Lighter select for search results (no cc/bcc/size/draft/labels). */
export const emailSearchSelect = {
  id: true,
  providerId: true,
  from: true,
  subject: true,
  snippet: true,
  receivedAt: true,
  isRead: true,
  aiPriority: true,
  aiSentiment: true,
  aiLabels: true,
  ...emailLabelsSelect,
} as const satisfies Prisma.EmailSelect;

/** Select for AI tool email reading (body + analysis). */
export const emailReadSelect = {
  id: true,
  subject: true,
  from: true,
  to: true,
  bodyText: true,
  bodyHtml: true,
  snippet: true,
  receivedAt: true,
} as const satisfies Prisma.EmailSelect;

/* ──────────────────── Contact ──────────────────── */

/** Minimal provider-contact info. */
export const providerContactListSelect = {
  id: true,
  providerId: true,
  externalId: true,
  provider: {
    select: { id: true, email: true, providerType: true },
  },
} as const satisfies Prisma.ProviderContactSelect;
