export type EmailAiLocale = 'en' | 'it';

const DEFAULT_LABEL_DISPLAY: Record<EmailAiLocale, Record<string, string>> = {
  en: {
    Important: 'Important',
    'Follow-up': 'Follow-up',
    'Action Items': 'Action Items',
    Info: 'Info',
    Personal: 'Personal',
    Finance: 'Finance',
    Promotions: 'Promotions',
    Updates: 'Updates',
  },
  it: {
    Important: 'Importante',
    'Follow-up': 'Follow-up',
    'Action Items': 'Azioni da fare',
    Info: 'Info',
    Personal: 'Personale',
    Finance: 'Finanza',
    Promotions: 'Promozioni',
    Updates: 'Aggiornamenti',
  },
};

const PANEL_TITLE_COPY: Record<EmailAiLocale, { insights: string; summary: string }> = {
  en: {
    insights: 'AI Insights',
    summary: 'AI Summary',
  },
  it: {
    insights: 'Insight AI',
    summary: 'Riepilogo AI',
  },
};

const ENGLISH_AI_REASON_PATTERN =
  /\b(the|reports|requires|attention|priority|system|alert|actionable|formal|tone|context|support|critical|issue|deployment|workflow|summary|immediate)\b/gi;

type ReasonInput = {
  priority?: number | null;
  priorityReason?: string | null;
  sentiment?: string | null;
  labels?: string[] | null;
  locale?: string | null;
};

export function resolveEmailAiLocale(locale?: string | null): EmailAiLocale {
  return String(locale || '').toLowerCase().startsWith('it') ? 'it' : 'en';
}

export function localizeAiLabel(label: string, locale?: string | null): string {
  const resolvedLocale = resolveEmailAiLocale(locale);
  return DEFAULT_LABEL_DISPLAY[resolvedLocale][label] || label;
}

export function getAiPanelTitle(hasTriageInsight: boolean, locale?: string | null): string {
  const resolvedLocale = resolveEmailAiLocale(locale);
  return hasTriageInsight
    ? PANEL_TITLE_COPY[resolvedLocale].insights
    : PANEL_TITLE_COPY[resolvedLocale].summary;
}

export function getLocalizedAiReason({
  priority,
  priorityReason,
  sentiment,
  labels,
  locale,
}: ReasonInput): string | null {
  const resolvedLocale = resolveEmailAiLocale(locale);
  const trimmedReason = priorityReason?.trim();

  if (trimmedReason && !shouldReplaceStoredReason(trimmedReason, resolvedLocale)) {
    return trimmedReason;
  }

  return buildFallbackReason({ priority, sentiment, labels, locale: resolvedLocale });
}

function shouldReplaceStoredReason(reason: string, locale: EmailAiLocale): boolean {
  if (locale !== 'it') {
    return false;
  }

  const englishHits = reason.match(ENGLISH_AI_REASON_PATTERN)?.length || 0;
  return englishHits >= 2;
}

function buildFallbackReason({
  priority,
  sentiment,
  labels,
  locale,
}: {
  priority?: number | null;
  sentiment?: string | null;
  labels?: string[] | null;
  locale: EmailAiLocale;
}): string | null {
  const normalizedLabels = (labels || []).map((label) => String(label));

  const priorityFragment = getPriorityFragment(priority, locale);
  const labelFragment = getLabelReason(normalizedLabels, locale);
  const sentimentFragment = getSentimentFragment(sentiment, locale);

  const fragments = [priorityFragment, labelFragment, sentimentFragment].filter(Boolean);
  if (fragments.length === 0) {
    return null;
  }

  if (locale === 'it') {
    return `Questa email ${fragments.join(' ')}.`;
  }

  return `This email ${fragments.join(' ')}.`;
}

function getPriorityFragment(priority?: number | null, locale: EmailAiLocale = 'en'): string | null {
  if (priority == null) {
    return locale === 'it' ? 'merita una revisione' : 'deserves review';
  }

  if (priority <= 2) {
    return locale === 'it' ? 'è classificata come alta priorità' : 'is classified as high priority';
  }

  if (priority === 3) {
    return locale === 'it' ? 'è classificata come priorità media' : 'is classified as medium priority';
  }

  return locale === 'it' ? 'è classificata come priorità bassa' : 'is classified as low priority';
}

function getLabelReason(labels: string[], locale: EmailAiLocale): string | null {
  if (labels.includes('Updates')) {
    return locale === 'it'
      ? 'perché sembra un aggiornamento o un avviso di sistema'
      : 'because it looks like a system update or alert';
  }

  if (labels.includes('Action Items')) {
    return locale === 'it'
      ? 'perché contiene attività concrete, approvazioni o scadenze'
      : 'because it contains concrete tasks, approvals, or deadlines';
  }

  if (labels.includes('Follow-up')) {
    return locale === 'it'
      ? 'perché richiede un follow-up'
      : 'because it requires follow-up';
  }

  if (labels.includes('Important')) {
    return locale === 'it'
      ? 'perché richiede attenzione rapida'
      : 'because it needs prompt attention';
  }

  if (labels.includes('Finance')) {
    return locale === 'it'
      ? 'perché riguarda fatture, pagamenti o temi amministrativi'
      : 'because it concerns billing, payments, or finance topics';
  }

  if (labels.includes('Promotions')) {
    return locale === 'it'
      ? 'perché ha un contenuto promozionale'
      : 'because it appears promotional';
  }

  if (labels.includes('Personal')) {
    return locale === 'it'
      ? 'perché sembra una conversazione personale'
      : 'because it appears personal';
  }

  if (labels.includes('Info')) {
    return locale === 'it'
      ? 'perché è principalmente informativa'
      : 'because it is mainly informational';
  }

  return null;
}

function getSentimentFragment(sentiment?: string | null, locale: EmailAiLocale = 'en'): string | null {
  switch (sentiment) {
    case 'negative':
      return locale === 'it' ? 'e il tono è critico' : 'and the tone is critical';
    case 'mixed':
      return locale === 'it' ? 'con un tono misto' : 'with a mixed tone';
    case 'positive':
      return locale === 'it' ? 'con un tono positivo' : 'with a positive tone';
    default:
      return null;
  }
}
