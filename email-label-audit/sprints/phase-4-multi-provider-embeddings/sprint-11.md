# Sprint 11 - Embedding Quality & Chunking

| Key | Value |
|-----|-------|
| Phase | 4 - Multi-Provider & Embeddings |
| Sprint | 11 |
| SP | 8 |
| Objective | Improve embedding retrieval quality by enriching text with metadata, fixing chunk overlap, and using locale-neutral prefixes |
| Addresses | E5, E6, E7 |

## Context

Current embedding pipeline composes text as `Subject + Body` only. Industry best practices for email RAG recommend:
1. Include structured metadata (sender, recipients, date) in embedding text
2. Use 20-30% overlap between chunks to preserve context at boundaries
3. Use English prefixes for embedding models trained primarily on English

These changes improve retrieval for entity-based queries ("email from Marco about the contract")
without changing the embedding model or vector dimensions.

## Sprint Backlog

### T-1101: Enrich embedding text with sender/recipient/date metadata [3 SP]

- [ ] Modify `EmbeddingComposerService.composeEmailEmbeddingContent()` to prepend:
  ```
  From: sender@example.com
  To: recipient@example.com
  Date: 2026-03-25
  Subject: Contract renewal

  [body text]
  ```
- [ ] Requires passing `from`, `to`, `receivedAt` to composer (currently only subject/body/snippet)
- [ ] Update `EmailContentInput` interface to include `from?`, `to?`, `receivedAt?`
- [ ] Update `createEmbeddingForEmail()` call sites to pass the new fields
- [ ] PII: `from` and `to` should be sanitized through PII detection (already available)
- [ ] Files: `embedding-composer.service.ts`, `knowledge-base.service.ts`, `email-embedding.queue.ts`

### T-1102: Fix chunk overlap to use 20% content overlap [2 SP]

- [ ] Current `chunkContentForEmbedding()` breaks at sentence boundaries but has NO overlap
- [ ] Add `overlapChars` parameter (default: 20% of `maxCharsPerChunk` = 1200 chars)
- [ ] After slicing chunk at `end`, set next `start = end - overlapChars`
- [ ] Ensure overlap starts at a sentence boundary (find previous `\n` from overlap point)
- [ ] Configurable via `AI_EMBEDDING_CHUNK_OVERLAP` env var (0-50%, default 20)
- [ ] Update existing chunk tests to verify overlap behavior
- [ ] Files: `embedding-composer.service.ts`, `embedding-composer.service.spec.ts`

### T-1103: Use locale-neutral English prefixes [1 SP]

- [ ] Replace `Oggetto:` with `Subject:` in `composeEmailEmbeddingContent()` (line 146)
- [ ] Replace `Oggetto:` with `Subject:` in `composeEmailEmbeddingContentWithAttachments()` (line 189)
- [ ] Embedding models (Mistral, OpenAI) are trained on English-dominant corpora
- [ ] Italian queries will still match because the semantic meaning is preserved in the body
- [ ] Files: `embedding-composer.service.ts`

### T-1104: Backfill existing embeddings with enriched format [2 SP]

- [ ] After T-1101/T-1102/T-1103 are deployed, existing embeddings use the old format
- [ ] Add migration flag: `EMBEDDING_REINDEX_REQUIRED=true` in metadata
- [ ] Modify `EmbeddingBackfillSchedulerService` to detect old-format embeddings (no `From:` prefix)
- [ ] Re-generate embeddings for emails with old format during backfill window
- [ ] Rate limit: reindex max 100 emails per backfill run (respect Mistral API limits)
- [ ] Add progress metric: `{ total, reindexed, remaining }` logged per run
- [ ] Files: `embedding-backfill-scheduler.service.ts`, `embedding-backfill.service.ts`

## Dependencies

- S10 complete (embedding lifecycle must be clean before changing format)

## Risks

- Re-generating embeddings costs Mistral API tokens
- Mitigation: Backfill is gradual (100/run), can be paused via env var
- Changing embedding text format means old and new embeddings coexist during backfill
- Mitigation: Both formats are semantically valid, retrieval quality improves gradually

## Definition of Done

- [ ] New embeddings include From/To/Date metadata
- [ ] Chunks overlap by 20% at sentence boundaries
- [ ] No Italian prefixes in embedding text
- [ ] Backfill service detects and re-generates old-format embeddings
- [ ] Existing composer tests updated for new format
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Manual test: query "email from [name] about [topic]" returns better results
