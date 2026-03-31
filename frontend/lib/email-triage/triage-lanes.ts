export type FollowUpType = 'WAITING_FOR' | 'TODO';

export type TriageLane =
  | 'action-now'
  | 'waiting-on-reply'
  | 'system-alerts'
  | 'review-later';

export interface TriageEmailCandidate {
  id: string;
  subject?: string | null;
  from?: string | { name?: string; email?: string } | null;
  aiPriority?: number | null;
  aiPriorityReason?: string | null;
  aiSentiment?: string | null;
  aiLabels?: string[] | null;
  isRead?: boolean;
}

export interface TriageFollowUpSignal {
  emailId: string;
  followUpType?: FollowUpType | null;
  dueDate?: string | null;
  status?: string | null;
  reason?: string | null;
}

export interface TriageLaneGroup<TEmail extends TriageEmailCandidate> {
  lane: TriageLane;
  items: Array<{ email: TEmail; followUp?: TriageFollowUpSignal }>;
}

const SYSTEM_ALERT_PATTERN = /\b(github|vercel|railway|deploy(ment)?|build failed|workflow|ci|incident|status page|uptime|monitoring|notification)\b/i;
const ACTION_PATTERN = /\b(urgent|asap|deadline|today|customer|client|complaint|invoice|payment|contract|proposal|approve|approval|review needed|action required)\b/i;

const LANE_ORDER: TriageLane[] = [
  'action-now',
  'waiting-on-reply',
  'system-alerts',
  'review-later',
];

function flattenFrom(from: TriageEmailCandidate['from']): string {
  if (!from) return '';
  if (typeof from === 'string') return from;
  return [from.name, from.email].filter(Boolean).join(' ');
}

function normalize(value: string | null | undefined): string {
  return String(value || '').toLowerCase();
}

function combinedEmailText(email: TriageEmailCandidate): string {
  return [
    email.subject,
    flattenFrom(email.from),
    email.aiPriorityReason,
    ...(email.aiLabels || []),
  ].filter(Boolean).join(' ');
}

export function isWeakBriefingSummary(summary?: string | null): boolean {
  const normalized = normalize(summary);
  if (!normalized) return true;
  return normalized.includes('unable to generate briefing') || normalized.includes('briefing at this time');
}

export function deriveTriageLane(
  email: TriageEmailCandidate,
  followUp?: TriageFollowUpSignal,
): TriageLane {
  const priority = email.aiPriority ?? 3;
  const text = combinedEmailText(email);

  if (followUp?.followUpType === 'WAITING_FOR') {
    return 'waiting-on-reply';
  }

  if (SYSTEM_ALERT_PATTERN.test(text)) {
    return 'system-alerts';
  }

  if (followUp?.followUpType === 'TODO') {
    return 'action-now';
  }

  if (priority <= 2 || email.aiSentiment === 'negative' || ACTION_PATTERN.test(text)) {
    return 'action-now';
  }

  return 'review-later';
}

export function groupEmailsByTriageLane<TEmail extends TriageEmailCandidate>(
  emails: TEmail[],
  followUps: TriageFollowUpSignal[] = [],
): TriageLaneGroup<TEmail>[] {
  const followUpByEmailId = new Map(followUps.map((followUp) => [followUp.emailId, followUp]));
  const grouped = new Map<TriageLane, Array<{ email: TEmail; followUp?: TriageFollowUpSignal }>>();

  for (const lane of LANE_ORDER) {
    grouped.set(lane, []);
  }

  for (const email of emails) {
    const followUp = followUpByEmailId.get(email.id);
    const lane = deriveTriageLane(email, followUp);
    grouped.get(lane)?.push({ email, followUp });
  }

  return LANE_ORDER.map((lane) => ({
    lane,
    items: grouped.get(lane) || [],
  }));
}

export function getLaneLabel(lane: TriageLane): string {
  switch (lane) {
    case 'action-now':
      return 'Action now';
    case 'waiting-on-reply':
      return 'Waiting on reply';
    case 'system-alerts':
      return 'System alerts';
    case 'review-later':
      return 'Review later';
  }
}

export function buildFallbackBriefingSummary(
  emails: TriageEmailCandidate[],
  followUps: TriageFollowUpSignal[] = [],
): string {
  const grouped = groupEmailsByTriageLane(emails, followUps);
  const counts = Object.fromEntries(grouped.map((group) => [group.lane, group.items.length])) as Record<TriageLane, number>;
  const fragments = [
    counts['action-now'] > 0 ? `${counts['action-now']} need action now` : null,
    counts['waiting-on-reply'] > 0 ? `${counts['waiting-on-reply']} are waiting on a reply` : null,
    counts['system-alerts'] > 0 ? `${counts['system-alerts']} are system alerts` : null,
  ].filter(Boolean);

  if (fragments.length === 0) {
    return 'Your triaged inbox is under control. Review later items remain, but nothing urgent is surfacing right now.';
  }

  return `Inbox summary: ${fragments.join(', ')}. Focus first on action items, then clear waiting threads and alerts.`;
}

export function buildFallbackHighlights(
  emails: TriageEmailCandidate[],
  followUps: TriageFollowUpSignal[] = [],
  limit = 3,
): string[] {
  const grouped = groupEmailsByTriageLane(emails, followUps);
  const highlights: string[] = [];

  for (const group of grouped) {
    for (const item of group.items) {
      if (highlights.length >= limit) break;
      const subject = item.email.subject || '(No subject)';
      const followUpNote = item.followUp?.followUpType === 'WAITING_FOR'
        ? 'waiting on reply'
        : item.followUp?.followUpType === 'TODO'
          ? 'follow-up due'
          : getLaneLabel(group.lane).toLowerCase();
      highlights.push(`${subject} — ${followUpNote}`);
    }
    if (highlights.length >= limit) break;
  }

  return highlights;
}

