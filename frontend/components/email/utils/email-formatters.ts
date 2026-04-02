import type { Email } from '@/lib/api/emails';
import type { SenderContactMap } from '@/lib/api/contacts';
import type { ThreadListItemData } from '@/components/email/list';
import type { ThreadMessageData } from '@/components/email/thread';
import { getAvatarUrl } from '@/lib/utils/gravatar';
import { formatDateInTz, formatDateTimeInTz } from '@/lib/utils/format-date-tz';
import { isValidHexColor } from '@/lib/label-colors';

/**
 * Extract email address from "Name <email@domain.com>" format.
 * Also handles malformed cases like missing closing > bracket.
 */
export function extractEmailAddress(from: string): string {
  // Standard: "Name" <email@domain.com>
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  // Malformed: missing closing > (e.g. "Name" <email@domain.com)
  const openMatch = from.match(/<([^<]+)$/);
  if (openMatch) return openMatch[1].toLowerCase().trim();
  // Fallback: extract anything that looks like an email
  const emailMatch = from.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (emailMatch) return emailMatch[0].toLowerCase();
  // Last resort: return trimmed string
  return from.toLowerCase().trim();
}

export function extractSenderDisplayName(from: string): string | null {
  const match = from.match(/^(.*)\s+<[^>]+>$/);
  if (!match) return null;
  const value = match[1]?.trim();
  return value ? value.replace(/^"|"$/g, '') : null;
}

/**
 * Format email data from API to ThreadListItemData
 */
export function formatEmailToThread(email: Email, senderPhotos?: SenderContactMap, timezone?: string, locale?: string): ThreadListItemData {
  const senderEmail = extractEmailAddress(email.from);
  const senderInfo = senderPhotos?.[senderEmail];
  // Known contact = found in senderPhotos (even if no photo)
  const isKnownContact = !!senderInfo;

  return {
    id: email.id,
    from: email.from,
    subject: email.subject || '(No subject)',
    snippet: email.snippet || '',
    date: timezone ? formatDateInTz(email.receivedAt, timezone, locale) : new Date(email.receivedAt).toLocaleDateString(),
    isUnread: !email.isRead,
    isFlagged: email.isFlagged || email.isStarred,
    hasAttachments: (email.attachments?.length ?? 0) > 0,
    providerId: email.providerId, // Provider ID for drag-and-drop validation
    folder: email.folder,
    avatarUrl: getAvatarUrl(senderEmail, senderInfo?.photoUrl, isKnownContact), // Contact photo > initials > Gravatar
    // Map emailLabels to the format expected by ThreadListItem
    // Backend returns el.label.id, not el.labelId
    labels: email.emailLabels?.map((el) => {
      const bg = el.label?.color?.backgroundColor;
      return {
        id: el.label?.id || '',
        name: el.label?.name || 'Label',
        color: bg && isValidHexColor(bg) ? bg : '#9E9E9E',
      };
    }).filter((l) => l.id),
    isDraft: email.isDraft,
    // AI Auto-Triage fields
    aiPriority: email.aiPriority,
    aiPriorityReason: email.aiPriorityReason,
    aiSentiment: email.aiSentiment,
    aiLabels: email.aiLabels,
    aiLane: email.aiLane,
    aiIntent: email.aiIntent,
    aiActionability: email.aiActionability,
    aiCategory: email.aiCategory,
  };
}

/**
 * Map Email from API to ThreadMessageData for ThreadView component
 */
export function mapEmailToThreadMessage(email: Email, timezone: string): ThreadMessageData {
  return {
    id: email.id,
    from: email.from,
    to: email.to || [],
    cc: email.cc,
    date: formatDateTimeInTz(email.receivedAt, timezone),
    subject: email.subject || '(No subject)',
    body: email.bodyHtml || email.bodyText || '',
    isUnread: !email.isRead,
    isFlagged: email.isFlagged || email.isStarred,
    hasAttachments: (email.attachments?.length ?? 0) > 0,
    attachments: email.attachments?.map((att) => ({
      id: att.id,
      name: att.filename,
      size: att.size,
    })),
    labels: email.emailLabels?.map((el) => {
      const bg = el.label?.color?.backgroundColor;
      return {
        id: el.label?.id || '',
        name: el.label?.name || 'Label',
        color: bg && isValidHexColor(bg) ? bg : '#9E9E9E',
      };
    }).filter((l) => l.id),
    aiCategory: email.aiCategory,
  };
}
