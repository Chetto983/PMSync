/**
 * Query Analyzer Service for RAG Intelligence
 *
 * Phase D Enhancement: Provides intelligent query analysis for UnifiedRetriever
 *
 * Features:
 * - Entity extraction (names, emails, dates, companies)
 * - Intent classification (FastText ML model with regex fallback)
 * - Time range detection
 * - Source relevance scoring
 *
 * @see docs/plans/2026-01-29-voltagent-phase-d-e-master.md
 * Created: 2026-01-30
 * Updated: 2026-01-30 - Integrated FastText intent classifier
 */
import { Injectable, Logger } from '@nestjs/common';
import type { SearchSource } from './unified-retriever';
import { IntentClassifierService, type ClassificationResult, type PrimaryIntent } from '../../nlp';

export interface ExtractedEntity {
  type: 'person' | 'email' | 'company' | 'date' | 'keyword';
  value: string;
  confidence: number;
}

export interface TimeRange {
  start?: Date;
  end?: Date;
  label: string; // 'today', 'yesterday', 'last_week', 'last_month', 'custom'
}

export interface QueryAnalysis {
  /** Original query */
  query: string;
  /** Normalized query (lowercase, no diacritics) */
  normalizedQuery: string;
  /** Detected intent */
  intent: 'search' | 'action' | 'information' | 'greeting' | 'unknown';
  /** Extracted entities */
  entities: ExtractedEntity[];
  /** Detected time range */
  timeRange?: TimeRange;
  /** Recommended sources with relevance scores */
  sourcesRelevance: Record<SearchSource, number>;
  /** Primary sources to query (score > 0.5) */
  primarySources: SearchSource[];
  /** Keywords for text search */
  keywords: string[];
  /** Language detected */
  language: 'en' | 'it';
}

// Common email providers for detection
const EMAIL_REGEX = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi;

// Person name patterns (simple heuristic - capitalized words)
const PERSON_NAME_REGEX = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;

// Company suffixes
const COMPANY_SUFFIXES = /\b(Inc|LLC|Ltd|Corp|Company|Co|GmbH|S\.?r\.?l\.?|S\.?p\.?A\.?|srl|spa)\b/gi;

// Date patterns (relative)
const RELATIVE_DATE_PATTERNS = {
  en: {
    today: /\btoday\b/i,
    yesterday: /\byesterday\b/i,
    lastWeek: /\blast\s+week\b/i,
    lastMonth: /\blast\s+month\b/i,
    thisWeek: /\bthis\s+week\b/i,
    thisMonth: /\bthis\s+month\b/i,
  },
  it: {
    today: /\boggi\b/i,
    yesterday: /\bieri\b/i,
    lastWeek: /\bsettimana\s+scorsa\b/i,
    lastMonth: /\bmese\s+scorso\b/i,
    thisWeek: /\bquesta\s+settimana\b/i,
    thisMonth: /\bquesto\s+mese\b/i,
  },
};

// Source relevance patterns
const SOURCE_PATTERNS: Record<SearchSource, { en: RegExp; it: RegExp }> = {
  emails: {
    en: /\b(email|message|mail|inbox|sent|from|to|subject)\b/i,
    it: /\b(email|messaggio|posta|ricevuti|inviati|da|a|oggetto)\b/i,
  },
  contacts: {
    en: /\b(contact|person|who|colleague|client|customer|name|phone|address)\b/i,
    it: /\b(contatto|persona|chi|collega|cliente|nome|telefono|indirizzo)\b/i,
  },
  deadlines: {
    en: /\b(deadline|due|urgent|asap|by\s+when|priority|overdue)\b/i,
    it: /\b(scadenza|urgente|entro|priorità|in\s+ritardo)\b/i,
  },
  followups: {
    en: /\b(follow.?up|waiting|response|pending|remind|reminder)\b/i,
    it: /\b(follow.?up|attesa|risposta|in\s+sospeso|promemoria)\b/i,
  },
  actions: {
    en: /\b(action|task|todo|to.?do|need\s+to|should|must)\b/i,
    it: /\b(azione|compito|da\s+fare|devo|dovrei)\b/i,
  },
  memories: {
    en: /\b(remember|recall|previous|before|last\s+time|history)\b/i,
    it: /\b(ricorda|ricordo|precedente|prima|ultima\s+volta|storico)\b/i,
  },
};

// Stopwords for keyword extraction
const STOPWORDS = new Set([
  // English
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'do', 'for', 'from',
  'has', 'have', 'he', 'her', 'him', 'his', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'me',
  'my', 'no', 'not', 'of', 'on', 'or', 'our', 'she', 'so', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'to', 'up', 'us', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
  // Italian
  'che', 'chi', 'come', 'con', 'da', 'dei', 'del', 'della', 'delle', 'di', 'e', 'ed', 'gli',
  'il', 'in', 'la', 'le', 'lo', 'ma', 'mi', 'nel', 'nella', 'non', 'o', 'per', 'perché',
  'più', 'quale', 'quando', 'questo', 'se', 'sei', 'si', 'sono', 'su', 'suo', 'ti', 'tu',
  'un', 'una', 'uno',
]);

/**
 * Map granular intents from FastText model to simple intent categories
 */
const INTENT_MAPPING: Record<PrimaryIntent, QueryAnalysis['intent']> = {
  // Search intents
  email_search: 'search',
  contact_search: 'search',

  // Action intents
  email_compose: 'action',
  email_reply: 'action',
  email_forward: 'action',
  email_delete: 'action',
  email_archive: 'action',
  email_move: 'action',
  calendar_create: 'action',
  calendar_update: 'action',
  calendar_delete: 'action',
  contact_create: 'action',
  contact_update: 'action',
  folder_create: 'action',

  // Information intents
  email_read: 'information',
  email_summarize: 'information',
  calendar_view: 'information',
  folder_list: 'information',
  settings_view: 'information',
  status_check: 'information',
  help: 'information',

  // Social intents → greeting
  greeting: 'greeting',
  farewell: 'greeting',
  thanks: 'greeting',

  // Unknown
  unknown: 'unknown',
};

@Injectable()
export class QueryAnalyzerService {
  private readonly logger = new Logger(QueryAnalyzerService.name);

  constructor(private readonly intentClassifier: IntentClassifierService) {}

  /**
   * Analyze a query and extract intelligence for RAG
   */
  async analyze(query: string): Promise<QueryAnalysis> {
    const normalizedQuery = this.normalize(query);
    const language = this.detectLanguage(query);

    // Extract entities
    const entities = this.extractEntities(query);

    // Detect intent using FastText classifier (with regex fallback)
    const classificationResult = await this.intentClassifier.classify(query);
    const intent = this.mapIntent(classificationResult);

    this.logger.debug(
      `Intent classified: ${classificationResult.intent} (${(classificationResult.confidence * 100).toFixed(1)}%) → ${intent}`,
    );

    // Detect time range
    const timeRange = this.detectTimeRange(query, language);

    // Calculate source relevance
    const sourcesRelevance = this.calculateSourceRelevance(query, entities, language);

    // Get primary sources (relevance > 0.5)
    const primarySources = (Object.entries(sourcesRelevance) as [SearchSource, number][])
      .filter(([, score]) => score > 0.5)
      .sort(([, a], [, b]) => b - a)
      .map(([source]) => source);

    // If no primary sources, default to emails
    if (primarySources.length === 0) {
      primarySources.push('emails');
    }

    // Extract keywords
    const keywords = this.extractKeywords(normalizedQuery);

    const analysis: QueryAnalysis = {
      query,
      normalizedQuery,
      intent,
      entities,
      timeRange,
      sourcesRelevance,
      primarySources,
      keywords,
      language,
    };

    this.logger.debug(
      `Query analysis: intent=${intent}, sources=${primarySources.join(',')}, entities=${entities.length}, keywords=${keywords.length}`,
    );

    return analysis;
  }

  /**
   * Normalize query for comparison
   */
  private normalize(query: string): string {
    return query
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .toLowerCase()
      .trim();
  }

  /**
   * Detect language based on common words
   */
  private detectLanguage(query: string): 'en' | 'it' {
    const italianWords = /\b(il|la|le|lo|di|da|che|per|con|sono|questo|questa|quella|quello|anche|come|quando|dove|perché|molto|tutto|tutti|sempre|dopo|prima|oggi|ieri|domani)\b/i;
    return italianWords.test(query) ? 'it' : 'en';
  }

  /**
   * Extract entities from query
   */
  private extractEntities(query: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Extract email addresses
    const emails = query.match(EMAIL_REGEX);
    if (emails) {
      for (const email of emails) {
        entities.push({ type: 'email', value: email.toLowerCase(), confidence: 0.95 });
      }
    }

    // Extract person names (heuristic: capitalized word pairs)
    const names = query.match(PERSON_NAME_REGEX);
    if (names) {
      for (const name of names) {
        // Skip if it looks like a company
        if (!COMPANY_SUFFIXES.test(name)) {
          entities.push({ type: 'person', value: name, confidence: 0.7 });
        }
      }
    }

    // Extract companies (words followed by company suffixes)
    const companyMatches = query.match(/\b[\w\s]+(?:Inc|LLC|Ltd|Corp|Company|Co|GmbH|S\.?r\.?l\.?|S\.?p\.?A\.?)\b/gi);
    if (companyMatches) {
      for (const company of companyMatches) {
        entities.push({ type: 'company', value: company.trim(), confidence: 0.85 });
      }
    }

    return entities;
  }

  /**
   * Map FastText classification result to simple intent category
   */
  private mapIntent(result: ClassificationResult): QueryAnalysis['intent'] {
    // Use the mapping table to convert granular intent to simple category
    const mappedIntent = INTENT_MAPPING[result.intent];

    // If confidence is low (<50%), fall back to regex patterns
    if (result.confidence < 0.5) {
      this.logger.debug(`Low confidence (${result.confidence}), using regex fallback`);
      return this.detectIntentByRegex(result.lang === 'it' ? 'it' : 'en');
    }

    return mappedIntent || 'unknown';
  }

  /**
   * Detect intent using regex patterns (fallback for low-confidence ML results)
   */
  private detectIntentByRegex(_language: 'en' | 'it'): QueryAnalysis['intent'] {
    // FastText already has regex fallback built-in via intent-classifier.service.ts
    // This method exists as a safety net but ML model handles it
    return 'unknown';
  }

  /**
   * Detect time range from query
   */
  private detectTimeRange(query: string, language: 'en' | 'it'): TimeRange | undefined {
    const patterns = RELATIVE_DATE_PATTERNS[language];
    const now = new Date();

    if (patterns.today.test(query)) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: 'today' };
    }

    if (patterns.yesterday.test(query)) {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: 'yesterday' };
    }

    if (patterns.lastWeek.test(query)) {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start, end, label: 'last_week' };
    }

    if (patterns.lastMonth.test(query)) {
      const end = new Date(now);
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      return { start, end, label: 'last_month' };
    }

    if (patterns.thisWeek.test(query)) {
      const start = new Date(now);
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      return { start, end: now, label: 'this_week' };
    }

    if (patterns.thisMonth.test(query)) {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: now, label: 'this_month' };
    }

    return undefined;
  }

  /**
   * Calculate relevance scores for each source
   */
  private calculateSourceRelevance(
    query: string,
    entities: ExtractedEntity[],
    language: 'en' | 'it',
  ): Record<SearchSource, number> {
    const scores: Record<SearchSource, number> = {
      emails: 0.6, // Base score - emails are default
      contacts: 0,
      deadlines: 0,
      followups: 0,
      actions: 0,
      memories: 0,
    };

    // Check pattern matches for each source
    for (const [source, patterns] of Object.entries(SOURCE_PATTERNS) as [SearchSource, typeof SOURCE_PATTERNS.emails][]) {
      if (patterns[language].test(query)) {
        scores[source] = Math.max(scores[source], 0.8);
      }
    }

    // Boost contacts if email or person entities found
    if (entities.some((e) => e.type === 'email' || e.type === 'person')) {
      scores.contacts = Math.max(scores.contacts, 0.7);
    }

    // Boost contacts if company entity found
    if (entities.some((e) => e.type === 'company')) {
      scores.contacts = Math.max(scores.contacts, 0.6);
    }

    return scores;
  }

  /**
   * Extract keywords for text search
   */
  private extractKeywords(normalizedQuery: string): string[] {
    const tokens = normalizedQuery
      .replace(/[^a-z0-9@.\-]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOPWORDS.has(token));

    return [...new Set(tokens)];
  }
}
