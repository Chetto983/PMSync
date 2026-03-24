// ─── Shared search result types ─────────────────────────────
// Extracted to break circular dependency between
// hybrid-search.service.ts and reranking.service.ts

export interface EmailSearchResult {
  source: 'email';
  emailId: string;
  subject: string | null;
  from: string | null;
  snippet: string | null;
  receivedAt: Date | null;
  rrfScore: number;
}

export interface ContactSearchResult {
  source: 'contact';
  contactId: string;
  displayName: string | null;
  company: string | null;
  jobTitle: string | null;
  rrfScore: number;
}

export interface CalendarSearchResult {
  source: 'calendar';
  eventId: string;
  title: string | null;
  description: string | null;
  startTime: Date | null;
  endTime: Date | null;
  location: string | null;
  rrfScore: number;
}

export type UnifiedSearchResult =
  | EmailSearchResult
  | ContactSearchResult
  | CalendarSearchResult;

/**
 * Extended email result with metadata for reranking.
 * The SQL function now returns thread_id and ai_priority alongside RRF scores.
 */
export interface RerankableEmailResult extends EmailSearchResult {
  threadId: string | null;
  aiPriority: string | null;
}
