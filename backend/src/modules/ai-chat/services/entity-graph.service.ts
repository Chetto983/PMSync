import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

// ─── Result types ───────────────────────────────────────────

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
  maxHops?: number; // default 2, max 3
  limit?: number; // default 20
  edgeTypes?: string[]; // filter by edge type, default all
}

// ─── Service ────────────────────────────────────────────────

/**
 * EntityGraphService -- Multi-hop graph traversal via recursive CTE.
 *
 * Replaces GraphExpansionService (3 parallel SQL queries) with a proper
 * entity graph walk using GraphNode/GraphEdge tables. Supports:
 * - Seed node resolution via pg_trgm label similarity
 * - Recursive CTE traversal with cycle detection
 * - Hop-distance score decay (0.7^hop)
 * - Edge type filtering
 * - External ID lookup for direct entity access
 *
 * Phase 109 Plan 02
 */
@Injectable()
export class EntityGraphService {
  private readonly logger = new Logger(EntityGraphService.name);

  /** Default and maximum hop limits */
  private static readonly DEFAULT_MAX_HOPS = 2;
  private static readonly ABSOLUTE_MAX_HOPS = 3;
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly DEFAULT_SEED_LIMIT = 5;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Multi-hop graph traversal from seed nodes using recursive CTE.
   *
   * Follows edges bidirectionally, decaying score by hop distance.
   * Cycle detection via path array prevents infinite loops.
   *
   * @param tenantId - Tenant isolation
   * @param seedNodeIds - Starting node IDs for traversal
   * @param options - Traversal options (maxHops, limit, edgeTypes)
   * @returns Scored nodes reachable from seed nodes
   */
  async traverse(
    tenantId: string,
    seedNodeIds: string[],
    options?: TraverseOptions,
  ): Promise<GraphTraversalResult[]> {
    if (seedNodeIds.length === 0) return [];

    const maxHops = Math.min(
      options?.maxHops ?? EntityGraphService.DEFAULT_MAX_HOPS,
      EntityGraphService.ABSOLUTE_MAX_HOPS,
    );
    const limit = options?.limit ?? EntityGraphService.DEFAULT_LIMIT;
    const edgeTypes = options?.edgeTypes;

    const t0 = Date.now();

    try {
      // Build edge type filter clause
      const edgeTypeFilter = edgeTypes?.length
        ? Prisma.sql`AND e."edgeType" = ANY(${edgeTypes}::text[])`
        : Prisma.empty;

      const results = await this.prisma.$queryRaw<GraphTraversalResult[]>(
        Prisma.sql`
          WITH RECURSIVE graph_walk AS (
            -- Base case: seed nodes with hop=0, score=1.0
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

            -- Recursive case: follow edges bidirectionally
            SELECT
              n2.id AS "nodeId",
              n2."nodeType",
              n2.label,
              n2.metadata,
              gw.hop + 1 AS hop,
              gw.path || n2.id,
              gw.score * e.weight * power(0.7, gw.hop + 1) AS score,
              e."edgeType"
            FROM graph_walk gw
            JOIN graph_edges e ON (
              e."sourceId" = gw."nodeId" OR e."targetId" = gw."nodeId"
            ) AND e."tenantId" = ${tenantId}
            ${edgeTypeFilter}
            JOIN graph_nodes n2 ON n2.id = CASE
              WHEN e."sourceId" = gw."nodeId" THEN e."targetId"
              ELSE e."sourceId"
            END
            WHERE gw.hop < ${maxHops}
              AND NOT n2.id = ANY(gw.path)
          )
          SELECT DISTINCT ON ("nodeId")
            "nodeId", "nodeType", label, metadata, hop, score, "edgeType"
          FROM graph_walk
          ORDER BY "nodeId", score DESC
        `,
      );

      // Re-sort by score descending and apply limit
      results.sort(
        (a: GraphTraversalResult, b: GraphTraversalResult) => b.score - a.score,
      );
      const limited = results.slice(0, limit);

      const elapsed = Date.now() - t0;
      if (elapsed > 100) {
        this.logger.warn(
          `Slow graph traversal: ${elapsed}ms (seeds=${seedNodeIds.length}, hops=${maxHops})`,
        );
      }
      this.logger.debug(
        `Graph traversal: ${limited.length} nodes from ${seedNodeIds.length} seeds (${elapsed}ms)`,
      );

      return limited;
    } catch (error) {
      this.logger.warn(
        `Graph traversal failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Resolve a query string into GraphNode IDs via pg_trgm label similarity.
   *
   * @param tenantId - Tenant isolation
   * @param query - Search query string
   * @param limit - Max results (default 5)
   * @returns Array of node IDs matching the query
   */
  async findSeedNodes(
    tenantId: string,
    query: string,
    limit: number = EntityGraphService.DEFAULT_SEED_LIMIT,
  ): Promise<string[]> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT id
          FROM graph_nodes
          WHERE "tenantId" = ${tenantId}
            AND label % ${query}
          ORDER BY similarity(label, ${query}) DESC
          LIMIT ${limit}
        `,
      );
      return rows.map((r: { id: string }) => r.id);
    } catch (error) {
      this.logger.warn(
        `Seed node search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Look up graph nodes by their external ID (source record FK).
   *
   * @param tenantId - Tenant isolation
   * @param externalIds - Source record IDs (emailId, contactId, etc.)
   * @param nodeType - Optional filter by node type
   * @returns Nodes as GraphTraversalResult with hop=0, score=1.0
   */
  async getNodesByExternalId(
    tenantId: string,
    externalIds: string[],
    nodeType?: string,
  ): Promise<GraphTraversalResult[]> {
    try {
      const nodes = await this.prisma.graphNode.findMany({
        where: {
          tenantId,
          externalId: { in: externalIds },
          ...(nodeType ? { nodeType } : {}),
        },
      });

      return nodes.map(
        (n: {
          id: string;
          nodeType: string;
          label: string;
          metadata: unknown;
        }) => ({
          nodeId: n.id,
          nodeType: n.nodeType,
          label: n.label,
          metadata: (n.metadata ?? {}) as Record<string, unknown>,
          hop: 0,
          score: 1.0,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `External ID lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
