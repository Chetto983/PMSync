/**
 * EntityExtractionService - Extract entities and relationships from emails/contacts
 * and upsert them into the GraphNode/GraphEdge tables.
 *
 * Phase 109: Entity graph population piggybacked on embedding pipeline.
 * - Email extraction: LLM-based entity/relationship extraction via generateObject
 * - Contact extraction: Direct mapping (no LLM call needed)
 * - Toggle-able via ENTITY_EXTRACTION_ENABLED env var
 * - Fire-and-forget: errors are swallowed with logger.warn
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';

// ============ Types ============

export interface EmailExtractionParams {
  type: 'email';
  emailId: string;
  from: string | null;
  to: string | null;
  cc?: string | null;
  subject: string;
  bodySnippet: string;
}

export interface ContactExtractionParams {
  type: 'contact';
  contactId: string;
  displayName: string | null;
  company?: string | null;
  jobTitle?: string | null;
  emails?: { value: string; type?: string }[] | null;
}

export type ExtractionParams = EmailExtractionParams | ContactExtractionParams;

// ============ Zod Schema for LLM output ============

const entitySchema = z.object({
  type: z.enum(['person', 'organization', 'topic']),
  name: z.string(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const relationshipSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.enum(['sent', 'received', 'mentions', 'about']),
  metadata: z.record(z.string(), z.string()).optional(),
});

const extractionResultSchema = z.object({
  entities: z.array(entitySchema).default([]),
  relationships: z.array(relationshipSchema).default([]),
});

type ExtractionResult = z.infer<typeof extractionResultSchema>;

// ============ Prompt ============

const EXTRACTION_PROMPT = `Extract entities and relationships from this email.

Return a JSON object with:
- entities: people, organizations, and topics mentioned
- relationships: how entities relate to each other

Entity types: "person", "organization", "topic"
Relationship types: "sent" (sender to email), "received" (email to recipient), "mentions" (email mentions entity), "about" (email is about topic)

Rules:
- Extract the sender and all recipients as person entities
- Extract any organizations mentioned (companies, teams)
- Extract key topics/subjects discussed
- Create "sent" relationship from sender to email subject
- Create "received" relationship from email subject to each recipient
- Create "mentions"/"about" relationships for other entities
- Use exact names as they appear in the email
- Maximum 10 entities and 15 relationships per email`;

// ============ Service ============

@Injectable()
export class EntityExtractionService {
  private readonly logger = new Logger(EntityExtractionService.name);
  private readonly modelId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly modelProvider: OpenRouterProviderService,
  ) {
    this.modelId = this.configService.get<string>(
      'AI_MODEL_SIMPLE',
      'mistralai/mistral-small-2603',
    );
  }

  /**
   * Extract entities and relationships, then upsert into graph tables.
   * Errors are caught and logged -- never propagated to caller.
   */
  async extractAndUpsert(
    tenantId: string,
    params: ExtractionParams,
  ): Promise<void> {
    // Feature toggle
    const enabled = this.configService.get<string>(
      'ENTITY_EXTRACTION_ENABLED',
      'true',
    );
    if (enabled === 'false') return;

    if (params.type === 'contact') {
      await this.upsertContactNode(tenantId, params);
    } else {
      await this.extractAndUpsertEmail(tenantId, params);
    }
  }

  // ============ Contact Node (no LLM) ============

  private async upsertContactNode(
    tenantId: string,
    params: ContactExtractionParams,
  ): Promise<void> {
    const label = params.displayName || 'Unknown Contact';
    const metadata: Prisma.InputJsonValue = {
      ...(params.company ? { company: params.company } : {}),
      ...(params.jobTitle ? { jobTitle: params.jobTitle } : {}),
      ...(params.emails?.length
        ? { emails: params.emails.map((e) => e.value) }
        : {}),
    };

    const existingId = await this.findNodeIdByExternalId(
      tenantId,
      params.contactId,
    );

    if (existingId) {
      await this.prisma.graphNode.update({
        where: { id: existingId },
        data: { label, metadata },
      });
    } else {
      await this.prisma.graphNode.create({
        data: {
          tenantId,
          nodeType: 'contact',
          externalId: params.contactId,
          label,
          metadata,
        },
      });
    }
  }

  // ============ Email Extraction (LLM-based) ============

  private async extractAndUpsertEmail(
    tenantId: string,
    params: EmailExtractionParams,
  ): Promise<void> {
    // 1. Upsert the email node itself (no LLM needed)
    const emailNodeId = await this.upsertEmailNode(tenantId, params);

    // 2. Extract entities via LLM
    const extraction = await this.callLlmExtraction(params);
    if (!extraction) return; // LLM call failed, already logged

    // 3. Upsert entity nodes + edges
    await this.upsertExtractedEntities(
      tenantId,
      emailNodeId,
      params,
      extraction,
    );
  }

  private async upsertEmailNode(
    tenantId: string,
    params: EmailExtractionParams,
  ): Promise<string> {
    const metadata: Prisma.InputJsonValue = {
      from: params.from ?? '',
      to: params.to ?? '',
      snippet: params.bodySnippet.slice(0, 200),
    };

    const existingId = await this.findNodeIdByExternalId(
      tenantId,
      params.emailId,
    );

    if (existingId) {
      await this.prisma.graphNode.update({
        where: { id: existingId },
        data: { label: params.subject || 'Untitled', metadata },
      });
      return existingId;
    }

    const node = await this.prisma.graphNode.create({
      data: {
        tenantId,
        nodeType: 'email',
        externalId: params.emailId,
        label: params.subject || 'Untitled',
        metadata,
      },
    });
    return node.id;
  }

  private async callLlmExtraction(
    params: EmailExtractionParams,
  ): Promise<ExtractionResult | null> {
    const emailContext = [
      `From: ${params.from ?? 'unknown'}`,
      `To: ${params.to ?? 'unknown'}`,
      params.cc ? `CC: ${params.cc}` : null,
      `Subject: ${params.subject}`,
      `Body: ${params.bodySnippet.slice(0, 500)}`,
    ]
      .filter(Boolean)
      .join('\n');

    // Try generateObject (structured output) first
    try {
      const result = await generateObject({
        model: this.modelProvider.getChatModel(this.modelId),
        schema: extractionResultSchema,
        schemaName: 'EntityExtraction',
        system: EXTRACTION_PROMPT,
        prompt: emailContext,
        temperature: 0.1,
        maxOutputTokens: 800,
        abortSignal: AbortSignal.timeout(30_000),
      });

      return result.object;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('structured output')) {
        this.logger.warn(`LLM entity extraction failed: ${msg}`);
        return null;
      }
      this.logger.debug(
        `Structured output rejected, falling back to generateText: ${msg}`,
      );
    }

    // Fallback: generateText with JSON instruction + manual parse
    try {
      const { text } = await generateText({
        model: this.modelProvider.getChatModel(this.modelId),
        system: `${EXTRACTION_PROMPT}\n\nRespond with ONLY a JSON object, no markdown fences.`,
        prompt: emailContext,
        temperature: 0.1,
        maxOutputTokens: 800,
        abortSignal: AbortSignal.timeout(30_000),
      });

      const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      if (!cleaned || !cleaned.startsWith('{')) {
        this.logger.debug(
          `Entity extraction returned non-JSON response, skipping (subject: "${params.subject.slice(0, 40)}")`,
        );
        return null;
      }
      return extractionResultSchema.parse(JSON.parse(cleaned));
    } catch (fallbackError) {
      const msg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      this.logger.debug(`Entity extraction skipped (both modes failed): ${msg}`);
      return null;
    }
  }

  private async upsertExtractedEntities(
    tenantId: string,
    emailNodeId: string,
    params: EmailExtractionParams,
    extraction: ExtractionResult,
  ): Promise<void> {
    // Build a map of entity name -> node ID for edge creation
    const entityNodeMap = new Map<string, string>();
    entityNodeMap.set(params.subject || 'Untitled', emailNodeId);

    // Upsert each extracted entity as a graph node
    for (const entity of extraction.entities) {
      try {
        const nodeType =
          entity.type === 'person'
            ? 'contact'
            : entity.type === 'organization'
              ? 'contact'
              : 'topic';

        // For persons, try to find matching contact by email address
        let externalId: string | null = null;
        if (entity.type === 'person') {
          externalId = await this.findContactIdByName(tenantId, entity.name);
        }

        const nodeId = await this.upsertEntityNode(
          tenantId,
          nodeType,
          entity.name,
          externalId,
          (entity.metadata ?? {}) as Prisma.InputJsonValue,
        );
        entityNodeMap.set(entity.name, nodeId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to upsert entity node "${entity.name}": ${msg}`,
        );
      }
    }

    // Upsert edges for each relationship
    for (const rel of extraction.relationships) {
      try {
        const sourceId = entityNodeMap.get(rel.source);
        const targetId = entityNodeMap.get(rel.target);
        if (!sourceId || !targetId) continue;

        await this.prisma.graphEdge.upsert({
          where: {
            tenantId_sourceId_targetId_edgeType: {
              tenantId,
              sourceId,
              targetId,
              edgeType: rel.type,
            },
          },
          create: {
            tenantId,
            sourceId,
            targetId,
            edgeType: rel.type,
            weight: 1.0,
            metadata: (rel.metadata ?? {}) as Prisma.InputJsonValue,
          },
          update: {
            weight: { increment: 0.1 }, // Strengthen edges seen multiple times
            metadata: (rel.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to upsert edge "${rel.source}" -> "${rel.target}": ${msg}`,
        );
      }
    }
  }

  // ============ Helpers ============

  private async findNodeIdByExternalId(
    tenantId: string,
    externalId: string,
  ): Promise<string | null> {
    const node = await this.prisma.graphNode.findFirst({
      where: { tenantId, externalId },
      select: { id: true },
    });
    return node?.id ?? null;
  }

  private async upsertEntityNode(
    tenantId: string,
    nodeType: string,
    label: string,
    externalId: string | null,
    metadata: Prisma.InputJsonValue,
  ): Promise<string> {
    // For entities with an externalId, use that as the lookup key
    if (externalId) {
      const existingId = await this.findNodeIdByExternalId(
        tenantId,
        externalId,
      );
      if (existingId) {
        await this.prisma.graphNode.update({
          where: { id: existingId },
          data: { label, metadata },
        });
        return existingId;
      }
    }

    // For topic nodes or unknown contacts, use label + nodeType as dedup key
    const existing = await this.prisma.graphNode.findFirst({
      where: { tenantId, nodeType, label },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.graphNode.update({
        where: { id: existing.id },
        data: { metadata },
      });
      return existing.id;
    }

    const node = await this.prisma.graphNode.create({
      data: { tenantId, nodeType, externalId, label, metadata },
    });
    return node.id;
  }

  /**
   * Try to find a contact ID by name match in unified_contacts.
   * Returns null if no match found (the entity will be created without externalId).
   */
  private async findContactIdByName(
    tenantId: string,
    name: string,
  ): Promise<string | null> {
    if (!name || name.length < 2) return null;

    const contact = await this.prisma.contact.findFirst({
      where: {
        tenantId,
        OR: [
          { displayName: { equals: name, mode: 'insensitive' } },
          { firstName: { equals: name, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    return contact?.id ?? null;
  }
}
