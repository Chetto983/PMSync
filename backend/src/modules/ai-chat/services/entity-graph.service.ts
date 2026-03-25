/**
 * EntityGraphService -- Multi-hop graph traversal via recursive CTEs.
 *
 * Replaces GraphExpansionService with proper entity graph model.
 * Uses GraphNode/GraphEdge tables for deterministic multi-hop traversal.
 *
 * Phase 109: Graph RAG Pipeline (Plan 02 + Plan 03)
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralEmbeddingService } from '../../ai/services/mistral-embedding.service';
import { validateEmbeddingVector } from '../../../common/utils/vector-validation';

export interface GraphTraversalResult {
  nodeId: string;
  nodeType: string;
  label: string;
  metadata: Record<string, unknown>;
  hop: number;
  score: number;
  edgeType?: string;
}

export interface TraverseOptions {
  maxHops?: number;
  limit?: number;
}

@Injectable()
export class EntityGraphService {
  private readonly logger = new Logger(EntityGraphService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralEmbeddingService: MistralEmbeddingService,
  ) {}

  /**
   * Find seed nodes for a query using label trigram search + optional vector similarity.
   */
  async findSeedNodes(
    tenantId: string,
    query: string,
    limit: number = 5,
  ): Promise<string[]> {
    try {
      // Trigram search on node labels
      const results = await this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT id FROM graph_nodes
          WHERE "tenantId" = ${tenantId}
            AND label % ${query}
          ORDER BY similarity(label, ${query}) DESC
          LIMIT ${limit}
        `,
      );
      return results.map((r) => r.id);
    } catch (error) {
      this.logger.warn(
        `findSeedNodes failed (non-blocking): ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Multi-hop traversal from seed nodes using recursive CTE.
   */
  async traverse(
    tenantId: string,
    seedNodeIds: string[],
    options?: TraverseOptions,
  ): Promise<GraphTraversalResult[]> {
    if (seedNodeIds.length === 0) return [];

    const maxHops = Math.min(options?.maxHops ?? 2, 3);
    const limit = options?.limit ?? 20;

    try {
      const results = await this.prisma.$queryRaw<GraphTraversalResult[]>(
        Prisma.sql`
          WITH RECURSIVE walk AS (
            SELECT
              n.id AS "nodeId",
              n."nodeType",
              n.label,
              n.metadata,
              0 AS hop,
              ARRAY[n.id] AS path,
              1.0::float AS score,
              NULL::text AS "edgeType"
            FROM graph_nodes n
            WHERE n."tenantId" = ${tenantId}
              AND n.id = ANY(${seedNodeIds}::text[])

            UNION ALL

            SELECT
              n2.id AS "nodeId",
              n2."nodeType",
              n2.label,
              n2.metadata,
              w.hop + 1 AS hop,
              w.path || n2.id,
              w.score * e.weight * power(0.7, w.hop + 1) AS score,
              e."edgeType"
            FROM walk w
            JOIN graph_edges e ON (e."sourceId" = w."nodeId" OR e."targetId" = w."nodeId")
              AND e."tenantId" = ${tenantId}
            JOIN graph_nodes n2 ON n2.id = CASE
              WHEN e."sourceId" = w."nodeId" THEN e."targetId"
              ELSE e."sourceId"
            END
            WHERE w.hop < ${maxHops}
              AND NOT n2.id = ANY(w.path)
          )
          SELECT DISTINCT ON ("nodeId")
            "nodeId", "nodeType", label, metadata, hop,
            MAX(score) OVER (PARTITION BY "nodeId") AS score,
            "edgeType"
          FROM walk
          ORDER BY "nodeId", score DESC
          LIMIT ${limit}
        `,
      );
      return results;
    } catch (error) {
      this.logger.warn(
        `traverse failed (non-blocking): ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Get graph nodes by their external IDs (e.g., contactId, emailId).
   */
  async getNodesByExternalId(
    tenantId: string,
    externalIds: string[],
    nodeType?: string,
  ): Promise<GraphTraversalResult[]> {
    if (externalIds.length === 0) return [];

    try {
      const where: Prisma.GraphNodeWhereInput = {
        tenantId,
        externalId: { in: externalIds },
        ...(nodeType ? { nodeType } : {}),
      };

      const nodes = await this.prisma.graphNode.findMany({
        where,
        select: {
          id: true,
          nodeType: true,
          label: true,
          metadata: true,
        },
      });

      return nodes.map((n) => ({
        nodeId: n.id,
        nodeType: n.nodeType,
        label: n.label,
        metadata: (n.metadata as Record<string, unknown>) ?? {},
        hop: 0,
        score: 1.0,
      }));
    } catch (error) {
      this.logger.warn(
        `getNodesByExternalId failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
