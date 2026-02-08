/** VectorSearchService - Vector similarity search for RAG (Phase 11-02). */
import { Injectable, Logger } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { MistralService } from '../../services/mistral.service';
import type { EmbeddingsService } from '../../services/embeddings.service';

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorSearchOptions {
  limit: number;
  maxDistance?: number;
  tenantId: string;
}

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);
  private mistralService?: MistralService;
  private embeddingsService?: EmbeddingsService;
  private prisma?: PrismaService;

  /** Set dependencies (injected by UnifiedRetriever to avoid circular dependency). */
  setDependencies(deps: { mistralService: MistralService; embeddingsService: EmbeddingsService; prisma: PrismaService }): void {
    this.mistralService = deps.mistralService;
    this.embeddingsService = deps.embeddingsService;
    this.prisma = deps.prisma;
  }

  /**
   * Search emails using vector similarity.
   * GDPR FIX: Uses emailId from embedding, fetches content from Email table if needed.
   */
  async searchEmails(
    query: string,
    options: VectorSearchOptions,
  ): Promise<{ results: VectorSearchResult[]; emailContentMap: Map<string, { content: string; receivedAt: Date | null; from: string | null; subject: string | null }> }> {
    if (!this.mistralService || !this.embeddingsService || !this.prisma) {
      throw new Error('VectorSearchService dependencies not set');
    }

    const results: VectorSearchResult[] = [];
    const emailContentMap = new Map<string, { content: string; receivedAt: Date | null; from: string | null; subject: string | null }>();

    try {
      const embedding = await this.mistralService.generateEmbedding(query, undefined, { tenantId: options.tenantId });
      if (!embedding || embedding.length === 0) return { results, emailContentMap };

      const vectorResults = await this.embeddingsService.findSimilarContent<{
        id: string; emailId: string | null; contactId: string | null; content: string | null;
        documentName: string | null; metadata: Record<string, unknown> | null; distance?: number;
      }>(options.tenantId, embedding, options.limit * 2);

      // Collect emailIds that need content fetched
      const emailIdsNeedingContent = vectorResults.filter((vr) => vr.emailId && !vr.content).map((vr) => vr.emailId as string);

      // Batch fetch email content if needed (GDPR-compliant)
      if (emailIdsNeedingContent.length > 0) {
        const emails = await this.prisma.email.findMany({
          where: { id: { in: emailIdsNeedingContent }, tenantId: options.tenantId },
          select: { id: true, subject: true, snippet: true, from: true, receivedAt: true },
        });
        emails.forEach((e) => emailContentMap.set(e.id, {
          content: `Email: ${e.subject || 'No subject'}\nFrom: ${e.from || 'Unknown'}\n${e.snippet || ''}`,
          receivedAt: e.receivedAt ?? null, from: e.from ?? null, subject: e.subject ?? null,
        }));
      }

      for (let idx = 0; idx < vectorResults.length; idx++) {
        const vr = vectorResults[idx];
        if (vr.emailId) {
          const emailMeta = emailContentMap.get(vr.emailId);
          const content = vr.content || emailMeta?.content || '';
          if (!content) continue;
          results.push({
            id: vr.emailId,
            content,
            score: 1 / (60 + idx + 1), // RRF score contribution
            metadata: { ...(vr.metadata || {}), type: 'email', receivedAt: emailMeta?.receivedAt, from: emailMeta?.from, subject: emailMeta?.subject },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Email vector search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { results, emailContentMap };
  }

  /**
   * Search contacts using vector similarity.
   * GDPR FIX: Uses contactId from embedding, fetches content from Contact table if needed.
   */
  async searchContacts(
    query: string,
    options: VectorSearchOptions,
  ): Promise<{ results: VectorSearchResult[]; contactContentMap: Map<string, { content: string; updatedAt: Date | null }> }> {
    if (!this.mistralService || !this.embeddingsService || !this.prisma) {
      throw new Error('VectorSearchService dependencies not set');
    }

    const results: VectorSearchResult[] = [];
    const contactContentMap = new Map<string, { content: string; updatedAt: Date | null }>();

    try {
      const embedding = await this.mistralService.generateEmbedding(query, undefined, { tenantId: options.tenantId });
      if (!embedding || embedding.length === 0) return { results, contactContentMap };

      const vectorResults = await this.embeddingsService.findSimilarContent<{
        id: string; content: string | null; documentName: string | null;
        metadata: Record<string, unknown> | null; distance?: number; contactId?: string | null;
      }>(options.tenantId, embedding, options.limit * 2, { maxDistance: options.maxDistance ?? 0.5 });

      // Filter to only contact embeddings
      const contactEmbeddings = vectorResults.filter((vr) => vr.metadata?.source === 'contact' || vr.contactId);

      // Collect contactIds that need content fetched
      const contactIdsNeedingContent = contactEmbeddings
        .filter((vr) => !vr.content)
        .map((vr) => vr.contactId || (vr.metadata as Record<string, unknown>)?.contactId)
        .filter((id): id is string => !!id);

      // Batch fetch contact content if needed (GDPR-compliant)
      if (contactIdsNeedingContent.length > 0) {
        const contacts = await this.prisma.contact.findMany({
          where: { id: { in: contactIdsNeedingContent }, tenantId: options.tenantId },
          select: { id: true, displayName: true, firstName: true, lastName: true, company: true, jobTitle: true, notes: true, emails: true, updatedAt: true },
        });
        contacts.forEach((c) => {
          const name = c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown';
          const emailList = (c.emails as Array<{ value: string }> | null)?.map((e) => e.value).join(', ') || '';
          contactContentMap.set(c.id, {
            content: [
              `Contact: ${name}`, c.company && `Company: ${c.company}`, c.jobTitle && `Role: ${c.jobTitle}`,
              emailList && `Email: ${emailList}`, c.notes && `Notes: ${c.notes}`,
            ].filter(Boolean).join('\n'),
            updatedAt: c.updatedAt ?? null,
          });
        });
      }

      for (let idx = 0; idx < contactEmbeddings.length; idx++) {
        const vr = contactEmbeddings[idx];
        const contactId = vr.contactId || (vr.metadata as Record<string, unknown>)?.contactId as string | undefined;
        const contactMeta = contactId ? contactContentMap.get(contactId) : undefined;
        const content = vr.content || contactMeta?.content || '';
        if (!content) continue;
        results.push({
          id: contactId || vr.id,
          content,
          score: 1 / (60 + idx + 1), // RRF score contribution
          metadata: { ...(vr.metadata || {}), type: 'contact', updatedAt: contactMeta?.updatedAt },
        });
      }
    } catch (error) {
      this.logger.warn(`Contact vector search failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { results, contactContentMap };
  }
}
