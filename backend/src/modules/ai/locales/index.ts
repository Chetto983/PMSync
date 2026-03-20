/**
 * VoltAgent Locales
 *
 * Centralized localization for VoltAgent.
 * To add a new language:
 * 1. Create a new file (e.g., de.ts for German)
 * 2. Copy en.ts as template
 * 3. Translate all strings
 * 4. Add to locales object below
 * 5. Add language code to SupportedLocale type
 */
import { en } from './en';
import { it } from './it';

// Re-export ALL types from types.ts for backward compatibility
export type {
  SupportedLocale,
  ToolTranslations,
  ObservabilityTranslations,
  ActionSummaryTranslations,
  MistralTranslations,
  DeadlineKeywordsTranslations,
  FollowUpTranslations,
  BriefingTranslations,
  ErrorTranslations,
  RouterPatternsTranslations,
  RolePatternsTranslations,
  VoltAgentTranslations,
} from './types';

import type {
  SupportedLocale,
  ToolTranslations,
  ActionSummaryTranslations,
  ObservabilityTranslations,
  DeadlineKeywordsTranslations,
  ErrorTranslations,
  RouterPatternsTranslations,
  RolePatternsTranslations,
  VoltAgentTranslations,
} from './types';

/**
 * All available locales
 */
export const locales: Record<SupportedLocale, VoltAgentTranslations> = {
  en,
  it,
};

/**
 * Get locale from user preferences or context
 */
export function getLocale(language?: string): SupportedLocale {
  if (!language) return 'en';
  const lang = language.toLowerCase();
  if (lang.startsWith('it')) return 'it';
  return 'en';
}

/**
 * Get translations for a specific locale
 */
export function getTranslations(locale: SupportedLocale): VoltAgentTranslations {
  return locales[locale] || locales.en;
}

/**
 * Get tool translations for a specific locale
 */
export function getToolTranslations(locale: SupportedLocale): ToolTranslations {
  return (locales[locale] || locales.en).tools;
}

/**
 * Get action summary translations for a specific locale
 */
export function getActionTranslations(locale: SupportedLocale): ActionSummaryTranslations {
  return (locales[locale] || locales.en).actions;
}

/**
 * Get observability translations for a specific locale
 */
export function getObservabilityTranslations(locale: SupportedLocale): ObservabilityTranslations {
  return (locales[locale] || locales.en).observability;
}

/**
 * Alias for getLocale (backward compatibility)
 */
export const resolveLocale = getLocale;

/**
 * Helper to format date for locale
 */
export function formatDateForLocale(date: Date, locale: SupportedLocale): string {
  return date.toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get deadline keywords for a specific locale
 */
export function getDeadlineKeywords(locale: SupportedLocale): DeadlineKeywordsTranslations {
  return (locales[locale] || locales.en).deadline;
}

/**
 * Get error translations for a specific locale
 */
export function getErrorTranslations(locale: SupportedLocale): ErrorTranslations {
  return (locales[locale] || locales.en).errors;
}

/**
 * Get router patterns for a specific locale (combined with English fallback)
 * Returns merged patterns from both locale and English for maximum coverage
 */
export function getRouterPatterns(locale: SupportedLocale): RouterPatternsTranslations {
  const localePatterns = (locales[locale] || locales.en).router;
  const enPatterns = locales.en.router;

  // Merge locale-specific patterns with English for comprehensive coverage
  if (locale === 'en') {
    return localePatterns;
  }

  return {
    writeOps: [...enPatterns.writeOps, ...localePatterns.writeOps],
    readOps: [...enPatterns.readOps, ...localePatterns.readOps],
    simple: [...enPatterns.simple, ...localePatterns.simple],
    complexitySimple: [...enPatterns.complexitySimple, ...localePatterns.complexitySimple],
    complexityModerate: [...enPatterns.complexityModerate, ...localePatterns.complexityModerate],
    complexityComplex: [...enPatterns.complexityComplex, ...localePatterns.complexityComplex],
  };
}

/**
 * Get contact role patterns for a specific locale (combined with English fallback)
 * Returns merged patterns from both locale and English for comprehensive coverage
 * Used by RelationshipIntelligenceService for smart role classification
 */
export function getRolePatterns(locale: SupportedLocale): RolePatternsTranslations {
  const localePatterns = (locales[locale] || locales.en).rolePatterns;
  const enPatterns = locales.en.rolePatterns;

  // Merge locale-specific patterns with English for comprehensive coverage
  if (locale === 'en') {
    return localePatterns;
  }

  return {
    executive: [...new Set([...enPatterns.executive, ...localePatterns.executive])],
    board: [...new Set([...enPatterns.board, ...localePatterns.board])],
    investor: [...new Set([...enPatterns.investor, ...localePatterns.investor])],
    engineering: [...new Set([...enPatterns.engineering, ...localePatterns.engineering])],
    sales: [...new Set([...enPatterns.sales, ...localePatterns.sales])],
    marketing: [...new Set([...enPatterns.marketing, ...localePatterns.marketing])],
    hr: [...new Set([...enPatterns.hr, ...localePatterns.hr])],
    legal: [...new Set([...enPatterns.legal, ...localePatterns.legal])],
    finance: [...new Set([...enPatterns.finance, ...localePatterns.finance])],
    support: [...new Set([...enPatterns.support, ...localePatterns.support])],
    advisor: [...new Set([...enPatterns.advisor, ...localePatterns.advisor])],
    vendor: [...new Set([...enPatterns.vendor, ...localePatterns.vendor])],
    customer: [...new Set([...enPatterns.customer, ...localePatterns.customer])],
    team: [...new Set([...enPatterns.team, ...localePatterns.team])],
  };
}

/**
 * Build regex pattern from locale role patterns
 * Combines all patterns for a role into a single RegExp
 */
export function buildRoleRegex(patterns: string[]): RegExp {
  const escapedPatterns = patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escapedPatterns.join('|')})\\b`, 'i');
}

/**
 * Convert string patterns to RegExp array
 */
export function patternsToRegex(patterns: string[]): RegExp[] {
  return patterns.map((p) => new RegExp(p, 'i'));
}

/**
 * Get locale instruction for agent prompts.
 * Returns instruction string to append to agent instructions for non-English locales.
 * Consolidates duplicated locale instruction pattern from agent files.
 */
export function getLocaleInstruction(locale: SupportedLocale): string {
  if (locale === 'en') return '';

  const languageNames: Record<SupportedLocale, string> = {
    en: 'English',
    it: 'Italian (italiano)',
  };

  return `\n\n## Response Language\nIMPORTANT: Respond in ${languageNames[locale]}.`;
}

// Legacy export for backward compatibility with action-executor.service.ts
export { actionSummaries } from './action-summaries';
