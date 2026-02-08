/** KeywordSearchService - Keyword/lexical search for RAG (Phase 11-02). */
import { Injectable, Logger } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { EXCLUDE_JUNK_FOLDERS } from '../../../email/email.helpers';

export interface KeywordSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface KeywordSearchOptions {
  limit: number;
  tenantId: string;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from', 'how', 'if', 'in', 'is', 'it',
  'me', 'my', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'then', 'there', 'this', 'to', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
  'che', 'chi', 'come', 'da', 'dei', 'degli', 'delle', 'del', 'della', 'di', 'e', 'gli', 'il', 'in', 'la', 'le',
  'lo', 'ma', 'nel', 'nella', 'nelle', 'nello', 'no', 'non', 'o', 'per', 'perche', 'quando', 'questo', 'su', 'un',
  'una', 'uno', 'si',
]);

@Injectable()
export class KeywordSearchService {
  private readonly logger = new Logger(KeywordSearchService.name);
  private prisma?: PrismaService;

  /** Set dependencies (injected by UnifiedRetriever to avoid circular dependency). */
  setDependencies(deps: { prisma: PrismaService }): void {
    this.prisma = deps.prisma;
  }

  private normalizeQuery(query: string): string {
    return query.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractKeywords(query: string): string[] {
    const normalized = this.normalizeQuery(query);
    if (!normalized) return [];
    const tokens = normalized.split(' ').filter((token) => token.length > 2 && !STOPWORDS.has(token));
    return Array.from(new Set(tokens));
  }

  /**
   * Search emails using keyword matching.
   */
  async searchEmails(query: string, options: KeywordSearchOptions): Promise<KeywordSearchResult[]> {
    if (!this.prisma) throw new Error('KeywordSearchService dependencies not set');

    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) return [];

    const results: KeywordSearchResult[] = [];

    try {
      const keywordResults = await this.prisma.email.findMany({
        where: {
          tenantId: options.tenantId,
          folder: EXCLUDE_JUNK_FOLDERS,
          OR: [
            { subject: { contains: query, mode: 'insensitive' } },
            { snippet: { contains: query, mode: 'insensitive' } },
            { from: { contains: query, mode: 'insensitive' } },
            ...keywords.slice(0, 3).flatMap((kw) => [
              { subject: { contains: kw, mode: 'insensitive' as const } },
              { snippet: { contains: kw, mode: 'insensitive' as const } },
              { from: { contains: kw, mode: 'insensitive' as const } },
            ]),
          ],
        },
        take: options.limit * 2,
        orderBy: { receivedAt: 'desc' },
        select: { id: true, subject: true, snippet: true, from: true, receivedAt: true },
      });

      keywordResults.forEach((kr, idx) => {
        results.push({
          id: kr.id,
          content: `Email: ${kr.subject || 'No subject'}\nFrom: ${kr.from || 'Unknown'}\n${kr.snippet || ''}`,
          score: 1 / (60 + idx + 1), // RRF score contribution
          metadata: { type: 'email', from: kr.from, subject: kr.subject, receivedAt: kr.receivedAt },
        });
      });
    } catch (error) {
      this.logger.warn(`Email keyword search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return results;
  }

  /**
   * Search contacts using keyword matching.
   */
  async searchContacts(query: string, options: KeywordSearchOptions): Promise<KeywordSearchResult[]> {
    if (!this.prisma) throw new Error('KeywordSearchService dependencies not set');

    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) return [];

    const results: KeywordSearchResult[] = [];

    try {
      const keywordResults = await this.prisma.contact.findMany({
        where: {
          tenantId: options.tenantId,
          OR: [
            { displayName: { contains: query, mode: 'insensitive' } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { company: { contains: query, mode: 'insensitive' } },
            { jobTitle: { contains: query, mode: 'insensitive' } },
            { notes: { contains: query, mode: 'insensitive' } },
            ...keywords.slice(0, 3).flatMap((kw) => [
              { displayName: { contains: kw, mode: 'insensitive' as const } },
              { company: { contains: kw, mode: 'insensitive' as const } },
            ]),
          ],
        },
        take: options.limit * 2,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, displayName: true, firstName: true, lastName: true, company: true, jobTitle: true, department: true, notes: true, emails: true, phoneNumbers: true, updatedAt: true },
      });

      keywordResults.forEach((kr, idx) => {
        const name = kr.displayName || `${kr.firstName || ''} ${kr.lastName || ''}`.trim() || 'Unknown';
        const emailList = (kr.emails as Array<{ value: string }> | null)?.map((e) => e.value).join(', ') || '';
        results.push({
          id: kr.id,
          content: [
            `Contact: ${name}`, kr.company && `Company: ${kr.company}`, kr.jobTitle && `Role: ${kr.jobTitle}`,
            kr.department && `Department: ${kr.department}`, emailList && `Email: ${emailList}`, kr.notes && `Notes: ${kr.notes}`,
          ].filter(Boolean).join('\n'),
          score: 1 / (60 + idx + 1), // RRF score contribution
          metadata: { type: 'contact', name, company: kr.company, jobTitle: kr.jobTitle, emails: kr.emails, updatedAt: kr.updatedAt },
        });
      });
    } catch (error) {
      this.logger.warn(`Contact keyword search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return results;
  }
}
