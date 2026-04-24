/**
 * Phase 150 D-01 helper for TriageBackfillSchedulerService.processAffinityPromotion.
 *
 * Extracted here so the scheduler service stays below the 700 LF cap while
 * keeping BullMQ wiring (queue/worker/cron) in the scheduler. These helpers
 * are pure functions: they take the Prisma client and metric Counter/Gauge
 * as explicit params instead of being class methods — the scheduler still
 * owns the DI surface and delegates the promotion math here.
 *
 * Invariants preserved verbatim from the Phase 149 pattern:
 *   - Every Prisma call includes explicit `tenantId` in the `where` clause
 *     (multi-tenant invariant — CLAUDE.md hard rule).
 *   - `promotionCounter.inc({ tenant_id, edge_type, action })` fires once per upsert.
 *   - Uses `weightCorrection(ageDays, { halfLifeDays })` — NEVER reimplements decay math.
 *
 * OpenClaw Dreaming 3/0.8 promotion gates:
 *   - weightedSum = sum(weightCorrection(ageDays, { halfLifeDays })) over reinforcing feedback
 *   - Edge upserted when weightedSum >= 0.8 AND distinctFeedbackRowCount >= 3
 *   - Domain aggregation additionally requires >= 3 distinct non-role senders
 *     (inherited from Phase 147 D-04 via triage-feedback.service.ts constants)
 *
 * B-3 contract: fb.newValue is resolved to a canonical Label.id via
 * prisma.userLabel.findFirst({ OR: [{id},{name}] }) BEFORE writing the label
 * GraphNode. Plan 05's LabelsService mirror hook writes externalId=Label.id,
 * so aligning here prevents disjoint node families (same labelId reused).
 *
 * Landmine §1 Option (b) deviation (Phase 150-02 orchestrator resume signal,
 * decision=option-b): `graph_nodes` does NOT have a (tenantId, nodeType,
 * externalId) unique constraint in the Phase 150-02 migration because the
 * duplicate-scan state was unknown at migration time (local Postgres not
 * running; prod DB URL loading forbidden per CLAUDE.md). Without the unique
 * constraint, `prisma.graphNode.upsert({ where: { tenantId_nodeType_externalId
 * : {...} } })` would be a compile-time type error (the compound key does
 * not exist on GraphNodeWhereUniqueInput). Instead, node upserts use a
 * find-then-create inside `prisma.$transaction(async tx => ...)` with
 * `SELECT ... FOR UPDATE LIMIT 1` to serialize concurrent inserts.
 *
 * Plan 03 (decay-gc third store) and Plan 05 (LabelsService mirror hook)
 * MUST use the same pattern when they ship so the node-family invariant
 * (all writers producing identical externalId for the same logical entity)
 * is preserved.
 */
import type { Counter, Gauge } from 'prom-client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { weightCorrection } from '../utils/triage-correction-weight';
import { extractDomain } from './triage-decay-gc.helpers';
import {
  MIN_DISTINCT_SENDERS_FOR_DOMAIN,
  ROLE_ACCOUNT_LOCAL_PARTS,
} from './triage-feedback.service';

export interface AffinityPromotionDeps {
  prisma: PrismaService;
  promotionCounter?: Counter<string>;
  activeEdgesGauge?: Gauge<string>;
  halfLifeDays: number;
}

export interface AffinityPromotionTenantResult {
  sendersPromoted: number;
  sendersUpdated: number;
  domainsPromoted: number;
  domainsUpdated: number;
}

/** OpenClaw Dreaming promotion gates — matches Phase 147 D-09b (TriageOverride promotion). */
export const AFFINITY_MIN_CONFIDENCE = 0.8;
export const AFFINITY_MIN_FEEDBACK_ROWS = 3;

/**
 * Landmine §1 Option (b): find-then-create inside a Prisma $transaction.
 *
 * Serializes concurrent inserts using `SELECT ... FOR UPDATE LIMIT 1` on the
 * candidate row. If no row exists, creates it. Always returns a
 * `{ id, label, externalId }` shape suitable for the caller to wire into a
 * GraphEdge upsert.
 *
 * Required because the Plan 02 migration does NOT add a (tenantId, nodeType,
 * externalId) unique constraint on graph_nodes (Option B path per resume
 * signal). Without the unique key, `prisma.graphNode.upsert` compile-errors
 * because the compound `tenantId_nodeType_externalId` WhereUniqueInput field
 * doesn't exist.
 *
 * Multi-tenant invariant: every SELECT and CREATE filters by `tenantId`.
 */
async function findOrCreateGraphNode(
  prisma: PrismaService,
  args: {
    tenantId: string;
    nodeType: string;
    externalId: string;
    label: string;
  },
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    // SELECT FOR UPDATE LIMIT 1 — serializes concurrent inserts for the same
    // (tenantId, nodeType, externalId) tuple. Parameterized to avoid SQL
    // injection via tenant input. tenantId scoping enforced in the WHERE
    // clause (multi-tenant invariant).
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM graph_nodes
      WHERE "tenantId" = ${args.tenantId}
        AND "nodeType" = ${args.nodeType}
        AND "externalId" = ${args.externalId}
      FOR UPDATE
      LIMIT 1
    `;
    if (existing.length > 0) {
      return { id: existing[0].id };
    }
    const created = await tx.graphNode.create({
      data: {
        tenantId: args.tenantId,
        nodeType: args.nodeType,
        externalId: args.externalId,
        label: args.label,
      },
      select: { id: true },
    });
    return created;
  });
}

/**
 * Phase 150 D-01: per-tenant nightly affinity promotion sweep.
 * Entry point: `processAffinityPromotionForTenant`.
 *
 * Pipeline:
 *   1. Fetch TriageOverride rows (type='sender') for this tenant.
 *   2. Fetch reinforcing EmailTriageFeedback rows for this tenant.
 *   3. Join Email.from → sender attribution.
 *   4. Aggregate (sender, targetLabel) → weighted-sum + distinct row count.
 *   5. For qualifying pairs (OpenClaw 3/0.8 gates), resolve fb.newValue →
 *      canonical Label.id (B-3) and upsert sender/label GraphNodes + edge.
 *   6. Domain aggregation: group by (domain, labelRaw), require ≥3 distinct
 *      non-role senders (Phase 147 D-04 inherited).
 *   7. Sample active-edges gauge.
 *
 * Returns counts for scheduler-level logging.
 */
export async function processAffinityPromotionForTenant(
  tenantId: string,
  deps: AffinityPromotionDeps,
  jobId: string,
  jobTimestamp: Date,
): Promise<AffinityPromotionTenantResult> {
  const { prisma, promotionCounter, activeEdgesGauge, halfLifeDays } = deps;
  let sendersPromoted = 0,
    sendersUpdated = 0,
    domainsPromoted = 0,
    domainsUpdated = 0;

  // Step 1: Fetch TriageOverride rows for this tenant of type 'sender'.
  const overrides = await prisma.triageOverride.findMany({
    where: { tenantId, type: 'sender' },
  });
  if (overrides.length === 0) {
    return {
      sendersPromoted: 0,
      sendersUpdated: 0,
      domainsPromoted: 0,
      domainsUpdated: 0,
    };
  }

  // Step 2: Fetch reinforcing feedback rows for this tenant.
  const feedbackRows = await prisma.emailTriageFeedback.findMany({
    where: { tenantId },
  });

  // Step 3: Join emails to resolve sender addresses.
  const emailIds = feedbackRows
    .map((f: { emailId: string }) => f.emailId)
    .filter(Boolean);
  const emails =
    emailIds.length > 0
      ? await prisma.email.findMany({
          where: { tenantId, id: { in: emailIds } },
        })
      : [];
  const emailFromById = new Map<string, string>(
    emails.map((e: { id: string; from: string | null }) => [
      e.id,
      (e.from ?? '').trim().toLowerCase(),
    ]),
  );

  // Step 4: Aggregate (sender, targetLabel) pairs with weightedSum + row count.
  const now = jobTimestamp.getTime();
  const senderAgg = new Map<
    string,
    {
      count: number;
      weightedSum: number;
      overrideIds: Set<string>;
      senderEmail: string;
      labelRaw: string;
    }
  >();
  const senderOverrideByPattern = new Map(
    overrides.map((o: { pattern: string; action: string; id: string }) => [
      o.pattern.trim().toLowerCase(),
      o,
    ]),
  );

  for (const fb of feedbackRows as Array<{
    emailId: string;
    newValue: string | null;
    createdAt: Date;
  }>) {
    const sender = emailFromById.get(fb.emailId);
    if (!sender) continue;
    const matchingOverride = senderOverrideByPattern.get(sender) as
      | { id: string; action: string }
      | undefined;
    if (!matchingOverride) continue;
    if (matchingOverride.action !== fb.newValue) continue;
    const labelRaw = fb.newValue as string;
    const key = `${sender}|${labelRaw}`;
    const ageDays = Math.max(
      0,
      (now - new Date(fb.createdAt).getTime()) / 86_400_000,
    );
    const w = weightCorrection(ageDays, { halfLifeDays });
    if (!senderAgg.has(key)) {
      senderAgg.set(key, {
        count: 0,
        weightedSum: 0,
        overrideIds: new Set(),
        senderEmail: sender,
        labelRaw,
      });
    }
    const entry = senderAgg.get(key)!;
    entry.count += 1;
    entry.weightedSum += w;
    entry.overrideIds.add(matchingOverride.id);
  }

  // Step 5: For each qualifying pair, resolve labelRaw -> canonical Label.id,
  // then upsert nodes + edge.
  for (const entry of senderAgg.values()) {
    if (entry.count < AFFINITY_MIN_FEEDBACK_ROWS) continue;
    if (entry.weightedSum < AFFINITY_MIN_CONFIDENCE) continue;

    // B-3: resolve fb.newValue to canonical Label.id. newValue may be stored
    // as either Label.id or Label.name depending on the callsite that wrote
    // the feedback row — tolerate both. Skip if no matching (non-archived)
    // label. userLabel scoped by tenantId (multi-tenant invariant, T-150-02-11).
    const label = await prisma.userLabel.findFirst({
      where: {
        tenantId,
        OR: [{ id: entry.labelRaw }, { name: entry.labelRaw }],
        isArchived: false,
      },
      select: { id: true, name: true },
    });
    if (!label) continue; // orphan newValue — skip silently
    const labelId = label.id;
    const labelName = label.name;

    // Landmine §1 Option (b): find-or-create the sender GraphNode inside a
    // $transaction with SELECT FOR UPDATE. No composite unique exists post-
    // migration so graphNode.upsert cannot be used.
    const senderNode = await findOrCreateGraphNode(prisma, {
      tenantId,
      nodeType: 'sender',
      externalId: entry.senderEmail,
      label: entry.senderEmail,
    });
    // Plan 05's LabelsService mirror hook writes externalId=labelId / label=labelName.
    // Use the SAME externalId here so node families align (B-3).
    const labelNode = await findOrCreateGraphNode(prisma, {
      tenantId,
      nodeType: 'label',
      externalId: labelId,
      label: labelName,
    });

    const existing = await prisma.graphEdge.count({
      where: {
        tenantId,
        sourceId: senderNode.id,
        targetId: labelNode.id,
        edgeType: 'SENDER_LABEL_AFFINITY',
      },
    });
    const computedConfidence = Math.min(
      1,
      entry.weightedSum / Math.max(entry.count, 1),
    );
    const derivedFromOverrideIds = Array.from(entry.overrideIds);
    const metadata = {
      derivedFromOverrideIds,
      promotionAudit: {
        jobId,
        jobTimestamp: jobTimestamp.toISOString(),
        computedConfidence,
        feedbackRowCount: entry.count,
        halfLifeDays,
      },
    };

    await prisma.graphEdge.upsert({
      where: {
        tenantId_sourceId_targetId_edgeType: {
          tenantId,
          sourceId: senderNode.id,
          targetId: labelNode.id,
          edgeType: 'SENDER_LABEL_AFFINITY',
        },
      },
      update: {
        confidence: computedConfidence,
        validFrom: jobTimestamp,
        metadata,
      },
      create: {
        tenantId,
        sourceId: senderNode.id,
        targetId: labelNode.id,
        edgeType: 'SENDER_LABEL_AFFINITY',
        confidence: computedConfidence,
        validFrom: jobTimestamp,
        metadata,
      },
    });

    const action: 'created' | 'updated' = existing > 0 ? 'updated' : 'created';
    if (action === 'created') sendersPromoted++;
    else sendersUpdated++;
    promotionCounter?.inc({
      tenant_id: tenantId,
      edge_type: 'SENDER_LABEL_AFFINITY',
      action,
    });
  }

  // Step 6: Domain aggregation. Inherit Phase 147 D-04: >= 3 distinct non-role
  // senders per (domain, labelId). Role-account local-parts (info, sales,
  // support, etc.) are excluded from the distinct-sender count.
  const domainAgg = new Map<
    string,
    {
      count: number;
      weightedSum: number;
      overrideIds: Set<string>;
      distinctSenders: Set<string>;
      distinctNonRoleSenders: Set<string>;
      domain: string;
      labelRaw: string;
    }
  >();
  for (const entry of senderAgg.values()) {
    const domain = extractDomain(entry.senderEmail);
    if (!domain) continue;
    const localPart = entry.senderEmail.split('@')[0];
    const isRole = ROLE_ACCOUNT_LOCAL_PARTS.has(localPart);
    const dKey = `${domain}|${entry.labelRaw}`;
    if (!domainAgg.has(dKey)) {
      domainAgg.set(dKey, {
        count: 0,
        weightedSum: 0,
        overrideIds: new Set(),
        distinctSenders: new Set(),
        distinctNonRoleSenders: new Set(),
        domain,
        labelRaw: entry.labelRaw,
      });
    }
    const d = domainAgg.get(dKey)!;
    d.count += entry.count;
    d.weightedSum += entry.weightedSum;
    for (const oid of entry.overrideIds) d.overrideIds.add(oid);
    d.distinctSenders.add(entry.senderEmail);
    if (!isRole) d.distinctNonRoleSenders.add(entry.senderEmail);
  }

  for (const d of domainAgg.values()) {
    if (d.distinctNonRoleSenders.size < MIN_DISTINCT_SENDERS_FOR_DOMAIN)
      continue;
    if (d.count < AFFINITY_MIN_FEEDBACK_ROWS) continue;
    if (d.weightedSum < AFFINITY_MIN_CONFIDENCE) continue;

    // B-3: domain aggregation also resolves labelRaw -> Label.id (tenant-scoped).
    const label = await prisma.userLabel.findFirst({
      where: {
        tenantId,
        OR: [{ id: d.labelRaw }, { name: d.labelRaw }],
        isArchived: false,
      },
      select: { id: true, name: true },
    });
    if (!label) continue;
    const labelId = label.id;
    const labelName = label.name;

    const domainNode = await findOrCreateGraphNode(prisma, {
      tenantId,
      nodeType: 'email_domain',
      externalId: d.domain,
      label: d.domain,
    });
    const labelNode = await findOrCreateGraphNode(prisma, {
      tenantId,
      nodeType: 'label',
      externalId: labelId,
      label: labelName,
    });

    const existing = await prisma.graphEdge.count({
      where: {
        tenantId,
        sourceId: domainNode.id,
        targetId: labelNode.id,
        edgeType: 'DOMAIN_LABEL_AFFINITY',
      },
    });
    const computedConfidence = Math.min(
      1,
      d.weightedSum / Math.max(d.count, 1),
    );
    const derivedFromOverrideIds = Array.from(d.overrideIds);
    const metadata = {
      derivedFromOverrideIds,
      promotionAudit: {
        jobId,
        jobTimestamp: jobTimestamp.toISOString(),
        computedConfidence,
        feedbackRowCount: d.count,
        halfLifeDays,
      },
    };
    await prisma.graphEdge.upsert({
      where: {
        tenantId_sourceId_targetId_edgeType: {
          tenantId,
          sourceId: domainNode.id,
          targetId: labelNode.id,
          edgeType: 'DOMAIN_LABEL_AFFINITY',
        },
      },
      update: {
        confidence: computedConfidence,
        validFrom: jobTimestamp,
        metadata,
      },
      create: {
        tenantId,
        sourceId: domainNode.id,
        targetId: labelNode.id,
        edgeType: 'DOMAIN_LABEL_AFFINITY',
        confidence: computedConfidence,
        validFrom: jobTimestamp,
        metadata,
      },
    });
    const action: 'created' | 'updated' = existing > 0 ? 'updated' : 'created';
    if (action === 'created') domainsPromoted++;
    else domainsUpdated++;
    promotionCounter?.inc({
      tenant_id: tenantId,
      edge_type: 'DOMAIN_LABEL_AFFINITY',
      action,
    });
  }

  // Step 7: Sample active-edges gauge at end of run.
  if (activeEdgesGauge) {
    for (const edgeType of [
      'SENDER_LABEL_AFFINITY',
      'DOMAIN_LABEL_AFFINITY',
    ] as const) {
      const active = await prisma.graphEdge.count({
        where: {
          tenantId,
          edgeType,
          OR: [{ validUntil: null }, { validUntil: { gt: jobTimestamp } }],
        },
      });
      activeEdgesGauge.set(
        { tenant_id: tenantId, edge_type: edgeType },
        active,
      );
    }
  }

  return { sendersPromoted, sendersUpdated, domainsPromoted, domainsUpdated };
}
