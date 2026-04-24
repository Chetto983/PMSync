-- Phase 150 D-02: add nullable affinity columns + 2 compound indexes to graph_edges.
-- Nullable-additive migration: no destructive statements, no NOT NULL backfill.
-- Legacy 7 edge types ('sent', 'received', 'mentions', 'replies_to', 'about',
-- 'attended', 'anchored_to') keep NULL in all three new columns; new edge types
-- 'SENDER_LABEL_AFFINITY' and 'DOMAIN_LABEL_AFFINITY' populate them.

-- AlterTable
ALTER TABLE "graph_edges" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "graph_edges_tenantId_edgeType_confidence_idx" ON "graph_edges"("tenantId", "edgeType", "confidence");

-- CreateIndex
CREATE INDEX "graph_edges_tenantId_edgeType_validUntil_idx" ON "graph_edges"("tenantId", "edgeType", "validUntil");
