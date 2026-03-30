# Sprint 09 — Checkpoint

## Stato
- **Sprint:** 09 — Lead Scoring: Feature Engineering
- **Last Task Completed:** T-0911 — Integration test
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 11/11
- **SP Completed:** 18/18
- **Last Updated:** 2026-03-27 11:00

## Key Architecture Decision: LLM-Based Scoring
Original plan called for ml.js gradient boosting (T-0907/T-0908/T-0909).
**Pivoted to LLM-based scoring** via OpenRouter + Mistral Small because:
- No viable gradient boosting library in JS (ml.js only has Random Forest)
- Zero training data needed (no cold-start problem)
- Natural language explanations (reasons array) for free
- Cost: ~$0.00006 per contact scored
- Future: LLM scores can be used as labels to train a local model later

## Last Modified Files
- backend/prisma/schema.prisma (LeadScore, LeadFeatureStore, ModelEvaluation models)
- backend/src/modules/crm/lead-scoring/engagement-feature.service.ts (new)
- backend/src/modules/crm/lead-scoring/firmographic-feature.service.ts (new)
- backend/src/modules/crm/lead-scoring/behavioral-feature.service.ts (new)
- backend/src/modules/crm/lead-scoring/feature-store.service.ts (new)
- backend/src/modules/crm/lead-scoring/lead-scoring.service.ts (new — LLM scoring)
- backend/src/modules/crm/lead-scoring/lead-feature-job.service.ts (new — BullMQ nightly)
- backend/src/modules/crm/lead-scoring/lead-scoring.module.ts (new)
- backend/src/modules/crm/lead-scoring/controllers/lead-score.controller.ts (new)
- backend/src/modules/crm/lead-scoring/dto/lead-score.dto.ts (new)
- backend/src/modules/crm/lead-scoring/__tests__/lead-scoring.test.ts (new)
- backend/src/modules/crm/crm.module.ts (added LeadScoringModule)
- backend/src/common/services/scheduled-jobs.queue.ts (LEAD_FEATURE_COMPUTE job type)

## Patterns Established
- Feature extraction: 3 services (engagement, firmographic, behavioral) → FeatureStoreService orchestrates
- 27 named features, FeatureStoreService.toFeatureVector() for ML/prompt input
- LLM scoring via generateObject() + Zod schema (same pattern as entity-extraction)
- Nightly pipeline: compute features → LLM score → persist LeadScore → cleanup expired (90d)
- API: GET /crm/leads/scores (paginated), GET /crm/leads/:contactId/score, POST /crm/leads/:contactId/score (on-demand)
- Model ID from AI_MODEL_SIMPLE env var (mistralai/mistral-small-2603)

## Blockers / Notes
- ModelEvaluation table exists but unused (LLM approach doesn't train/evaluate models yet)
- Feature store cleanup runs in same job as scoring — may want separate schedule for large tenants
- Calendar meeting count uses raw SQL JSONB query (attendees is Json?, not string[])

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: N/A (no frontend changes this sprint)
- Circular deps: ✅ zero
- Unit tests: ✅ 10/10 passing (vitest)
- Prisma db push: ✅ schema synced to Railway

## Production Validation (2026-03-30)

- Railway `/health`: ✅ 200 — DB, Redis, Mistral up
- `GET /crm/leads/scores`: ✅ 401 (route registered, auth guard active)
- `GET /crm/leads/:contactId/score`: ✅ 401 (route registered)
- `POST /crm/leads/:contactId/score`: ✅ 403 (route registered, guard active)
- Backend tsc: ✅ clean
- No frontend changes in Sprint 09 (Lead Scoring API backend-only)
