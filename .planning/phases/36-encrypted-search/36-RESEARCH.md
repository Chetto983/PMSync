# Phase 36: Encrypted Search - Research

**Researched:** 2026-03-04
**Domain:** HMAC blind indexes for searchable encrypted fields (Email.from)
**Confidence:** HIGH

## Summary

Phase 36 implements HMAC-SHA256 blind indexes on the Email `from` field for exact-match sender lookup, with a backfill job and dual-path search. The project already has substantial infrastructure in place: field-level encryption (AES-256-GCM via Prisma extension), per-tenant HKDF key derivation (`TenantKeyService`), an existing `hashForSearch()` utility (currently unused, SHA-256 based -- needs upgrade to HMAC-SHA256), and a proven backfill script pattern (`backfill-encryption.ts`). The `from` field currently has both a B-tree index (`@@index([tenantId, from])`) and a trigram GIN index (`from(ops: raw("gin_trgm_ops"))`).

The critical design constraint is that `subject` stays plaintext. The `from` field is only encrypted for exact-match via blind index because substring search (`contains`, `mode: 'insensitive'`) is fundamentally incompatible with deterministic hashing -- you cannot compute HMAC of a substring and expect it to match the HMAC of the full string. Subject uses `contains` search pervasively and is critical for UX. This is already documented as an out-of-scope decision in REQUIREMENTS.md.

**Primary recommendation:** Add a `fromHash` nullable column to Email, upgrade `hashForSearch()` to use `createHmac('sha256', key)` with a dedicated HMAC key derived via HKDF from the field encryption master key, add a `@@index([tenantId, fromHash])` index, build a BullMQ backfill job modeled on `backfill-encryption.ts`, and migrate the 2 exact-match query sites (`{ from: { in: [...] } }`) to use `fromHash`. The 5 `contains`-based query sites remain on plaintext `from` -- they are not exact-match and cannot use blind indexes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-02 | HMAC-SHA256 blind indexes on `from` field for exact-match sender lookup, with backfill job and dual-path search | Full infrastructure exists: TenantKeyService for HKDF key derivation, hashForSearch() stub, backfill-encryption.ts pattern, Prisma extension for field-level ops. Upgrade hashForSearch to HMAC-SHA256, add fromHash column, backfill, migrate 2 exact-match query sites. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `crypto` | built-in | HMAC-SHA256 computation | `crypto.createHmac('sha256', key)` -- no external dependency needed |
| Prisma | 7.x (project version) | Schema migration, query | Already in use; add `fromHash String?` column with index |
| BullMQ | (project version) | Backfill job queue | Existing pattern for background processing |
| HKDF (`crypto.hkdfSync`) | built-in | Derive HMAC key from master | Already used in TenantKeyService for encryption keys |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TenantKeyService | existing | Per-tenant key derivation | Derive HMAC key with different info label |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled HMAC | CipherSweet.js | CipherSweet adds Bloom filter-based indexes with tunable false-positive rates; overkill for single exact-match field. Our `from` field is a single column with one hash -- CipherSweet's complexity (multi-index planning, output size tuning) adds no value here. |
| SHA-256 (current hashForSearch) | HMAC-SHA256 | SHA-256 with salt concatenation is weaker than HMAC -- HMAC has provable security properties (PRF under key), resistant to length-extension attacks. Upgrade is trivial: `createHmac` instead of `createHash`. |
| Argon2id | HMAC-SHA256 | Argon2id is memory-hard (anti-brute-force) but far too slow for per-row computation during sync. HMAC-SHA256 is the standard for blind indexes in application-level encryption. |

**Installation:**
```bash
# No new packages needed -- all from Node.js built-in crypto
```

## Architecture Patterns

### Recommended Changes
```
backend/
├── prisma/
│   ├── schema.prisma                          # Add fromHash String? + index
│   └── migrations/YYYYMMDD_add_from_hash/     # Migration
├── src/
│   ├── prisma/encryption/
│   │   ├── field-encryption.utils.ts          # Upgrade hashForSearch -> hmacForBlindIndex
│   │   └── encryption.config.ts              # Add fromHash to Email config
│   ├── common/services/
│   │   ├── tenant-key.service.ts             # Add getHmacKey() with different HKDF info label
│   │   └── hash-search.service.ts            # NEW: HashSearchService (compute hash, dual-path query)
│   ├── scripts/
│   │   └── backfill-from-hash.ts             # NEW: Backfill job (modeled on backfill-encryption.ts)
│   └── [query sites]                          # Migrate exact-match sites
└── docs/
    └── adr/                                   # ADR: subject plaintext, fromHash design
```

### Pattern 1: HMAC Blind Index Computation
**What:** Deterministic keyed hash of normalized `from` value
**When to use:** On every email create/upsert + during backfill
**Example:**
```typescript
// In field-encryption.utils.ts
import { createHmac } from 'crypto';

/**
 * Compute HMAC-SHA256 blind index for exact-match search.
 * Uses a dedicated HMAC key (NOT the encryption key).
 * Normalizes: lowercase + trim for case-insensitive exact match.
 */
export function hmacForBlindIndex(
  value: string,
  hmacKey: Buffer,
): string {
  const normalized = value.toLowerCase().trim();
  return createHmac('sha256', hmacKey)
    .update(normalized)
    .digest('hex');
}
```

### Pattern 2: Dual-Path Search (During & After Backfill)
**What:** Query `fromHash` when populated, fall back to plaintext `from` when null
**When to use:** During backfill transition period; becomes hash-only after backfill completes
**Example:**
```typescript
// HashSearchService
async findByExactSender(
  tenantId: string,
  senderEmail: string,
): Promise<Prisma.EmailWhereInput> {
  const hmacKey = this.tenantKeyService.getHmacKey(tenantId);
  const hash = hmacForBlindIndex(senderEmail, hmacKey);

  // Dual-path: hash if populated, plaintext fallback
  return {
    tenantId,
    OR: [
      { fromHash: hash },
      { fromHash: null, from: senderEmail }, // fallback during backfill
    ],
  };
}
```

### Pattern 3: HKDF Key Separation
**What:** Derive HMAC key from same master key but with distinct info label
**When to use:** Always -- HMAC key MUST be different from encryption key
**Example:**
```typescript
// In TenantKeyService
private readonly HMAC_INFO_LABEL = 'pmsync-blind-index-v1';

getHmacKey(tenantId: string): Buffer {
  const cacheKey = `hmac:${tenantId}`;
  const cached = this.cache.get(cacheKey);
  if (cached) return cached;

  const key = Buffer.from(
    hkdfSync('sha256', this.masterKey, tenantId, this.HMAC_INFO_LABEL, 32)
  );
  this.cache.set(cacheKey, key);
  return key;
}
```

### Pattern 4: Write-Path Hash Injection
**What:** Compute and set `fromHash` whenever `from` is written
**When to use:** In the Prisma encryption extension or in sync processors
**Example:**
```typescript
// Option A: In field-encryption.extension.ts (Prisma middleware)
// On Email create/update, if data.from exists, compute fromHash
if (modelName === 'Email' && typedArgs.data?.from && tenantId) {
  const hmacKey = getHmacKeyForTenant(tenantId);
  typedArgs.data.fromHash = hmacForBlindIndex(typedArgs.data.from, hmacKey);
}

// Option B: Directly in sync-message-processor.service.ts (more explicit)
// Set fromHash alongside from when creating/upserting emails
```

### Anti-Patterns to Avoid
- **Reusing the encryption key as HMAC key:** The encryption key and HMAC key MUST be cryptographically separated. Same master key is fine -- different HKDF info label is mandatory.
- **Trying to support substring search via blind index:** `contains` queries are fundamentally incompatible with deterministic hashing. Don't even try. Leave `from` plaintext for `contains` queries.
- **Making fromHash NOT NULL immediately:** The column must start nullable, backfill populates it, and it can remain nullable indefinitely (dual-path handles it). Making it NOT NULL would block the migration on large tables.
- **Using SHA-256 with string concatenation instead of HMAC:** The existing `hashForSearch()` uses `createHash('sha256').update(salt:tenantId:value)` -- this is weaker than HMAC. Use `createHmac('sha256', key).update(value)` for proper PRF security.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key derivation | Custom key mixing | `crypto.hkdfSync('sha256', master, salt, info, 32)` | HKDF is the standard; already used in TenantKeyService |
| HMAC computation | SHA-256 + string concat | `crypto.createHmac('sha256', key)` | HMAC has provable PRF properties, resistant to length-extension |
| Batch backfill | One-shot SQL UPDATE | Paginated per-tenant loop (backfill-encryption.ts pattern) | Composite PK prevents cursor-based pagination; skip+take is proven |
| Constant-time comparison | `===` string compare | `crypto.timingSafeEqual()` | Only needed if comparing HMAC outputs server-side (not for DB WHERE) |

**Key insight:** The existing `backfill-encryption.ts` is the exact template for the fromHash backfill. Same per-tenant loop, same skip+take pagination for composite PK, same idempotency check (skip if `fromHash` already populated).

## Common Pitfalls

### Pitfall 1: Case Sensitivity in Hash
**What goes wrong:** `John@Example.COM` and `john@example.com` produce different hashes, so exact-match fails.
**Why it happens:** Email addresses are case-insensitive per RFC 5321 (local part can technically be case-sensitive, but in practice everyone treats them as case-insensitive).
**How to avoid:** Always normalize to lowercase + trim BEFORE hashing: `value.toLowerCase().trim()`.
**Warning signs:** Search misses for emails where provider returns mixed-case sender addresses.

### Pitfall 2: Format Variations in `from` Field
**What goes wrong:** Some emails store `from` as `"John Doe <john@example.com>"` while others store just `john@example.com`. The hash of the full string differs from the hash of just the email address.
**Why it happens:** Different mail providers return different formats. Gmail returns `name <email>`, IMAP may return bare email.
**How to avoid:** Extract the email address portion only before hashing. Check how `sync-message-processor.service.ts` normalizes `from` on write -- it currently stores `canonicalMsg.from.email` (just the email address). Verify this is consistent across all providers.
**Warning signs:** Audit all write paths to ensure `from` always contains just the email (not `Name <email>` format).

### Pitfall 3: fromHash Not Computed on All Write Paths
**What goes wrong:** Some emails get created without a `fromHash`, causing permanent fallback to plaintext path.
**Why it happens:** Multiple write paths exist (sync processors, send service, upserts) and not all are instrumented.
**How to avoid:** Use the Prisma extension middleware to inject `fromHash` on ALL Email create/update operations -- this is the centralized approach. Alternatively, list every write path and instrument each one.
**Warning signs:** After backfill, query `SELECT COUNT(*) FROM emails WHERE "fromHash" IS NULL AND "from" IS NOT NULL` -- should be zero.

### Pitfall 4: Frequency Analysis on fromHash
**What goes wrong:** An attacker with DB read access can see which emails share the same `fromHash`, revealing sender frequency patterns.
**Why it happens:** Deterministic hashing -- same input always produces same output. This is inherent to blind indexes.
**How to avoid:** Acknowledge in threat model. Per-tenant HKDF derivation means cross-tenant analysis is not possible. Within a single tenant, frequency patterns are visible but require the tenant's own DB to be breached. Mitigation: this is an accepted tradeoff for exact-match search capability.
**Warning signs:** This is a known limitation, not a bug. Document it clearly.

### Pitfall 5: Migration on Large Table
**What goes wrong:** Adding a column + index to a table with millions of rows can lock the table.
**Why it happens:** PostgreSQL `ALTER TABLE ADD COLUMN` with a default value can rewrite the table in older versions. Adding an index non-concurrently locks writes.
**How to avoid:** Add nullable column (no default = instant in PG 11+), create index with `CREATE INDEX CONCURRENTLY` in a custom migration SQL. Prisma doesn't support `CONCURRENTLY` natively -- edit the generated migration SQL.
**Warning signs:** Migration takes more than a few seconds on production.

## Code Examples

### Example 1: Upgrading hashForSearch to HMAC
```typescript
// Source: field-encryption.utils.ts (to be modified)
import { createHmac } from 'crypto';

/**
 * Compute HMAC-SHA256 blind index for exact-match search on encrypted fields.
 *
 * Uses HMAC (not raw SHA-256) for provable PRF security.
 * Key is derived per-tenant via HKDF with a distinct info label.
 *
 * @param value - The plaintext value to hash (e.g., sender email)
 * @param hmacKey - Tenant-specific HMAC key (32 bytes, from HKDF)
 * @returns hex-encoded HMAC digest (64 chars)
 */
export function hmacForBlindIndex(value: string, hmacKey: Buffer): string {
  const normalized = value.toLowerCase().trim();
  return createHmac('sha256', hmacKey).update(normalized).digest('hex');
}
```

### Example 2: Schema Change
```prisma
// In schema.prisma, Email model
model Email {
  // ... existing fields ...
  from                 String
  fromHash             String?                 // HMAC-SHA256 blind index for exact-match sender search
  // ... rest of fields ...

  @@index([tenantId, fromHash])               // B-tree index for exact-match lookups
  // Existing indexes remain:
  // @@index([tenantId, from])                // Keep for contains queries during transition
  // @@index([from(ops: raw("gin_trgm_ops"))], type: Gin)  // Keep for substring search
}
```

### Example 3: Backfill Job (modeled on backfill-encryption.ts)
```typescript
// Source: backfill-from-hash.ts (new file, follows backfill-encryption.ts pattern)
export async function backfillFromHash(
  prisma: PrismaClient,
  tenantKeyService: TenantKeyService,
  options: { batchSize?: number; dryRun?: boolean } = {},
): Promise<{ totalProcessed: number; totalHashed: number }> {
  const batchSize = options.batchSize ?? 200;
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  let totalProcessed = 0;
  let totalHashed = 0;

  for (const tenant of tenants) {
    const hmacKey = tenantKeyService.getHmacKey(tenant.id);
    let offset = 0;

    while (true) {
      const emails = await prisma.email.findMany({
        where: { tenantId: tenant.id, fromHash: null, from: { not: '' } },
        select: { id: true, tenantId: true, from: true },
        skip: offset,
        take: batchSize,
        orderBy: { id: 'asc' },
      });

      if (emails.length === 0) break;

      if (!options.dryRun) {
        await prisma.$transaction(
          emails.map(e =>
            prisma.email.update({
              where: { id_tenantId: { id: e.id, tenantId: e.tenantId } },
              data: { fromHash: hmacForBlindIndex(e.from, hmacKey) },
            })
          )
        );
      }

      totalProcessed += emails.length;
      totalHashed += emails.length;
      offset += emails.length;
    }
  }

  return { totalProcessed, totalHashed };
}
```

### Example 4: Dual-Path Query Migration
```typescript
// Before (exact-match via plaintext):
where: {
  OR: [
    { from: { in: emails } },    // meeting-prep.service.ts line 236
    { to: { hasSome: emails } },
  ],
}

// After (dual-path with fromHash):
const hashes = emails.map(e => hmacForBlindIndex(e, hmacKey));
where: {
  OR: [
    { fromHash: { in: hashes } },                          // hash path
    { fromHash: null, from: { in: emails } },              // fallback during backfill
    { to: { hasSome: emails } },
  ],
}
```

## Complete `from` Query Site Audit

### Exact-Match Sites (MIGRATE to fromHash)
| # | File | Line | Pattern | Action |
|---|------|------|---------|--------|
| 1 | `calendar/services/meeting-prep.service.ts` | 236 | `from: { in: emails }` | Migrate to `fromHash: { in: hashes }` + fallback |
| 2 | `contacts/services/relationship-score.service.ts` | 133 | `from: { in: allEmails }` | Migrate to `fromHash: { in: hashes }` + fallback |

### Contains/Substring Sites (KEEP on plaintext `from`)
| # | File | Line | Pattern | Reason |
|---|------|------|---------|--------|
| 3 | `email/services/email-folder.service.ts` | 297 | `from: { contains: filters.from, mode: 'insensitive' }` | Substring search -- incompatible with blind index |
| 4 | `email/services/email-folder.service.ts` | 312 | `from: { contains: filters.search, mode: 'insensitive' }` | General search -- substring |
| 5 | `email/services/email-crud.service.ts` | 109 | `from: { contains: vipEmail, mode: 'insensitive' }` | VIP filter -- substring match |

### Read-Only / Display Sites (NO CHANGE needed)
| # | File | Pattern | Reason |
|---|------|---------|--------|
| 6 | `ai/services/briefing.service.ts` | `select: { from: true }` | Read for display |
| 7 | `ai/services/draft-generation.service.ts` | `from: email.from` | Read for display |
| 8 | `ai/services/follow-up-detection.service.ts` | `from: e.from` | Read for display |
| 9 | `ai/services/email-triage.service.ts` | `parseSenderFromField(from)` | Read for parsing |
| 10 | `ai/services/cache-prewarming.service.ts` | `groupBy: ['from']` | Aggregation on plaintext |
| 11 | `ai-chat/tools/email-tools.service.ts` | `from: email.from` | Read for display |
| 12 | `email/tools/email-search.tool.ts` | `from: e.from` | Read for display |
| 13 | `email/services/email-search.service.ts` | `from: true` | Select for display |
| 14 | `ai-chat/services/hybrid-search.service.ts` | `from: row.from` | Read from SQL result |
| 15 | `contacts/services/contacts-import.service.ts` | `select: { from: true }` | Read for import |
| 16 | `email-sync/services/sync-message-processor.service.ts` | `from: canonicalMsg.from.email` | Write path -- needs fromHash injection |
| 17 | `ai/services/embedding-backfill.service.ts` | `from: email.from` | Read for embedding |

### Write Paths (NEED fromHash injection)
| # | File | Line | Pattern | Action |
|---|------|------|---------|--------|
| W1 | `sync-message-processor.service.ts` | 229 | `from: canonicalMsg.from.email` (create) | Compute + set fromHash |
| W2 | `sync-message-processor.service.ts` | 383 | `from: result.from` (upsert) | Compute + set fromHash |
| W3 | `sync-message-processor.service.ts` | 494 | `from: msg.from.email` (create) | Compute + set fromHash |
| W4 | `sync-message-processor.service.ts` | 601 | `from: result.from` (upsert) | Compute + set fromHash |
| W5 | `email-send.service.ts` | 238 | `from: ''` (placeholder) | Hash of empty string -- harmless |
| W6 | `email-crud.service.ts` | 542 | `from: ''` (draft) | Hash of empty string -- harmless |

**Recommended approach:** Inject `fromHash` in the Prisma field-encryption extension (centralized) to catch ALL write paths automatically, rather than modifying each service individually.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SHA-256 concat (`salt:tenant:value`) | HMAC-SHA256 with dedicated key | Always was best practice | PRF security, no length-extension risk |
| CipherSweet library | Built-in `crypto.createHmac` | N/A | Single-field exact-match doesn't need CipherSweet's complexity |
| Encrypt-then-search (decrypt all, filter) | Blind index | N/A | O(1) index lookup vs O(n) decrypt-and-scan |

**Why not CipherSweet.js:**
CipherSweet is designed for multi-index, multi-field searchable encryption with tunable Bloom filters. Our use case is a single column (`from`) with a single blind index for exact match. The overhead of integrating CipherSweet (new dependency, different key management model, Bloom filter tuning) is not justified. Node.js `crypto.createHmac` is sufficient and already used throughout the codebase for HMAC operations.

## Threat Model Summary

### What Blind Index Protects Against
- **Offline DB theft:** Attacker with database dump cannot read sender email addresses from `fromHash` without the HMAC key (which lives on the application server, not in the DB).
- **SQL injection (read-only):** Attacker can see hashes but cannot reverse them to sender emails.
- **Cross-tenant analysis:** Per-tenant HKDF key derivation means the same sender email produces different hashes for different tenants.

### What Blind Index Does NOT Protect Against
- **Frequency analysis (within tenant):** Same sender always produces the same hash. An attacker with DB access can see that X rows share the same `fromHash`, inferring sending frequency. This is inherent to deterministic hashing.
- **Known-plaintext attack:** If attacker knows a specific sender's email AND has DB access, they cannot compute the hash (no HMAC key). But if they can also inject data via the application (legitimate user), they could hash their known address and find matches.
- **Application-level compromise:** If attacker has the HMAC key (app server breach), blind indexes provide no protection.

### Accepted Tradeoffs
1. Frequency analysis is acknowledged and documented -- it's the fundamental cost of exact-match searchable encryption.
2. The `from` field stays in plaintext alongside `fromHash` (Phase 36 does NOT encrypt `from`). Future phases could encrypt `from` itself; `fromHash` enables search even after that encryption.
3. `subject` remains fully plaintext -- substring search is critical for UX and incompatible with blind indexes.

## Open Questions

1. **fromHash computation in Prisma extension vs service-level**
   - What we know: Prisma extension (field-encryption.extension.ts) already handles encryption transparently for all operations. Adding fromHash computation there would be fully centralized.
   - What's unclear: The extension currently only handles configured fields (bodyText, bodyHtml, snippet). Adding fromHash as a "computed field" (hash of another field) is a different pattern than encrypting a field.
   - Recommendation: Extend the Prisma extension to handle blind index computation alongside encryption. If too complex, fall back to service-level injection in sync-message-processor.service.ts (4 write paths).

2. **GIN trigram index on `from` after blind index deployment**
   - What we know: `@@index([from(ops: raw("gin_trgm_ops"))], type: Gin)` exists for substring search. It's
still needed for `contains` queries.
   - What's unclear: If `from` is eventually encrypted (future phase), this index becomes useless. But for Phase 36, `from` stays plaintext.
   - Recommendation: Keep the GIN index. Phase 36 does not encrypt `from`, only adds the `fromHash` column.

3. **Test E2E: backfill on empty vs populated database**
   - What we know: Existing `backfill-encryption.ts` has been tested.
   - What's unclear: Performance on production-size data.
   - Recommendation: Backfill script should log progress per-tenant. Add `--batch-size` CLI flag. Test with `--dry-run` first.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (project standard) |
| Config file | `backend/jest.config.ts` |
| Quick run command | `npx jest --testPathPattern=<pattern> --no-coverage` |
| Full suite command | `npm run test --prefix backend` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-02a | hmacForBlindIndex produces consistent hash | unit | `npx jest --testPathPattern=field-encryption.utils.spec --no-coverage` | Needs update (hashForSearch tests exist, hmacForBlindIndex is new) |
| SEC-02b | hmacForBlindIndex normalizes case | unit | `npx jest --testPathPattern=field-encryption.utils.spec --no-coverage` | Needs update |
| SEC-02c | hmacForBlindIndex isolates by tenant (different keys) | unit | `npx jest --testPathPattern=field-encryption.utils.spec --no-coverage` | Needs update |
| SEC-02d | TenantKeyService.getHmacKey returns key distinct from encryption key | unit | `npx jest --testPathPattern=tenant-key.service.spec --no-coverage` | Needs new test |
| SEC-02e | Backfill populates fromHash for all existing emails | unit | `npx jest --testPathPattern=backfill-from-hash --no-coverage` | Wave 0 |
| SEC-02f | Dual-path search returns correct results when fromHash populated | unit | `npx jest --testPathPattern=hash-search.service --no-coverage` | Wave 0 |
| SEC-02g | Dual-path search falls back to plaintext when fromHash is null | unit | `npx jest --testPathPattern=hash-search.service --no-coverage` | Wave 0 |
| SEC-02h | Write path sets fromHash on Email create/upsert | unit | `npx jest --testPathPattern=sync-message-processor --no-coverage` or Prisma extension spec | Needs update |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=<relevant-pattern> --no-coverage`
- **Per wave merge:** `npm run test --prefix backend`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/prisma/encryption/__tests__/field-encryption.utils.spec.ts` -- add hmacForBlindIndex tests (SEC-02a, SEC-02b, SEC-02c)
- [ ] `backend/src/common/services/__tests__/tenant-key.service.spec.ts` -- add getHmacKey test (SEC-02d)
- [ ] `backend/src/scripts/__tests__/backfill-from-hash.spec.ts` -- covers SEC-02e
- [ ] `backend/src/common/services/__tests__/hash-search.service.spec.ts` -- covers SEC-02f, SEC-02g

## Sources

### Primary (HIGH confidence)
- **Project codebase** -- `backend/src/prisma/encryption/field-encryption.utils.ts` (existing hashForSearch function)
- **Project codebase** -- `backend/src/common/services/tenant-key.service.ts` (HKDF key derivation)
- **Project codebase** -- `backend/src/scripts/backfill-encryption.ts` (backfill pattern)
- **Project codebase** -- `backend/prisma/schema.prisma` (Email model, existing indexes)
- **Project codebase** -- `backend/src/modules/email/services/email-folder.service.ts` (from query patterns)
- **Node.js crypto docs** -- `crypto.createHmac()`, `crypto.hkdfSync()` APIs
- [CipherSweet Security & Threat Model](https://ciphersweet.paragonie.com/security) -- Blind index security properties, frequency analysis risks

### Secondary (MEDIUM confidence)
- [SitePoint: Searchable Encrypted Fields](https://www.sitepoint.com/how-to-search-on-securely-encrypted-database-fields/) -- Blind index implementation patterns
- [Prisma Expand & Contract Pattern](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern) -- Nullable column + backfill migration strategy
- [Maciej Litwiniuk: Searchability for Encrypted Records (Feb 2026)](https://maciej.litwiniuk.net/posts/2026-02-25-searchability-for-encrypted-records/) -- Current state of art

### Tertiary (LOW confidence)
- None -- all findings verified against codebase and official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Node.js built-in crypto, no new dependencies, patterns already in codebase
- Architecture: HIGH -- Extends existing encryption infrastructure (TenantKeyService, field-encryption extension, backfill script pattern)
- Pitfalls: HIGH -- Query site audit is exhaustive (17 sites identified), write paths traced through code
- Threat model: HIGH -- Based on CipherSweet's published security model + HMAC-SHA256 standard properties

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable -- cryptographic patterns don't change rapidly)
