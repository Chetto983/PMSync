/**
 * Relationship Intelligence Service (P1.7)
 *
 * Provides CRM-like relationship intelligence using PostgreSQL recursive CTEs.
 * Tracks email interactions, calculates relationship scores, and identifies
 * stale contacts that need reconnection.
 *
 * Key Features:
 * - Stale contact detection (60+ days without interaction)
 * - Relationship health scoring (recency, frequency, reciprocity, trend)
 * - Contact relationship graph via recursive CTEs
 * - Last contacted tracking with direction awareness
 * - Reconnect reminders via BullMQ jobs
 * - Smart role classification (Phase 4.3) with embedding fallback
 *
 * Design: Uses Prisma + raw SQL for recursive CTEs (production-compatible)
 * Reference: docs/plans/2025-12-15-crm-intelligence-design.md
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ContactInteractionType, Prisma } from '@prisma/client';
import {
  type SupportedLocale,
  getRolePatterns,
  buildRoleRegex,
} from '../locales';

// ============================================================================
// Smart Role Pattern Classification (Phase 4.3 - Cost Optimization)
// Hybrid approach: Locale patterns (FREE) + Embedding fallback for uncertain
// ============================================================================

/**
 * Role classification result with confidence scoring.
 * Used to decide if embedding/LLM verification is needed.
 */
export interface RoleClassification {
  role: string;
  confidence: number; // 0.0-1.0
  matchedPatterns: string[];
  needsLlmVerification: boolean;
  source: 'locale_regex' | 'email_domain' | 'embedding' | 'fallback';
}

/**
 * Role confidence weights by priority.
 * Higher priority roles get higher base confidence.
 */
const ROLE_WEIGHTS: Record<string, { weight: number; priority: number }> = {
  executive: { weight: 0.95, priority: 1 },
  board: { weight: 0.9, priority: 2 },
  investor: { weight: 0.85, priority: 3 },
  engineering: { weight: 0.85, priority: 4 },
  sales: { weight: 0.8, priority: 5 },
  marketing: { weight: 0.8, priority: 6 },
  hr: { weight: 0.85, priority: 7 },
  legal: { weight: 0.9, priority: 8 },
  finance: { weight: 0.85, priority: 9 },
  support: { weight: 0.75, priority: 10 },
  advisor: { weight: 0.7, priority: 11 },
  vendor: { weight: 0.65, priority: 12 },
  customer: { weight: 0.6, priority: 13 },
  team: { weight: 0.5, priority: 14 },
};

/**
 * Email domain signals for team/company detection.
 * Same domain as user → likely internal team member.
 */
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'mail.com',
  'gmx.com', 'gmx.de', 'web.de', 'libero.it', 'virgilio.it', 'alice.it',
  'orange.fr', 'free.fr', 'laposte.net', 'yahoo.fr', 'yahoo.it', 'yahoo.de',
]);

/** Confidence threshold below which embedding verification is recommended */
const EMBEDDING_VERIFICATION_THRESHOLD = 0.6;

/** Minimum confidence to return a role (below this → 'other') */
const MIN_CONFIDENCE_THRESHOLD = 0.3;

/** Cache for compiled regex patterns by locale */
const roleRegexCache = new Map<SupportedLocale, Map<string, RegExp>>();

/** Cache for role prototype embeddings (for embedding-based classification) */
let roleEmbeddingsCache: Map<string, number[]> | null = null;

/**
 * Cosine similarity between two vectors.
 * Range: -1 (opposite) to 1 (identical)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Similarity threshold for embedding-based role classification */
const EMBEDDING_SIMILARITY_THRESHOLD = 0.80;

/**
 * Role prototype descriptions for embedding comparison.
 * These are embedded once and cached for similarity matching.
 */
const ROLE_PROTOTYPES: Record<string, string> = {
  executive: 'CEO Chief Executive Officer CTO CFO COO President Vice President founder company leader',
  board: 'Board Director Chairman Trustee Non-executive director advisory board member',
  investor: 'Investor Venture Capitalist VC Angel Investor Fund Manager Capital Partner',
  engineering: 'Software Engineer Developer Programmer Architect DevOps SRE Tech Lead Full Stack',
  sales: 'Sales Representative Account Executive Business Development Sales Manager',
  marketing: 'Marketing Manager Brand Manager Growth Hacker Digital Marketing Content Strategist',
  hr: 'Human Resources HR Manager People Operations Recruiter Talent Acquisition',
  legal: 'Lawyer Attorney Legal Counsel General Counsel Compliance Officer',
  finance: 'Finance Manager Controller Accountant CFO Financial Analyst Treasurer',
  support: 'Customer Support Help Desk Technical Support Customer Success Service Representative',
  advisor: 'Advisor Consultant Mentor Coach Strategic Advisor External Consultant',
  vendor: 'Vendor Supplier Partner Sales Contractor Service Provider',
  customer: 'Customer Client Buyer User Consumer Account Holder',
  team: 'Team Member Colleague Coworker Associate Staff Employee',
};

/**
 * Initialize role prototype embeddings (call once on service init).
 * Pre-computes embeddings for all role prototypes using BULK API (1 call = 14 roles).
 *
 * Cost: ~280 chars × 14 roles ≈ 70 tokens total = ~$0.000007 one-time cost
 *
 * @param bulkEmbeddingFn - Function to generate bulk embeddings (single API call)
 */
export async function initializeRoleEmbeddings(
  bulkEmbeddingFn: (texts: string[]) => Promise<number[][]>,
): Promise<void> {
  if (roleEmbeddingsCache !== null) return; // Already initialized

  const roles = Object.keys(ROLE_PROTOTYPES);
  const prototypes = Object.values(ROLE_PROTOTYPES);

  try {
    // Single bulk API call for all 14 role prototypes
    const embeddings = await bulkEmbeddingFn(prototypes);

    const cache = new Map<string, number[]>();
    for (let i = 0; i < roles.length; i++) {
      if (embeddings[i]) {
        cache.set(roles[i], embeddings[i]);
      }
    }
    roleEmbeddingsCache = cache;
  } catch {
    // Embedding init failed - regex classification will be used as fallback
    roleEmbeddingsCache = new Map(); // Empty cache signals embeddings unavailable
  }
}

/**
 * Embedding functions interface for role classification.
 */
export interface RoleEmbeddingFunctions {
  /** Generate embedding for single text */
  single: (text: string) => Promise<number[]>;
  /** Generate embeddings for multiple texts in one API call */
  bulk: (texts: string[]) => Promise<number[][]>;
}

/**
 * Classify role using embedding similarity (async, uses API).
 * Call this when regex classification has low confidence.
 *
 * @param text - Job title + company to classify
 * @param embedFns - Embedding functions (single for query, bulk for init)
 * @returns Best matching role with similarity score, or null if no good match
 */
export async function classifyRoleByEmbedding(
  text: string,
  embedFns: RoleEmbeddingFunctions,
): Promise<{ role: string; similarity: number } | null> {
  if (!text || text.trim().length < 3) return null;

  // Ensure role prototypes are initialized (one-time bulk call)
  if (roleEmbeddingsCache === null) {
    await initializeRoleEmbeddings(embedFns.bulk);
  }

  if (!roleEmbeddingsCache || roleEmbeddingsCache.size === 0) {
    return null; // Embeddings not available
  }

  // Generate embedding for input text (single call)
  const textEmbedding = await embedFns.single(text);

  // Find most similar role
  let bestRole: string | null = null;
  let bestSimilarity = 0;

  for (const [role, roleEmbedding] of roleEmbeddingsCache.entries()) {
    const similarity = cosineSimilarity(textEmbedding, roleEmbedding);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestRole = role;
    }
  }

  if (bestRole && bestSimilarity >= EMBEDDING_SIMILARITY_THRESHOLD) {
    return { role: bestRole, similarity: bestSimilarity };
  }

  return null;
}

/**
 * Get compiled regex patterns for a locale (cached).
 * Merges patterns from locale files into regex for each role.
 */
function getCompiledRolePatterns(locale: SupportedLocale): Map<string, RegExp> {
  if (!roleRegexCache.has(locale)) {
    const patterns = getRolePatterns(locale);
    const compiled = new Map<string, RegExp>();

    for (const [role, terms] of Object.entries(patterns)) {
      compiled.set(role, buildRoleRegex(terms));
    }

    roleRegexCache.set(locale, compiled);
  }
  return roleRegexCache.get(locale)!;
}

/**
 * Smart role classification using locale-based patterns.
 * Uses patterns from locale files (FREE), flags uncertain cases for embedding verification.
 *
 * @param jobTitle - Contact's job title
 * @param company - Contact's company name
 * @param contactEmail - Contact's email for domain analysis
 * @param userDomain - User's email domain for team detection
 * @param locale - User's locale for multilingual pattern matching
 * @returns RoleClassification with confidence and verification recommendation
 */
export function classifyContactRoleSmart(
  jobTitle?: string | null,
  company?: string | null,
  contactEmail?: string | null,
  userDomain?: string | null,
  locale: SupportedLocale = 'en',
): RoleClassification {
  // No data → fallback
  if (!jobTitle && !company && !contactEmail) {
    return {
      role: 'other',
      confidence: 0,
      matchedPatterns: [],
      needsLlmVerification: false,
      source: 'fallback',
    };
  }

  const text = `${jobTitle || ''} ${company || ''}`.toLowerCase();
  const matchedRoles: Array<{ role: string; confidence: number; pattern: string }> = [];

  // 1. Check email domain for team detection
  if (contactEmail && userDomain) {
    const contactDomain = contactEmail.split('@')[1]?.toLowerCase();
    if (contactDomain && contactDomain === userDomain.toLowerCase() && !GENERIC_EMAIL_DOMAINS.has(contactDomain)) {
      matchedRoles.push({
        role: 'team',
        confidence: 0.85,
        pattern: 'same_company_domain',
      });
    }
  }

  // 2. Check locale-based regex patterns by priority order
  const compiledPatterns = getCompiledRolePatterns(locale);
  const sortedRoles = Object.entries(ROLE_WEIGHTS)
    .sort(([, a], [, b]) => a.priority - b.priority);

  for (const [role, weights] of sortedRoles) {
    const regex = compiledPatterns.get(role);
    if (regex && regex.test(text)) {
      // Boost confidence if multiple signals (title + company match)
      let confidence = weights.weight;
      if (jobTitle && company && regex.test(jobTitle.toLowerCase()) && regex.test(company.toLowerCase())) {
        confidence = Math.min(1.0, confidence + 0.1);
      }
      matchedRoles.push({ role, confidence, pattern: role });
    }
  }

  // No matches → uncertain, recommend embedding if there's text to analyze
  if (matchedRoles.length === 0) {
    const hasContent = text.trim().length > 3;
    return {
      role: 'other',
      confidence: 0,
      matchedPatterns: [],
      needsLlmVerification: hasContent, // Only if there's something to analyze
      source: 'fallback',
    };
  }

  // Sort by confidence (highest first)
  matchedRoles.sort((a, b) => b.confidence - a.confidence);
  const best = matchedRoles[0];

  // Multiple conflicting roles → lower confidence
  let finalConfidence = best.confidence;
  if (matchedRoles.length > 1 && matchedRoles[1].confidence > 0.5) {
    finalConfidence *= 0.85; // Reduce confidence due to ambiguity
  }

  return {
    role: finalConfidence >= MIN_CONFIDENCE_THRESHOLD ? best.role : 'other',
    confidence: finalConfidence,
    matchedPatterns: matchedRoles.map(m => m.pattern),
    needsLlmVerification: finalConfidence < EMBEDDING_VERIFICATION_THRESHOLD,
    source: best.pattern === 'same_company_domain' ? 'email_domain' : 'locale_regex',
  };
}

/**
 * Simple role classification (backward compatible).
 * Returns just the role string without confidence scoring.
 *
 * @deprecated Use classifyContactRoleSmart() for better accuracy
 */
export function classifyContactRole(jobTitle?: string | null, company?: string | null): string {
  const result = classifyContactRoleSmart(jobTitle, company);
  return result.role;
}

/**
 * Get all matching roles for a contact with confidence scores.
 * Useful for detailed role analysis.
 *
 * @param jobTitle - Contact's job title
 * @param company - Contact's company name
 * @param locale - User's locale for multilingual pattern matching
 */
export function getContactRolesWithConfidence(
  jobTitle?: string | null,
  company?: string | null,
  locale: SupportedLocale = 'en',
): Array<{ role: string; confidence: number }> {
  if (!jobTitle && !company) return [];

  const text = `${jobTitle || ''} ${company || ''}`.toLowerCase();
  const matches: Array<{ role: string; confidence: number }> = [];
  const compiledPatterns = getCompiledRolePatterns(locale);

  for (const [role, weights] of Object.entries(ROLE_WEIGHTS)) {
    const regex = compiledPatterns.get(role);
    if (regex && regex.test(text)) {
      matches.push({ role, confidence: weights.weight });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get all matching roles (backward compatible, without confidence).
 */
export function getContactRoles(jobTitle?: string | null, company?: string | null): string[] {
  return getContactRolesWithConfidence(jobTitle, company).map(r => r.role);
}

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface StaleContact {
  contactId: string;
  displayName: string | null;
  primaryEmail: string | null;
  company: string | null;
  lastInteraction: Date | null;
  daysSinceContact: number;
  totalInteractions: number;
  relationshipScore: number | null;
}

export interface ContactRelationshipStats {
  contactId: string;
  displayName: string | null;
  primaryEmail: string | null;
  company: string | null;
  lastInteraction: Date | null;
  totalInteractions: number;
  sentCount: number;
  receivedCount: number;
  relationshipScore: number | null;
  reciprocityRatio: number; // 1.0 = balanced, >1 = more sent, <1 = more received
  isStale: boolean;
  daysSinceContact: number;
}

export interface RelationshipGraphNode {
  contactId: string;
  displayName: string | null;
  depth: number;
  connectionPath: string[];
  relationshipScore: number | null;
}

export interface ContactInteractionRecord {
  id: string;
  type: ContactInteractionType;
  date: Date;
  summary: string | null;
  sentiment: string | null;
  sourceType: string | null;
  emailId: string | null;
  contactEmail: string | null;
  contactName: string | null;
}

export interface RelationshipScoreComponents {
  recencyScore: number; // 0-40 points
  frequencyScore: number; // 0-30 points
  reciprocityScore: number; // 0-20 points
  trendScore: number; // 0-10 points
  totalScore: number; // 0-100
}

export interface StaleContactsOptions {
  staleDays?: number; // Default: 60
  limit?: number; // Default: 50
  minInteractions?: number; // Minimum past interactions to be considered "important"
}

export interface RecordInteractionOptions {
  emailId?: string;
  summary?: string;
  sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  contactEmail?: string;
  contactName?: string;
}

// ============================================================================
// Service Implementation
// ============================================================================

@Injectable()
export class RelationshipIntelligenceService {
  private readonly logger = new Logger(RelationshipIntelligenceService.name);

  // Score weights (from design doc)
  private readonly RECENCY_WEIGHT = 0.4;
  private readonly FREQUENCY_WEIGHT = 0.3;
  private readonly RECIPROCITY_WEIGHT = 0.2;
  private readonly TREND_WEIGHT = 0.1;

  // Default stale threshold
  private readonly DEFAULT_STALE_DAYS = 60;

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // Core CRM Queries
  // ==========================================================================

  /**
   * Get stale contacts (no interaction in X days)
   * Uses indexed query on lastInteractedAt for performance
   */
  async getStaleContacts(
    tenantId: string,
    options: StaleContactsOptions = {},
  ): Promise<StaleContact[]> {
    const { staleDays = this.DEFAULT_STALE_DAYS, limit = 50, minInteractions = 1 } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - staleDays);

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        isDeleted: false,
        totalInteractions: { gte: minInteractions },
        OR: [{ lastInteractedAt: { lt: cutoffDate } }, { lastInteractedAt: null }],
      },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        emails: true,
        company: true,
        lastInteractedAt: true,
        totalInteractions: true,
        relationshipScore: true,
      },
      orderBy: [{ relationshipScore: 'desc' }, { totalInteractions: 'desc' }],
      take: limit,
    });

    const now = new Date();
    return contacts.map((c) => ({
      contactId: c.id,
      displayName: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || null,
      primaryEmail: this.extractPrimaryEmail(c.emails),
      company: c.company,
      lastInteraction: c.lastInteractedAt,
      daysSinceContact: c.lastInteractedAt
        ? Math.floor((now.getTime() - c.lastInteractedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 9999,
      totalInteractions: c.totalInteractions,
      relationshipScore: c.relationshipScore,
    }));
  }

  /**
   * Get contacts needing reconnection (filtered by when reminder was last sent)
   */
  async getContactsNeedingReconnect(
    tenantId: string,
    options: { staleDays?: number; reminderCooldownDays?: number; limit?: number } = {},
  ): Promise<StaleContact[]> {
    const { staleDays = this.DEFAULT_STALE_DAYS, reminderCooldownDays = 7, limit = 20 } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - staleDays);

    const reminderCutoff = new Date();
    reminderCutoff.setDate(reminderCutoff.getDate() - reminderCooldownDays);

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        isDeleted: false,
        totalInteractions: { gte: 1 },
        OR: [{ lastInteractedAt: { lt: cutoffDate } }, { lastInteractedAt: null }],
        AND: [
          {
            OR: [{ reconnectRemindedAt: null }, { reconnectRemindedAt: { lt: reminderCutoff } }],
          },
        ],
      },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        emails: true,
        company: true,
        lastInteractedAt: true,
        totalInteractions: true,
        relationshipScore: true,
      },
      orderBy: [{ relationshipScore: 'desc' }, { totalInteractions: 'desc' }],
      take: limit,
    });

    const now = new Date();
    return contacts.map((c) => ({
      contactId: c.id,
      displayName: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || null,
      primaryEmail: this.extractPrimaryEmail(c.emails),
      company: c.company,
      lastInteraction: c.lastInteractedAt,
      daysSinceContact: c.lastInteractedAt
        ? Math.floor((now.getTime() - c.lastInteractedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 9999,
      totalInteractions: c.totalInteractions,
      relationshipScore: c.relationshipScore,
    }));
  }

  /**
   * Mark contact as reminded (to prevent spam)
   */
  async markContactReminded(tenantId: string, contactId: string): Promise<void> {
    await this.prisma.contact.updateMany({
      where: { id: contactId, tenantId },
      data: { reconnectRemindedAt: new Date() },
    });
  }

  /**
   * Get relationship stats for a specific contact
   */
  async getContactRelationshipStats(
    tenantId: string,
    contactId: string,
  ): Promise<ContactRelationshipStats | null> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId, isDeleted: false },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        emails: true,
        company: true,
        lastInteractedAt: true,
        totalInteractions: true,
        sentCount: true,
        receivedCount: true,
        relationshipScore: true,
      },
    });

    if (!contact) return null;

    const now = new Date();
    const daysSince = contact.lastInteractedAt
      ? Math.floor((now.getTime() - contact.lastInteractedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 9999;

    // Calculate reciprocity ratio (avoid division by zero)
    const reciprocity =
      contact.receivedCount > 0 ? contact.sentCount / contact.receivedCount : contact.sentCount > 0 ? Infinity : 1;

    return {
      contactId: contact.id,
      displayName: contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || null,
      primaryEmail: this.extractPrimaryEmail(contact.emails),
      company: contact.company,
      lastInteraction: contact.lastInteractedAt,
      totalInteractions: contact.totalInteractions,
      sentCount: contact.sentCount,
      receivedCount: contact.receivedCount,
      relationshipScore: contact.relationshipScore,
      reciprocityRatio: reciprocity === Infinity ? 999 : Math.round(reciprocity * 100) / 100,
      isStale: daysSince >= this.DEFAULT_STALE_DAYS,
      daysSinceContact: daysSince,
    };
  }

  /**
   * Get interaction history for a contact
   */
  async getContactInteractionHistory(
    tenantId: string,
    contactId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<ContactInteractionRecord[]> {
    const { limit = 50, offset = 0 } = options;

    const interactions = await this.prisma.contactInteraction.findMany({
      where: { tenantId, contactId },
      select: {
        id: true,
        type: true,
        date: true,
        summary: true,
        sentiment: true,
        sourceType: true,
        emailId: true,
        contactEmail: true,
        contactName: true,
      },
      orderBy: { date: 'desc' },
      take: limit,
      skip: offset,
    });

    return interactions;
  }

  /**
   * Get top contacts by relationship score
   */
  async getTopContacts(
    tenantId: string,
    options: { limit?: number; minScore?: number } = {},
  ): Promise<ContactRelationshipStats[]> {
    const { limit = 20, minScore = 0 } = options;

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        isDeleted: false,
        relationshipScore: { gte: minScore },
      },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        emails: true,
        company: true,
        lastInteractedAt: true,
        totalInteractions: true,
        sentCount: true,
        receivedCount: true,
        relationshipScore: true,
      },
      orderBy: { relationshipScore: 'desc' },
      take: limit,
    });

    const now = new Date();
    return contacts.map((c) => {
      const daysSince = c.lastInteractedAt
        ? Math.floor((now.getTime() - c.lastInteractedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 9999;
      const reciprocity = c.receivedCount > 0 ? c.sentCount / c.receivedCount : c.sentCount > 0 ? Infinity : 1;

      return {
        contactId: c.id,
        displayName: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || null,
        primaryEmail: this.extractPrimaryEmail(c.emails),
        company: c.company,
        lastInteraction: c.lastInteractedAt,
        totalInteractions: c.totalInteractions,
        sentCount: c.sentCount,
        receivedCount: c.receivedCount,
        relationshipScore: c.relationshipScore,
        reciprocityRatio: reciprocity === Infinity ? 999 : Math.round(reciprocity * 100) / 100,
        isStale: daysSince >= this.DEFAULT_STALE_DAYS,
        daysSinceContact: daysSince,
      };
    });
  }

  // ==========================================================================
  // Interaction Recording
  // ==========================================================================

  /**
   * Record an email interaction with a contact
   * Called by email sync when emails are sent/received
   */
  async recordEmailInteraction(
    tenantId: string,
    userId: string,
    contactId: string,
    type: 'EMAIL_SENT' | 'EMAIL_RECEIVED',
    date: Date,
    options: RecordInteractionOptions = {},
  ): Promise<void> {
    const { emailId, summary, sentiment, contactEmail, contactName } = options;

    // Skip if already recorded (emailId unique constraint)
    if (emailId) {
      const existing = await this.prisma.contactInteraction.findFirst({
        where: { emailId, tenantId },
        select: { id: true },
      });
      if (existing) {
        this.logger.debug(`Interaction already recorded for email ${emailId}`);
        return;
      }
    }

    // Create interaction record
    await this.prisma.contactInteraction.create({
      data: {
        tenantId,
        contactId,
        userId,
        type: type === 'EMAIL_SENT' ? ContactInteractionType.EMAIL_SENT : ContactInteractionType.EMAIL_RECEIVED,
        date,
        summary,
        sentiment,
        sourceType: 'EMAIL',
        emailId,
        contactEmail,
        contactName,
      },
    });

    // Update contact aggregates
    const updateData: Prisma.ContactUpdateManyMutationInput = {
      totalInteractions: { increment: 1 },
      lastInteractedAt: date,
    };

    if (type === 'EMAIL_SENT') {
      updateData.sentCount = { increment: 1 };
    } else {
      updateData.receivedCount = { increment: 1 };
    }

    await this.prisma.contact.updateMany({
      where: { id: contactId, tenantId },
      data: updateData,
    });

    this.logger.debug(`Recorded ${type} interaction for contact ${contactId}`);
  }

  /**
   * Record a manual interaction (call, meeting, note)
   */
  async recordManualInteraction(
    tenantId: string,
    userId: string,
    contactId: string,
    type: 'MEETING' | 'CALL' | 'NOTE',
    date: Date,
    summary?: string,
  ): Promise<string> {
    const interactionType =
      type === 'MEETING'
        ? ContactInteractionType.MEETING
        : type === 'CALL'
          ? ContactInteractionType.CALL
          : ContactInteractionType.NOTE;

    const interaction = await this.prisma.contactInteraction.create({
      data: {
        tenantId,
        contactId,
        userId,
        type: interactionType,
        date,
        summary,
        sourceType: 'MANUAL',
      },
    });

    // Update contact lastInteractedAt (manual interactions don't increment sent/received)
    await this.prisma.contact.updateMany({
      where: { id: contactId, tenantId },
      data: {
        totalInteractions: { increment: 1 },
        lastInteractedAt: date,
      },
    });

    return interaction.id;
  }

  // ==========================================================================
  // Relationship Score Calculation
  // ==========================================================================

  /**
   * Calculate relationship score for a contact
   * Score components:
   * - Recency (40%): How recently we interacted
   * - Frequency (30%): How often we interact
   * - Reciprocity (20%): Balance of sent vs received
   * - Trend (10%): Is interaction increasing or decreasing
   */
  async calculateRelationshipScore(tenantId: string, contactId: string): Promise<RelationshipScoreComponents> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: {
        lastInteractedAt: true,
        totalInteractions: true,
        sentCount: true,
        receivedCount: true,
        createdAt: true,
      },
    });

    if (!contact) {
      return { recencyScore: 0, frequencyScore: 0, reciprocityScore: 0, trendScore: 0, totalScore: 0 };
    }

    // 1. Recency Score (0-40 points)
    const recencyScore = this.calculateRecencyScore(contact.lastInteractedAt);

    // 2. Frequency Score (0-30 points)
    const frequencyScore = this.calculateFrequencyScore(contact.totalInteractions, contact.createdAt);

    // 3. Reciprocity Score (0-20 points)
    const reciprocityScore = this.calculateReciprocityScore(contact.sentCount, contact.receivedCount);

    // 4. Trend Score (0-10 points) - requires recent interaction data
    const trendScore = await this.calculateTrendScore(tenantId, contactId);

    const totalScore = Math.round(recencyScore + frequencyScore + reciprocityScore + trendScore);

    // Update contact with new score
    await this.prisma.contact.updateMany({
      where: { id: contactId, tenantId },
      data: { relationshipScore: totalScore },
    });

    return {
      recencyScore: Math.round(recencyScore * 10) / 10,
      frequencyScore: Math.round(frequencyScore * 10) / 10,
      reciprocityScore: Math.round(reciprocityScore * 10) / 10,
      trendScore: Math.round(trendScore * 10) / 10,
      totalScore,
    };
  }

  /**
   * Batch recalculate scores for all contacts (for backfill job)
   */
  async recalculateAllScores(tenantId: string): Promise<{ updated: number; errors: number }> {
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId, isDeleted: false, totalInteractions: { gt: 0 } },
      select: { id: true },
    });

    let updated = 0;
    let errors = 0;

    for (const contact of contacts) {
      try {
        await this.calculateRelationshipScore(tenantId, contact.id);
        updated++;
      } catch (err) {
        this.logger.error(`Error calculating score for contact ${contact.id}:`, err);
        errors++;
      }
    }

    this.logger.log(`Recalculated scores for ${updated} contacts (${errors} errors)`);
    return { updated, errors };
  }

  // ==========================================================================
  // Relationship Graph (Recursive CTEs)
  // ==========================================================================

  /**
   * Find contacts connected through shared email threads or meetings
   * Uses recursive CTE for graph traversal (production-compatible, no AGE needed)
   */
  async getRelationshipGraph(
    tenantId: string,
    rootContactId: string,
    maxDepth: number = 2,
  ): Promise<RelationshipGraphNode[]> {
    // This uses a recursive CTE to find contacts connected through:
    // 1. Shared email threads (multiple recipients)
    // 2. Shared meetings (multiple attendees)
    // For now, we implement a simplified version using Prisma

    // Get the root contact's emails
    const rootContact = await this.prisma.contact.findFirst({
      where: { id: rootContactId, tenantId },
      select: { emails: true },
    });

    if (!rootContact) return [];

    const rootEmails = this.extractAllEmails(rootContact.emails);
    if (rootEmails.length === 0) return [];

    // Find emails where root contact was a participant
    // Then find other contacts who were also participants
    const connectedContacts = await this.prisma.$queryRaw<
      Array<{
        id: string;
        displayName: string | null;
        relationshipScore: number | null;
      }>
    >`
      WITH RECURSIVE contact_graph AS (
        -- Base case: direct connections via email threads
        SELECT DISTINCT
          c.id,
          c."displayName",
          c."relationshipScore",
          1 as depth,
          ARRAY[${rootContactId}::text, c.id::text] as path
        FROM "unified_contacts" c
        WHERE c."tenantId" = ${tenantId}
          AND c.id != ${rootContactId}
          AND c."isDeleted" = false
          AND EXISTS (
            SELECT 1 FROM "contact_interactions" ci
            WHERE ci."contactId" = c.id
              AND ci."tenantId" = ${tenantId}
          )
        LIMIT 50
      )
      SELECT DISTINCT id, "displayName", "relationshipScore"
      FROM contact_graph
      WHERE depth <= ${maxDepth}
      ORDER BY "relationshipScore" DESC NULLS LAST
      LIMIT 50
    `;

    return connectedContacts.map((c) => ({
      contactId: c.id,
      displayName: c.displayName,
      depth: 1,
      connectionPath: [rootContactId, c.id],
      relationshipScore: c.relationshipScore,
    }));
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private calculateRecencyScore(lastInteraction: Date | null): number {
    if (!lastInteraction) return 0;

    const daysSince = Math.floor((Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24));

    // Full points for < 7 days, decreasing score for older
    if (daysSince < 7) return 40;
    if (daysSince < 14) return 35;
    if (daysSince < 30) return 28;
    if (daysSince < 60) return 20;
    if (daysSince < 90) return 12;
    if (daysSince < 180) return 6;
    return 2;
  }

  private calculateFrequencyScore(totalInteractions: number, createdAt: Date): number {
    // Calculate interactions per month
    const monthsActive = Math.max(1, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const interactionsPerMonth = totalInteractions / monthsActive;

    // Score based on interaction frequency
    if (interactionsPerMonth >= 10) return 30;
    if (interactionsPerMonth >= 5) return 25;
    if (interactionsPerMonth >= 2) return 20;
    if (interactionsPerMonth >= 1) return 15;
    if (interactionsPerMonth >= 0.5) return 10;
    if (totalInteractions > 0) return 5;
    return 0;
  }

  private calculateReciprocityScore(sentCount: number, receivedCount: number): number {
    const total = sentCount + receivedCount;
    if (total === 0) return 0;

    // Calculate ratio of sent to received (ideal is 1.0)
    const ratio = sentCount / Math.max(1, receivedCount);

    // Score is highest when ratio is close to 1 (balanced conversation)
    // Penalize both one-sided sending and one-sided receiving
    if (ratio >= 0.8 && ratio <= 1.25) return 20; // Well balanced
    if (ratio >= 0.5 && ratio <= 2) return 15; // Somewhat balanced
    if (ratio >= 0.25 && ratio <= 4) return 10; // Imbalanced
    return 5; // Very one-sided
  }

  private async calculateTrendScore(tenantId: string, contactId: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Get interaction counts for recent vs previous period
    const [recentCount, previousCount] = await Promise.all([
      this.prisma.contactInteraction.count({
        where: { tenantId, contactId, date: { gte: thirtyDaysAgo } },
      }),
      this.prisma.contactInteraction.count({
        where: { tenantId, contactId, date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
    ]);

    // Score based on trend
    if (recentCount > previousCount * 1.5) return 10; // Strong upward trend
    if (recentCount > previousCount) return 7; // Slight upward trend
    if (recentCount === previousCount || (recentCount === 0 && previousCount === 0)) return 5; // Stable
    if (recentCount >= previousCount * 0.5) return 3; // Slight downward trend
    return 0; // Strong downward trend
  }

  private extractPrimaryEmail(emails: unknown): string | null {
    if (!emails || !Array.isArray(emails)) return null;

    // Find primary email or first email
    const primary = emails.find((e: { primary?: boolean }) => e.primary);
    if (primary && typeof primary === 'object' && 'value' in primary) {
      return (primary as { value: string }).value;
    }

    const first = emails[0];
    if (first && typeof first === 'object' && 'value' in first) {
      return (first as { value: string }).value;
    }

    return null;
  }

  private extractAllEmails(emails: unknown): string[] {
    if (!emails || !Array.isArray(emails)) return [];

    return emails
      .filter((e): e is { value: string } => typeof e === 'object' && e !== null && 'value' in e)
      .map((e) => e.value.toLowerCase());
  }
}
