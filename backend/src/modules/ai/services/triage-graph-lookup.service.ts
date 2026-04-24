/**
 * Phase 150 D-03 / GRAPH-02: Layer 2 of the 3-layer triage stack.
 *
 * Single SQL query per triage call (D-03a):
 *   SELECT e.confidence, tgt.externalId as labelId, tgt.label as labelName, src.nodeType as sourceType
 *   FROM graph_edges e JOIN graph_nodes src ON src.id = e.sourceId JOIN graph_nodes tgt ON tgt.id = e.targetId
 *   WHERE e.tenantId = $1
 *     AND e.edgeType IN ('SENDER_LABEL_AFFINITY','DOMAIN_LABEL_AFFINITY')
 *     AND e.confidence >= 0.7
 *     AND (e.validUntil IS NULL OR e.validUntil > now())
 *     AND ((src.nodeType = 'sender' AND src.externalId = $2) OR (src.nodeType = 'email_domain' AND src.externalId = $3))
 *   ORDER BY (CASE WHEN src.nodeType = 'sender' THEN 0 ELSE 1 END), e.confidence DESC
 *   LIMIT 1;
 *
 * Read-only: SC-3 invariant — this service contains zero edge mutations
 * (no create/upsert/update/delete on the GraphEdge model).
 * Writer lives in triage-affinity-promotion.helpers.ts (Plan 02 Task 3).
 *
 * D-07 shadow counter contract: outcome='would_skip_shadow' emits
 * INDEPENDENTLY of the cutoff-check branch. Two counters can emit in one
 * call (e.g., cutoff=9999, confidence=0.95 -> emits shadow AND NOT skipped).
 *
 * Multi-tenant invariant: tenantId in WHERE clause (CLAUDE.md hard rule).
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import { PrismaService } from '../../../prisma/prisma.service';
// Phase 150.1 WR-04: shared extractDomain — single source of truth for
// D-04a (NO subdomain collapsing, NO + local-part stripping).
import { extractDomain } from '../utils/domain-extraction';

export interface GraphLookupResult {
  predictedLabelId: string;
  predictedLabelName: string;
  confidence: number;
  source: 'sender' | 'domain';
}

@Injectable()
export class TriageGraphLookupService {
  private readonly logger = new Logger(TriageGraphLookupService.name);
  private readonly cutoff: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() @InjectMetric('triage_graph_lookup_total')
    private readonly lookupCounter?: Counter<string>,
  ) {
    // Kill switch: cutoff default '9999' (effectively disabled — no short-circuit fires
    // until an operator sets a smaller value via the TRIAGE_GRAPH_CONFIDENCE_CUTOFF env).
    const raw = parseFloat(
      this.configService.get<string>('TRIAGE_GRAPH_CONFIDENCE_CUTOFF', '9999'),
    );
    this.cutoff = Number.isFinite(raw) ? raw : 9999;
  }

  async lookup(tenantId: string, senderEmail: string): Promise<GraphLookupResult | null> {
    // Phase 150.1 WR-04: extractDomain from the shared utility honors D-04a
    // (NO subdomain collapsing, NO + local-part stripping) — single source
    // of truth shared with triage-affinity-promotion.helpers.ts so a future
    // "helpful" refactor can't silently diverge the two normalization paths.
    const normalized = senderEmail.trim().toLowerCase();
    const domain = extractDomain(normalized);
    if (!domain) {
      this.lookupCounter?.inc({
        outcome: 'missed',
        edge_source: 'none',
        tenant_id: tenantId,
      });
      return null;
    }

    // D-03a exact query — ORDER BY enforces D-05 sender-beats-domain precedence.
    const rows = await this.prisma.$queryRaw<
      Array<{
        confidence: number;
        labelId: string;
        labelName: string;
        sourceType: string;
      }>
    >`
      SELECT
        e."confidence" AS confidence,
        tgt."externalId" AS "labelId",
        tgt."label" AS "labelName",
        src."nodeType" AS "sourceType"
      FROM "graph_edges" e
      JOIN "graph_nodes" src ON src."id" = e."sourceId"
      JOIN "graph_nodes" tgt ON tgt."id" = e."targetId"
      WHERE e."tenantId" = ${tenantId}
        AND e."edgeType" IN ('SENDER_LABEL_AFFINITY', 'DOMAIN_LABEL_AFFINITY')
        AND e."confidence" >= 0.7
        AND (e."validUntil" IS NULL OR e."validUntil" > now())
        AND (
          (src."nodeType" = 'sender' AND src."externalId" = ${normalized})
          OR (src."nodeType" = 'email_domain' AND src."externalId" = ${domain})
        )
      ORDER BY (CASE WHEN src."nodeType" = 'sender' THEN 0 ELSE 1 END), e."confidence" DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      this.lookupCounter?.inc({
        outcome: 'missed',
        edge_source: 'none',
        tenant_id: tenantId,
      });
      return null;
    }

    const row = rows[0];
    const source: 'sender' | 'domain' = row.sourceType === 'sender' ? 'sender' : 'domain';

    // D-07 shadow counter — ALWAYS emits when confidence >= 0.9, regardless
    // of cutoff. This MUST NOT be nested inside the cutoff branch below
    // (Failure Mode §4 — if the planner nests it, the counter falls silent
    // on the default cutoff=9999 first-deploy state, defeating SC-4 measurement).
    if (row.confidence >= 0.9) {
      this.lookupCounter?.inc({
        outcome: 'would_skip_shadow',
        edge_source: source,
        tenant_id: tenantId,
      });
    }

    // Separate branch — classify into skipped | hinted | missed-for-LLM.
    if (row.confidence >= this.cutoff) {
      this.lookupCounter?.inc({
        outcome: 'skipped',
        edge_source: source,
        tenant_id: tenantId,
      });
    } else if (row.confidence >= 0.7) {
      this.lookupCounter?.inc({
        outcome: 'hinted',
        edge_source: source,
        tenant_id: tenantId,
      });
    } else {
      // Should not reach here because the SQL WHERE confidence >= 0.7 excludes lower
      this.lookupCounter?.inc({
        outcome: 'missed',
        edge_source: source,
        tenant_id: tenantId,
      });
    }

    return {
      predictedLabelId: row.labelId,
      predictedLabelName: row.labelName,
      confidence: row.confidence,
      source,
    };
  }
}
