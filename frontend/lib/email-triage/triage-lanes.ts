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

type TriageLocale = 'en' | 'it';

const SYSTEM_ALERT_PATTERN = /\b(github|vercel|railway|deploy(ment)?|build failed|workflow|ci|incident|status page|uptime|monitoring|notification)\b/i;
const ACTION_PATTERN = /\b(urgent|asap|deadline|today|customer|client|complaint|invoice|payment|contract|proposal|approve|approval|review needed|action required)\b/i;

const LANE_ORDER: TriageLane[] = [
  'action-now',
  'waiting-on-reply',
  'system-alerts',
  'review-later',
];

const TRIAGE_COPY: Record<TriageLocale, {
  laneLabels: Record<TriageLane, string>;
  summary: {
    actionNow: (count: number) => string;
    waitingOnReply: (count: number) => string;
    systemAlerts: (count: number) => string;
    idle: string;
    intro: (fragments: string[]) => string;
  };
  highlights: {
    waitingOnReply: string;
    followUpDue: string;
    byLane: Record<TriageLane, string>;
  };
}> = {
  en: {
    laneLabels: {
      'action-now': 'Action now',
      'waiting-on-reply': 'Waiting on reply',
      'system-alerts': 'System alerts',
      'review-later': 'Review later',
    },
    summary: {
      actionNow: (count) => `${count} need action now`,
      waitingOnReply: (count) => `${count} are waiting on a reply`,
      systemAlerts: (count) => `${count} are system alerts`,
      idle: 'Your triaged inbox is under control. Review later items remain, but nothing urgent is surfacing right now.',
      intro: (fragments) => `Inbox summary: ${fragments.join(', ')}. Focus first on action items, then clear waiting threads and alerts.`,
    },
    highlights: {
      waitingOnReply: 'waiting on reply',
      followUpDue: 'follow-up due',
      byLane: {
        'action-now': 'action now',
        'waiting-on-reply': 'waiting on reply',
        'system-alerts': 'system alerts',
        'review-later': 'review later',
      },
    },
  },
  it: {
    laneLabels: {
      'action-now': 'Da fare subito',
      'waiting-on-reply': 'In attesa di risposta',
      'system-alerts': 'Avvisi di sistema',
      'review-later': 'Rivedi dopo',
    },
    summary: {
      actionNow: (count) => `${count} richiedono azione subito`,
      waitingOnReply: (count) => `${count} sono in attesa di risposta`,
      systemAlerts: (count) => `${count} sono avvisi di sistema`,
      idle: 'La tua inbox triagiata è sotto controllo. Restano elementi da rivedere più tardi, ma nulla di urgente sta emergendo adesso.',
      intro: (fragments) => `Riepilogo inbox: ${fragments.join(', ')}. Parti prima dagli elementi operativi, poi smaltisci attese e avvisi.`,
    },
    highlights: {
      waitingOnReply: 'in attesa di risposta',
      followUpDue: 'follow-up in scadenza',
      byLane: {
        'action-now': 'da fare subito',
        'waiting-on-reply': 'in attesa di risposta',
        'system-alerts': 'avvisi di sistema',
        'review-later': 'rivedi dopo',
      },
    },
  },
};

function flattenFrom(from: TriageEmailCandidate['from']): string {
  if (!from) return '';
  if (typeof from === 'string') return from;
  return [from.name, from.email].filter(Boolean).join(' ');
}

function normalize(value: string | null | undefined): string {
  return String(value || '').toLowerCase();
}

function resolveTriageLocale(locale?: string | null): TriageLocale {
  return String(locale || '').toLowerCase().startsWith('it') ? 'it' : 'en';
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
  return [
    'unable to generate briefing',
    'briefing at this time',
    'impossibile generare il briefing',
    'briefing non disponibile',
  ].some((fragment) => normalized.includes(fragment));
}

/**
 * @deprecated Lanes are now computed server-side and stored in Email.aiLane.
 * Use the `lane` query param on GET /emails or `useLaneCounts()` hook instead.
 * Kept for backward compatibility with existing callers.
 */
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

export function getLaneLabel(lane: TriageLane, locale?: string): string {
  return TRIAGE_COPY[resolveTriageLocale(locale)].laneLabels[lane];
}

export function buildFallbackBriefingSummary(
  emails: TriageEmailCandidate[],
  followUps: TriageFollowUpSignal[] = [],
  locale?: string,
): string {
  const copy = TRIAGE_COPY[resolveTriageLocale(locale)];
  const grouped = groupEmailsByTriageLane(emails, followUps);
  const counts = Object.fromEntries(grouped.map((group) => [group.lane, group.items.length])) as Record<TriageLane, number>;
  const fragments = [
    counts['action-now'] > 0 ? copy.summary.actionNow(counts['action-now']) : null,
    counts['waiting-on-reply'] > 0 ? copy.summary.waitingOnReply(counts['waiting-on-reply']) : null,
    counts['system-alerts'] > 0 ? copy.summary.systemAlerts(counts['system-alerts']) : null,
  ].filter(Boolean) as string[];

  if (fragments.length === 0) {
    return copy.summary.idle;
  }

  return copy.summary.intro(fragments);
}

export function buildFallbackHighlights(
  emails: TriageEmailCandidate[],
  followUps: TriageFollowUpSignal[] = [],
  limit = 3,
  locale?: string,
): string[] {
  const copy = TRIAGE_COPY[resolveTriageLocale(locale)];
  const grouped = groupEmailsByTriageLane(emails, followUps);
  const highlights: string[] = [];

  for (const group of grouped) {
    for (const item of group.items) {
      if (highlights.length >= limit) break;
      const subject = item.email.subject || '(No subject)';
      const followUpNote = item.followUp?.followUpType === 'WAITING_FOR'
        ? copy.highlights.waitingOnReply
        : item.followUp?.followUpType === 'TODO'
          ? copy.highlights.followUpDue
          : copy.highlights.byLane[group.lane];
      highlights.push(`${subject} - ${followUpNote}`);
    }
    if (highlights.length >= limit) break;
  }

  return highlights;
}
