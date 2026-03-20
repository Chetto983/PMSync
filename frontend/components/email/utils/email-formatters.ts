import type { Email } from '@/lib/api/emails';
import type { SenderContactMap } from '@/lib/api/contacts';
import type { ThreadListItemData } from '@/components/email/list';
import { getAvatarUrl } from '@/lib/utils/gravatar';

/**
 * Extract email address from "Name <email@domain.com>" format
 */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  // If no brackets, treat the whole string as email
  return from.toLowerCase().trim();
}

/**
 * Format email data from API to ThreadListItemData
 */
export function formatEmailToThread(email: Email, senderPhotos?: SenderContactMap): ThreadListItemData {
  const senderEmail = extractEmailAddress(email.from);
  const senderInfo = senderPhotos?.[senderEmail];
  // Known contact = found in senderPhotos (even if no photo)
  const isKnownContact = !!senderInfo;

  return {
    id: email.id,
    from: email.from,
    subject: email.subject || '(No subject)',
    snippet: email.snippet || '',
    date: new Date(email.receivedAt).toLocaleDateString(),
    isUnread: !email.isRead,
    isFlagged: email.isFlagged || email.isStarred,
    hasAttachments: (email.attachments?.length ?? 0) > 0,
    providerId: email.providerId, // Provider ID for drag-and-drop validation
    folder: email.folder,
    avatarUrl: getAvatarUrl(senderEmail, senderInfo?.photoUrl, isKnownContact), // Contact photo > initials > Gravatar
    // Map emailLabels to the format expected by ThreadListItem
    // Backend returns el.label.id, not el.labelId
    labels: email.emailLabels?.map((el) => ({
      id: el.label?.id || '',
      name: el.label?.name || 'Label',
      color: el.label?.color?.backgroundColor || '#9E9E9E',
    })).filter((l) => l.id),
    // AI Auto-Triage fields (VoltAgent analysis results)
    aiPriority: email.aiPriority,
    aiSentiment: email.aiSentiment,
    aiLabels: email.aiLabels,
  };
}
