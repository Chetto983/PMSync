-- NeMo-inspired: Add quality scoring fields to AI run ledger
ALTER TABLE "ai_run_ledger" ADD COLUMN "qualityScore" DOUBLE PRECISION;
ALTER TABLE "ai_run_ledger" ADD COLUMN "qualityMethod" TEXT;
