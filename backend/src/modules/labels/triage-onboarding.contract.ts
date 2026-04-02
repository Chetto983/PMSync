export interface TriageOnboardingRulesInput {
  customerDomains?: string[] | null;
  importantSenders?: string[] | null;
  projectTopics?: string[] | null;
  systemAlertSources?: string[] | null;
  billingTopics?: string[] | null;
  reviewLaterTopics?: string[] | null;
  followUpSlaHours?: number | null;
}

export interface TriageOnboardingRules {
  version: 'v1';
  customerDomains: string[];
  importantSenders: string[];
  projectTopics: string[];
  systemAlertSources: string[];
  billingTopics: string[];
  reviewLaterTopics: string[];
  followUpSlaHours: number | null;
}

export interface TriageOnboardingFieldDefinition {
  key: keyof Omit<TriageOnboardingRules, 'version'>;
  label: string;
  description: string;
  examples: string[];
  kind: 'list' | 'number';
}

export interface TriageLabelTaxonomyRule {
  name: string;
  family: 'priority' | 'workflow' | 'semantic' | 'suppression' | 'context';
  suppressesUrgency: boolean;
  mutuallyExclusiveWith: string[];
  allowedWith: string[];
  notes: string;
}

export interface TriageRecommendedLabel {
  name: string;
  slug: string;
  aiPrompt: string;
  rationale: string;
  family: TriageLabelTaxonomyRule['family'];
  color: { backgroundColor: string; textColor: string };
}

export interface TriageDerivedRule {
  type: 'domain' | 'sender' | 'keyword' | 'phrase';
  action:
    | 'important'
    | 'customer-vip'
    | 'system-alert'
    | 'review-later'
    | 'suppress'
    | 'billing'
    | 'follow-up';
  pattern: string;
  labelName?: string;
}

const LIST_LIMIT = 12;
const TEXT_LIMIT = 120;

export const TRIAGE_ONBOARDING_FIELDS: TriageOnboardingFieldDefinition[] = [
  {
    key: 'customerDomains',
    label: 'Customer domains',
    description: 'Domains that should make customer email stand out during triage.',
    examples: ['acme.com', 'contoso.it'],
    kind: 'list',
  },
  {
    key: 'importantSenders',
    label: 'Important senders',
    description: 'Specific people whose email should be handled with extra care.',
    examples: ['cto@acme.com', 'ops@railway.app'],
    kind: 'list',
  },
  {
    key: 'projectTopics',
    label: 'Projects or topics',
    description: 'Topics that usually imply active work, ownership, or deadlines.',
    examples: ['PMSync production deploy', 'customer migration'],
    kind: 'list',
  },
  {
    key: 'systemAlertSources',
    label: 'System alert sources',
    description: 'Sources that should be treated as operational alerts instead of generic updates.',
    examples: ['GitHub Actions', 'Railway deploy'],
    kind: 'list',
  },
  {
    key: 'billingTopics',
    label: 'Billing topics',
    description: 'Billing or finance phrases that deserve a dedicated label.',
    examples: ['invoice overdue', 'subscription renewal'],
    kind: 'list',
  },
  {
    key: 'reviewLaterTopics',
    label: 'Review later topics',
    description: 'Topics worth keeping visible without turning them into urgent work.',
    examples: ['weekly product digest', 'industry newsletter'],
    kind: 'list',
  },
  {
    key: 'followUpSlaHours',
    label: 'Follow-up timing',
    description: 'Default response target in hours when a thread truly needs follow-up.',
    examples: ['24', '48'],
    kind: 'number',
  },
];

export const TRIAGE_ONBOARDING_EXAMPLES = {
  customerRule:
    'Mark mail from acme.com or contoso.it as customer context. Prefer this over generic Info when the thread is commercial or operational.',
  systemAlertRule:
    'Treat GitHub Actions, Railway, and Vercel messages as System Alert. Keep them low urgency unless they describe a real failure, deadline, or blocked deployment.',
  billingRule:
    'Use Finance for invoices, overdue notices, payment confirmations, and subscription renewals. Do not make them Important unless there is urgency or customer impact.',
  reviewLaterRule:
    'Use Review Later for newsletters, product digests, and useful FYI updates that should stay available without creating follow-up.',
};

export const TRIAGE_LABEL_TAXONOMY: TriageLabelTaxonomyRule[] = [
  {
    name: 'Important',
    family: 'priority',
    suppressesUrgency: false,
    mutuallyExclusiveWith: ['Promotions'],
    allowedWith: ['Customer', 'Action Items', 'Finance', 'System Alert'],
    notes: 'Use for business-critical email that requires near-term attention.',
  },
  {
    name: 'Follow-up',
    family: 'workflow',
    suppressesUrgency: false,
    mutuallyExclusiveWith: ['Promotions', 'Review Later'],
    allowedWith: ['Action Items', 'Customer', 'Finance'],
    notes: 'Signals a revisit loop or waiting state. This is not a generic importance marker.',
  },
  {
    name: 'Action Items',
    family: 'workflow',
    suppressesUrgency: false,
    mutuallyExclusiveWith: ['Review Later'],
    allowedWith: ['Important', 'Customer', 'Finance', 'System Alert'],
    notes: 'Use when concrete work, approval, or deadline exists.',
  },
  {
    name: 'Customer',
    family: 'context',
    suppressesUrgency: false,
    mutuallyExclusiveWith: [],
    allowedWith: ['Important', 'Action Items', 'Follow-up', 'Finance'],
    notes: 'Marks customer-facing conversations and should bias score after label resolution.',
  },
  {
    name: 'System Alert',
    family: 'context',
    suppressesUrgency: true,
    mutuallyExclusiveWith: ['Promotions'],
    allowedWith: ['Important', 'Action Items', 'Updates'],
    notes: 'Operational alerts should stay distinct from generic updates and only escalate when action is explicit.',
  },
  {
    name: 'Finance',
    family: 'semantic',
    suppressesUrgency: false,
    mutuallyExclusiveWith: ['Promotions'],
    allowedWith: ['Important', 'Action Items', 'Follow-up', 'Customer'],
    notes: 'Billing and money flows often need special handling but not automatic urgency inflation.',
  },
  {
    name: 'Promotions',
    family: 'suppression',
    suppressesUrgency: true,
    mutuallyExclusiveWith: ['Important', 'Follow-up', 'Action Items', 'Customer'],
    allowedWith: ['Review Later'],
    notes: 'Marketing, sales offers, and newsletter-like traffic should be low urgency by default.',
  },
  {
    name: 'Updates',
    family: 'suppression',
    suppressesUrgency: true,
    mutuallyExclusiveWith: [],
    allowedWith: ['System Alert', 'Review Later'],
    notes: 'Routine product updates and passive notifications should not dominate action lanes.',
  },
  {
    name: 'Review Later',
    family: 'suppression',
    suppressesUrgency: true,
    mutuallyExclusiveWith: ['Important', 'Action Items', 'Follow-up'],
    allowedWith: ['Promotions', 'Updates'],
    notes: 'Useful FYI content that should remain discoverable without becoming urgent work.',
  },
];

export function normalizeTriageOnboardingRules(
  input: TriageOnboardingRulesInput,
): TriageOnboardingRules {
  return {
    version: 'v1',
    customerDomains: normalizeDomainList(input.customerDomains),
    importantSenders: normalizeEmailishList(input.importantSenders),
    projectTopics: normalizePhraseList(input.projectTopics),
    systemAlertSources: normalizePhraseList(input.systemAlertSources),
    billingTopics: normalizePhraseList(input.billingTopics),
    reviewLaterTopics: normalizePhraseList(input.reviewLaterTopics),
    followUpSlaHours: normalizeFollowUpSlaHours(input.followUpSlaHours),
  };
}

export function buildRecommendedLabelSet(
  rules: TriageOnboardingRules,
): TriageRecommendedLabel[] {
  const labels: TriageRecommendedLabel[] = [];

  if (rules.customerDomains.length > 0 || rules.importantSenders.length > 0) {
    labels.push({
      name: 'Customer',
      slug: 'customer',
      family: 'context',
      rationale: 'Customer context should be explicit before score and follow-up are decided.',
      color: { backgroundColor: '#DBEAFE', textColor: '#1D4ED8' },
      aiPrompt: buildCustomerPrompt(rules),
    });
  }

  if (rules.systemAlertSources.length > 0) {
    labels.push({
      name: 'System Alert',
      slug: 'system-alert',
      family: 'context',
      rationale: 'Operational alerts need a dedicated label that suppresses urgency unless action is explicit.',
      color: { backgroundColor: '#E0E7FF', textColor: '#3730A3' },
      aiPrompt: buildSystemAlertPrompt(rules),
    });
  }

  if (rules.reviewLaterTopics.length > 0) {
    labels.push({
      name: 'Review Later',
      slug: 'review-later',
      family: 'suppression',
      rationale: 'Useful FYI content should stay available without hijacking action views.',
      color: { backgroundColor: '#F3F4F6', textColor: '#374151' },
      aiPrompt: buildReviewLaterPrompt(rules),
    });
  }

  labels.push({
    name: 'Important',
    slug: 'important',
    family: 'priority',
    rationale: 'Important becomes safer when grounded in customer context and real business-critical signals.',
    color: { backgroundColor: '#FEE2E2', textColor: '#991B1B' },
    aiPrompt: buildImportantPrompt(rules),
  });

  labels.push({
    name: 'Action Items',
    slug: 'action-items',
    family: 'workflow',
    rationale: 'Action Items should capture real work, approvals, or deadlines.',
    color: { backgroundColor: '#FFEDD5', textColor: '#9A3412' },
    aiPrompt: buildActionItemsPrompt(rules),
  });

  labels.push({
    name: 'Follow-up',
    slug: 'follow-up',
    family: 'workflow',
    rationale: 'Follow-up must stay sparse and tied to explicit revisit or waiting states.',
    color: { backgroundColor: '#FEF3C7', textColor: '#92400E' },
    aiPrompt: buildFollowUpPrompt(rules),
  });

  labels.push({
    name: 'Finance',
    slug: 'finance',
    family: 'semantic',
    rationale: 'Billing traffic benefits from a dedicated semantic label before urgency is computed.',
    color: { backgroundColor: '#D1FAE5', textColor: '#065F46' },
    aiPrompt: buildFinancePrompt(rules),
  });

  labels.push({
    name: 'Updates',
    slug: 'updates',
    family: 'suppression',
    rationale: 'Routine updates must be clearly separated from operational action.',
    color: { backgroundColor: '#E0E7FF', textColor: '#3730A3' },
    aiPrompt: buildUpdatesPrompt(rules),
  });

  labels.push({
    name: 'Promotions',
    slug: 'promotions',
    family: 'suppression',
    rationale: 'Promotional traffic should be explicitly suppressed from urgent lanes.',
    color: { backgroundColor: '#FCE7F3', textColor: '#9D174D' },
    aiPrompt:
      'Use for marketing emails, sales offers, newsletters, discounts, and promotional campaigns. These are low priority by default and should not create follow-up.',
  });

  return labels;
}

export function buildDerivedTriageRules(
  rules: TriageOnboardingRules,
): TriageDerivedRule[] {
  const derived: TriageDerivedRule[] = [];

  for (const domain of rules.customerDomains) {
    derived.push({
      type: 'domain',
      action: 'customer-vip',
      pattern: domain,
    });
  }

  for (const sender of rules.importantSenders) {
    derived.push({
      type: 'sender',
      action: 'important',
      pattern: sender,
    });
  }

  for (const topic of rules.projectTopics) {
    derived.push({
      type: 'phrase',
      action: 'important',
      pattern: topic,
    });
  }

  for (const source of rules.systemAlertSources) {
    derived.push({
      type: 'phrase',
      action: 'system-alert',
      pattern: source,
    });
  }

  for (const topic of rules.billingTopics) {
    derived.push({
      type: 'phrase',
      action: 'billing',
      pattern: topic,
    });
  }

  for (const topic of rules.reviewLaterTopics) {
    derived.push({
      type: 'phrase',
      action: 'review-later',
      pattern: topic,
    });
  }

  if (rules.followUpSlaHours) {
    derived.push({
      type: 'phrase',
      action: 'follow-up',
      pattern: `follow-up target ${rules.followUpSlaHours} hours`,
    });
  }

  return derived;
}

function buildCustomerPrompt(rules: TriageOnboardingRules): string {
  const parts = [
    'Use for customer-facing conversations that come from known customer domains or explicitly important external senders.',
  ];
  if (rules.customerDomains.length > 0) {
    parts.push(`Customer domains: ${quoteList(rules.customerDomains)}.`);
  }
  if (rules.importantSenders.length > 0) {
    parts.push(`Important senders: ${quoteList(rules.importantSenders)}.`);
  }
  parts.push('Do not use for marketing mail, passive newsletters, or unrelated internal chatter.');
  return parts.join(' ');
}

function buildSystemAlertPrompt(rules: TriageOnboardingRules): string {
  const parts = [
    'Use for operational system notifications and service alerts from trusted tooling.',
  ];
  if (rules.systemAlertSources.length > 0) {
    parts.push(`Common sources: ${quoteList(rules.systemAlertSources)}.`);
  }
  if (rules.projectTopics.length > 0) {
    parts.push(`Projects/topics that may turn an alert into real work: ${quoteList(rules.projectTopics)}.`);
  }
  parts.push('Do not combine with Important unless the message describes a real failure, blocked deploy, deadline, or customer impact.');
  return parts.join(' ');
}

function buildReviewLaterPrompt(rules: TriageOnboardingRules): string {
  const parts = [
    'Use for useful FYI content that should remain visible without becoming urgent work.',
  ];
  if (rules.reviewLaterTopics.length > 0) {
    parts.push(`Common review-later topics: ${quoteList(rules.reviewLaterTopics)}.`);
  }
  parts.push('Do not use when the email asks for action, approval, or a reply.');
  return parts.join(' ');
}

function buildImportantPrompt(rules: TriageOnboardingRules): string {
  const parts = [
    'Use only for urgent or business-critical emails that require prompt attention.',
  ];
  if (rules.customerDomains.length > 0 || rules.importantSenders.length > 0) {
    parts.push('Customer context can increase priority, but only when the thread also contains a real ask, escalation, deadline, or business risk.');
  }
  if (rules.systemAlertSources.length > 0) {
    parts.push('System alerts are not automatically Important; only escalate when action or impact is explicit.');
  }
  parts.push('Do not use for routine notifications, release notes, newsletters, or passive alerts.');
  return parts.join(' ');
}

function buildActionItemsPrompt(rules: TriageOnboardingRules): string {
  const parts = [
    'Use when the email contains concrete tasks, deliverables, approvals, decisions, or deadlines that require someone to act.',
  ];
  if (rules.projectTopics.length > 0) {
    parts.push(`Project topics that often imply action: ${quoteList(rules.projectTopics)}.`);
  }
  parts.push('Do not use for FYI updates unless the email clearly asks for execution, approval, or ownership.');
  return parts.join(' ');
}

function buildFollowUpPrompt(rules: TriageOnboardingRules): string {
  const parts = [
    'Use only when the user should revisit the email later to reply, check in, or wait for a response.',
  ];
  if (rules.followUpSlaHours) {
    parts.push(`Default revisit target: ${rules.followUpSlaHours} hours when a real follow-up is needed.`);
  }
  parts.push('Do not use for passive informational notifications, newsletters, release notes, or updates without a real next step.');
  return parts.join(' ');
}

function buildFinancePrompt(rules: TriageOnboardingRules): string {
  const parts = [
    'Use for invoices, billing, payments, receipts, refunds, subscriptions, and money-related operations.',
  ];
  if (rules.billingTopics.length > 0) {
    parts.push(`Common billing topics: ${quoteList(rules.billingTopics)}.`);
  }
  parts.push('Do not mark finance mail as Important unless there is urgency, risk, or a time-sensitive action.');
  return parts.join(' ');
}

function buildUpdatesPrompt(rules: TriageOnboardingRules): string {
  const parts = [
    'Use for product updates, announcements, release notes, changelogs, passive system notifications, and routine tooling mail.',
  ];
  if (rules.systemAlertSources.length > 0) {
    parts.push(`If the sender/source is one of ${quoteList(rules.systemAlertSources)}, prefer System Alert over Updates when the message is operational.`);
  }
  if (rules.reviewLaterTopics.length > 0) {
    parts.push(`If the message matches ${quoteList(rules.reviewLaterTopics)}, Review Later may be a better fit than Updates.`);
  }
  parts.push('Do not combine with Important or Follow-up unless the email clearly requires action, a reply, or a real deadline.');
  return parts.join(' ');
}

function normalizeDomainList(values: string[] | null | undefined): string[] {
  return normalizeList(values, (value) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^@+/, '')
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, ''),
  );
}

function normalizeEmailishList(values: string[] | null | undefined): string[] {
  return normalizeList(values, (value) => value.trim().toLowerCase());
}

function normalizePhraseList(values: string[] | null | undefined): string[] {
  return normalizeList(values, (value) => value.trim());
}

function normalizeList(
  values: string[] | null | undefined,
  mapper: (value: string) => string,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    if (typeof raw !== 'string') {
      continue;
    }

    const normalized = mapper(raw).replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT);
    if (!normalized) {
      continue;
    }

    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    result.push(normalized);

    if (result.length >= LIST_LIMIT) {
      break;
    }
  }

  return result;
}

function normalizeFollowUpSlaHours(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  if (rounded < 4 || rounded > 240) {
    return null;
  }

  return rounded;
}

function quoteList(values: string[]): string {
  return values.map((value) => `"${value}"`).join(', ');
}
