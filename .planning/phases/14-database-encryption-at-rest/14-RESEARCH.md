# Phase 14: Database Encryption at Rest - Research

**Researched:** 2026-02-11
**Domain:** Field-level encryption for PostgreSQL via Prisma ORM, per-tenant key isolation
**Confidence:** MEDIUM (critical compatibility risks identified)

## Summary

This research investigates implementing field-level encryption at rest for all PII fields in the PMSync database using `prisma-field-encryption`. The findings reveal **three showstopper-level issues** that fundamentally challenge the original plan:

1. **`prisma-field-encryption` is BROKEN on Prisma 7.x** -- The library depends on Prisma's DMMF (Data Model Meta Format) which changed structure in Prisma 6.16.0 and is essentially absent in Prisma 7. Issue #143 is unresolved, PR #144 is unmerged, and the maintainer has stated limited capacity. This project runs Prisma 7.3.0.

2. **Composite `@@id` keys are NOT supported** -- The library's migration system requires single-field `@id` or `@unique` cursor fields. The core models (Email, Folder, Embedding, CalendarEvent, Contact) all use `@@id([id, tenantId])` composite keys for Citus horizontal sharding. This blocks the built-in migration/backfill generator entirely.

3. **Per-tenant dynamic keys are NOT a library feature** -- `prisma-field-encryption` supports one encryption key + a decryption keychain for rotation. It does NOT support per-request or per-tenant key switching. Per-tenant key derivation would require a CUSTOM Prisma client extension, not the library's built-in one.

Additionally, the codebase heavily uses `contains` + `mode: 'insensitive'` queries on PII fields (`from`, `displayName`, `subject`). Hash indexes only support exact-match queries, so encrypting these fields would **break all search/filter functionality** unless redesigned.

**Primary recommendation:** Do NOT use `prisma-field-encryption` as-is. Build a custom Prisma client extension that uses the same cryptographic primitives (`@47ng/cloak` for AES-GCM-256 or Node.js `crypto` directly) but handles per-tenant HKDF key derivation, composite key iteration for migration, and coexistence with `contains`-based search patterns. Alternatively, wait for the library to gain Prisma 7 support (timeline unclear) and scope the encrypted fields to only those that do NOT need fuzzy search.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `crypto` | built-in | AES-256-GCM encryption + HKDF key derivation | Zero dependencies, native performance, `hkdfSync` available since Node 15.7.0 |
| `@47ng/cloak` | latest | AES-GCM-256 encrypt/decrypt with key format `k1.aesgcm256.*` | Used by prisma-field-encryption, battle-tested, provides key serialization |
| `@prisma/client` | ^7.3.0 | Prisma client extensions for intercept pattern | Already installed, `$extends()` is the standard hook point |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `prisma-field-encryption` | latest | Schema annotation parsing, hash field logic | ONLY if Prisma 7 compatibility is resolved (PR #144 merged). Currently BLOCKED |
| `@mrleebo/prisma-ast` | latest | Parse Prisma schema to extract `@encrypted` annotations | If building custom extension and want schema-driven annotation discovery |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `prisma-field-encryption` | Custom Prisma client extension | More code to write, but full control over per-tenant keys, composite PK support, and Prisma 7 compatibility |
| `@47ng/cloak` (AES-GCM) | Node.js `crypto` (AES-256-GCM) directly | Cloak adds key format serialization; raw crypto is more flexible for HKDF-derived keys |
| Hash fields for search | PostgreSQL `pgcrypto` functions | Server-side decryption means keys on DB server; defeats purpose of application-level encryption |
| Per-tenant HKDF derivation | AWS KMS / HashiCorp Vault | Cloud dependency; HKDF is simpler for self-hosted and equally secure |

### NOT Recommended

| Library | Reason |
|---------|--------|
| `prisma-field-encryption` (as-is) | Broken on Prisma 7 (issue #143), no composite @@id support, no per-tenant keys, maintainer has limited availability |
| `prisma-deterministic-search-field-encryption` | Uses deprecated `$use()` middleware, no Prisma 7 support, no key rotation |
| `prisma-custom-field-encryption` | Low adoption, unclear maintenance, same DMMF issues |

**Installation (if building custom):**
```bash
# No new dependencies needed! Node.js crypto is built-in.
# Optionally for key format compatibility:
npm install @47ng/cloak
```

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
  common/
    services/
      crypto.service.ts           # EXISTS - AES-256-CBC (will extend or replace)
      tenant-key.service.ts       # NEW - HKDF per-tenant key derivation
  prisma/
    prisma.service.ts             # EXISTS - needs $extends() for encryption
    prisma.module.ts              # EXISTS - exports PrismaService
    encryption/
      field-encryption.extension.ts  # NEW - Custom Prisma client extension
      encryption.config.ts           # NEW - Field-to-model mapping (replaces schema annotations)
      hash-index.utils.ts            # NEW - SHA-256 hash generation for searchable fields
  scripts/
    backfill-encryption.ts        # NEW - Migration script for existing data
```

### Pattern 1: Custom Prisma Client Extension for Field Encryption

**What:** A Prisma `$extends()` extension that intercepts read/write operations, encrypts PII fields on write, decrypts on read, and maintains hash indexes.

**When to use:** All database operations on models with PII fields.

**Why custom instead of library:** Prisma 7 compatibility, composite PK support, per-tenant key injection.

```typescript
// Source: Prisma official docs on client extensions + @47ng/cloak patterns

import { Prisma, PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// Configuration: which fields on which models are encrypted
const ENCRYPTED_FIELDS: Record<string, EncryptedFieldConfig[]> = {
  email: [
    { field: 'from', hashField: 'fromHash' },
    { field: 'bodyText', hashField: null },  // No hash - not exact-match searchable
    { field: 'bodyHtml', hashField: null },
  ],
  contact: [
    { field: 'displayName', hashField: 'displayNameHash' },
    { field: 'firstName', hashField: null },
    { field: 'lastName', hashField: null },
  ],
  // ... etc
};

function createEncryptionExtension(getKeyForTenant: (tenantId: string) => Buffer) {
  return Prisma.defineExtension({
    name: 'field-encryption',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const config = ENCRYPTED_FIELDS[model?.toLowerCase() ?? ''];
          if (!config) return query(args);

          // Extract tenantId from args for key derivation
          const tenantId = extractTenantId(args);
          if (!tenantId) return query(args);

          const key = getKeyForTenant(tenantId);

          // Encrypt on write
          if (isWriteOperation(operation)) {
            encryptFields(args.data, config, key);
          }

          const result = await query(args);

          // Decrypt on read
          if (result) {
            decryptFields(result, config, key);
          }

          return result;
        },
      },
    },
  });
}
```

### Pattern 2: TenantKeyService with HKDF

**What:** Derives per-tenant AES-256 keys from a master secret using HKDF (RFC 5869).

**When to use:** Every database operation that touches encrypted fields.

```typescript
// Source: Node.js crypto.hkdfSync documentation

import { hkdfSync } from 'crypto';

@Injectable()
export class TenantKeyService {
  private readonly masterKey: Buffer;
  private readonly keyCache = new Map<string, Buffer>();

  constructor() {
    const masterKeyBase64 = process.env.FIELD_ENCRYPTION_MASTER_KEY;
    if (!masterKeyBase64) throw new Error('FIELD_ENCRYPTION_MASTER_KEY not set');
    this.masterKey = Buffer.from(masterKeyBase64, 'base64');
    if (this.masterKey.length < 32) throw new Error('Master key must be at least 32 bytes');
  }

  /**
   * Derive a per-tenant AES-256 key using HKDF.
   * Same tenant + same master key = same derived key (deterministic).
   */
  getKeyForTenant(tenantId: string): Buffer {
    const cached = this.keyCache.get(tenantId);
    if (cached) return cached;

    const derivedKey = Buffer.from(
      hkdfSync(
        'sha256',         // digest
        this.masterKey,   // input keying material
        tenantId,         // salt (tenant isolation)
        'pmsync-field-encryption-v1', // info (purpose binding)
        32,               // keylen (256 bits for AES-256)
      ),
    );

    this.keyCache.set(tenantId, derivedKey);
    return derivedKey;
  }

  /**
   * Clear cached keys (call on key rotation).
   */
  clearCache(): void {
    this.keyCache.clear();
  }
}
```

### Pattern 3: AES-256-GCM Encrypt/Decrypt Primitives

**What:** Low-level encryption using AES-256-GCM with random IV per field value.

```typescript
// Source: Node.js crypto documentation

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;        // GCM standard
const TAG_LENGTH = 16;       // Authentication tag
const ENCODING = 'base64';   // Storage-efficient

/**
 * Encrypt a string field value.
 * Output format: base64(iv + ciphertext + authTag)
 * Non-deterministic: same input produces different output each time.
 */
function encryptField(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: IV (12) + ciphertext (variable) + authTag (16)
  return Buffer.concat([iv, encrypted, authTag]).toString(ENCODING);
}

/**
 * Decrypt a field value.
 * Returns null if decryption fails (wrong key, tampered data).
 */
function decryptField(ciphertext: string, key: Buffer): string | null {
  try {
    const data = Buffer.from(ciphertext, ENCODING);

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(data.length - TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null; // Decryption failure (wrong key or corrupted)
  }
}
```

### Pattern 4: Hash Index for Exact-Match Search on Encrypted Fields

**What:** SHA-256 hash stored alongside encrypted field for exact-match queries.

```typescript
// Source: prisma-field-encryption hash concept, implemented custom

import { createHash } from 'crypto';

const HASH_SALT = process.env.FIELD_ENCRYPTION_HASH_SALT || '';

/**
 * Generate deterministic hash for exact-match search.
 * Normalized to lowercase before hashing for case-insensitive matching.
 */
function hashForSearch(value: string, tenantId: string): string {
  return createHash('sha256')
    .update(`${HASH_SALT}:${tenantId}:${value.toLowerCase().trim()}`)
    .digest('hex');
}
```

**CRITICAL LIMITATION:** Hash indexes ONLY support exact-match queries (`WHERE fromHash = ?`). They do NOT support:
- `contains` (partial match)
- `startsWith` / `endsWith`
- `mode: 'insensitive'` (case-insensitive)
- `in` with partial patterns
- Trigram GIN indexes

### Anti-Patterns to Avoid

- **Encrypting fields used in `contains` queries without a search strategy:** The codebase uses `from: { contains: query, mode: 'insensitive' }` extensively. Encrypting `from` breaks ALL keyword search, RAG keyword search, email filtering. You MUST either: (a) keep `from` unencrypted, (b) maintain a parallel search mechanism, or (c) accept that fuzzy search on encrypted fields is impossible.
- **Using `prisma-field-encryption` with Prisma 7 without verifying PR #144 is merged:** Will fail at runtime with DMMF-related errors.
- **Passing encryption key via env var for multi-tenant:** `PRISMA_FIELD_ENCRYPTION_KEY` is a single global key. Per-tenant requires programmatic injection.
- **Encrypting pgvector `Unsupported("vector")` fields:** Vectors are float arrays, not strings. Encryption would destroy similarity search. Vectors are NOT reversible to original text anyway.
- **Using the same IV across encryptions:** AES-GCM REQUIRES unique IV per encryption operation. Random IV is mandatory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AES-GCM encryption | Custom cipher mode | Node.js `crypto.createCipheriv('aes-256-gcm')` | Authenticated encryption, prevents tampering |
| Key derivation | Custom KDF | `crypto.hkdfSync('sha256', ...)` | RFC 5869 standard, constant-time |
| Key format/serialization | Custom binary format | `@47ng/cloak` key format OR raw Base64 | Interoperable, includes version prefix |
| Hash for search | Custom hash | `crypto.createHash('sha256')` | Standard, salted, deterministic |
| Prisma interception | Custom middleware | `Prisma.defineExtension()` with `$allOperations` | Type-safe, officially supported, no deprecation risk |

**Key insight:** The cryptographic primitives are solved by Node.js built-ins. The hard problem is ARCHITECTURAL: deciding which fields to encrypt, handling the search/query impact, and managing per-tenant keys through the Prisma query lifecycle.

## Common Pitfalls

### Pitfall 1: Encrypting Fields Used in Fuzzy Search

**What goes wrong:** After encrypting `Email.from`, all queries like `from: { contains: 'john', mode: 'insensitive' }` return zero results. RAG keyword search breaks. Email list filtering breaks. AI agent email search breaks.

**Why it happens:** Encrypted ciphertext is random bytes -- no substring matching is possible. Hash indexes only support exact match.

**How to avoid:**
1. Audit ALL queries on candidate fields BEFORE encrypting
2. For fields needing fuzzy search (`from`, `subject`, `displayName`): either keep unencrypted or implement a separate search index (e.g., sanitized trigram index)
3. For fields needing only exact match (`User.email`, `ProviderConfig.email`): hash index works

**Warning signs:** Search features silently return empty results after encryption rollout.

**Codebase impact assessment:**

| Field | Current Query Patterns | Hash Index Viable? |
|-------|----------------------|-------------------|
| `Email.from` | `contains`, `mode: insensitive`, trigram GIN | NO - breaks search |
| `Email.subject` | `contains`, trigram GIN | NO - breaks search |
| `Email.bodyText` | Full-text/embedding only | YES if only encrypted storage needed |
| `Email.bodyHtml` | Full-text/embedding only | YES if only encrypted storage needed |
| `User.email` | Exact match via unique index | YES |
| `Contact.displayName` | `contains`, `mode: insensitive`, trigram GIN | NO - breaks search |
| `Contact.firstName/lastName` | `contains`, `mode: insensitive` | NO - breaks search |
| `Contact.emails` (Json) | `array_contains` | COMPLEX - Json field, not String |
| `Contact.phoneNumbers` (Json) | Rarely queried | COMPLEX - Json field, not String |
| `ProviderConfig.email` | Exact match | YES |

### Pitfall 2: Storage Bloat from Encryption

**What goes wrong:** Encrypted fields are significantly larger than plaintext. A 100-character email body becomes ~200+ characters in Base64-encoded ciphertext (IV + ciphertext + auth tag).

**Why it happens:** AES-GCM adds 12-byte IV + 16-byte auth tag overhead, then Base64 encoding adds ~33% expansion.

**How to avoid:**
1. Calculate storage impact before migration: `ceil((plaintext_len + 28) * 4/3)` bytes per field
2. Monitor database size growth during backfill
3. Consider `bodyText` and `bodyHtml` -- these can be 10KB+ and will grow to ~14KB+ each

**Warning signs:** Database size doubles after encryption migration.

### Pitfall 3: Prisma 7 + PrismaPg Adapter Compatibility

**What goes wrong:** Client extensions may behave differently with the `PrismaPg` adapter (driver-based approach) vs the traditional Prisma engine.

**Why it happens:** Prisma 7 made the Rust-free TypeScript client the default. Extensions interact with the query pipeline, which has changed.

**How to avoid:**
1. Test the custom extension with `@prisma/adapter-pg` explicitly
2. Verify that `$allModels` / `$allOperations` hooks fire correctly with the adapter
3. If issues arise, test with the Prisma engine instead of adapter

**Warning signs:** Extension hooks not firing, fields written unencrypted.

### Pitfall 4: Key Rotation Complexity

**What goes wrong:** After rotating the master key, all existing encrypted data becomes unreadable because derived keys change.

**Why it happens:** HKDF(new_master_key, tenantId) != HKDF(old_master_key, tenantId).

**How to avoid:**
1. Maintain a keychain: `[current_master_key, ...old_master_keys]`
2. On read: try current key first, then old keys
3. On write: always use current key
4. Run background migration to re-encrypt old data with new key
5. Only remove old keys from keychain after ALL data is re-encrypted

**Warning signs:** Sudden spike in "decryption failed" errors after key rotation.

### Pitfall 5: Composite PK Models and Batch Migration

**What goes wrong:** Backfill migration script fails because it can't iterate using `cursor` on composite `@@id` models (Email, Contact, CalendarEvent, Folder, Embedding).

**Why it happens:** Prisma's `cursor`-based pagination requires a single unique field. Composite PKs don't expose a simple cursor.

**How to avoid:**
1. Use `skip` + `take` pagination (less efficient but works with composite PKs)
2. Or iterate by tenantId first, then paginate within tenant
3. Process in batches of 100-500 records
4. Use transactions per batch to avoid partial encryption

**Warning signs:** Migration script hangs or OOMs on large tables.

### Pitfall 6: Concurrent Reads During Migration

**What goes wrong:** During backfill, some records are encrypted and some are plaintext. Application reads mix of both.

**Why it happens:** Migration runs batch-by-batch, not atomically.

**How to avoid:**
1. Extension must handle BOTH encrypted and plaintext data during migration
2. On read: check if value starts with encryption prefix marker; if not, return as-is
3. This is the "default mode" pattern from `prisma-field-encryption`

**Warning signs:** Users see Base64 gibberish in UI during migration window.

## Code Examples

### TenantKeyService with Keychain for Rotation

```typescript
// Custom implementation, verified against Node.js crypto docs

@Injectable()
export class TenantKeyService {
  private readonly currentMasterKey: Buffer;
  private readonly oldMasterKeys: Buffer[];
  private readonly keyCache = new Map<string, { current: Buffer; old: Buffer[] }>();

  constructor() {
    const current = process.env.FIELD_ENCRYPTION_MASTER_KEY;
    if (!current) throw new Error('FIELD_ENCRYPTION_MASTER_KEY required');
    this.currentMasterKey = Buffer.from(current, 'base64');

    // Old keys for rotation (comma-separated base64)
    const oldKeysRaw = process.env.FIELD_ENCRYPTION_OLD_MASTER_KEYS || '';
    this.oldMasterKeys = oldKeysRaw
      .split(',')
      .filter(Boolean)
      .map((k) => Buffer.from(k.trim(), 'base64'));
  }

  deriveKey(masterKey: Buffer, tenantId: string): Buffer {
    return Buffer.from(
      hkdfSync('sha256', masterKey, tenantId, 'pmsync-field-enc-v1', 32),
    );
  }

  getCurrentKey(tenantId: string): Buffer {
    return this.deriveKey(this.currentMasterKey, tenantId);
  }

  getDecryptionKeys(tenantId: string): Buffer[] {
    return [
      this.getCurrentKey(tenantId),
      ...this.oldMasterKeys.map((mk) => this.deriveKey(mk, tenantId)),
    ];
  }
}
```

### Encryption-Aware Field Detection (Read Path)

```typescript
// Pattern: detect whether a stored value is encrypted or plaintext

const ENCRYPTION_PREFIX = 'enc:'; // Marker prefix for encrypted values

function isEncrypted(value: string): boolean {
  // Encrypted values start with marker prefix
  return value.startsWith(ENCRYPTION_PREFIX);
}

function encryptFieldValue(plaintext: string, key: Buffer): string {
  const ciphertext = encryptField(plaintext, key); // AES-GCM
  return `${ENCRYPTION_PREFIX}${ciphertext}`;
}

function decryptFieldValue(stored: string, keys: Buffer[]): string {
  if (!isEncrypted(stored)) return stored; // Plaintext pass-through

  const ciphertext = stored.slice(ENCRYPTION_PREFIX.length);
  for (const key of keys) {
    const result = decryptField(ciphertext, key);
    if (result !== null) return result;
  }
  throw new Error('Decryption failed with all available keys');
}
```

### Batch Migration Script Skeleton

```typescript
// Pattern: Backfill encryption for composite-PK models

async function backfillEncrypt(
  prisma: PrismaClient,
  tenantKeyService: TenantKeyService,
  model: string,
  fields: string[],
  batchSize = 200,
) {
  // Get all tenant IDs
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const key = tenantKeyService.getCurrentKey(tenant.id);
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      // Use skip+take for composite PK models
      const records = await prisma[model].findMany({
        where: { tenantId: tenant.id },
        take: batchSize,
        skip: processed,
      });

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      // Process batch in transaction
      await prisma.$transaction(
        records
          .filter((r) => fields.some((f) => r[f] && !isEncrypted(r[f])))
          .map((record) => {
            const updates: Record<string, string> = {};
            for (const field of fields) {
              if (record[field] && !isEncrypted(record[field])) {
                updates[field] = encryptFieldValue(record[field], key);
                // Also update hash field if exists
                const hashField = `${field}Hash`;
                if (hashField in record) {
                  updates[hashField] = hashForSearch(record[field], tenant.id);
                }
              }
            }
            return prisma[model].update({
              where: { id_tenantId: { id: record.id, tenantId: tenant.id } },
              data: updates,
            });
          }),
      );

      processed += records.length;
      console.log(`[${model}] Tenant ${tenant.id}: ${processed} records processed`);
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prisma-field-encryption` middleware | `prisma-field-encryption` client extension | Prisma 4.7.0 (2022) | Type-safe, no deprecation warnings |
| Global encryption key | Per-tenant key derivation via HKDF | Industry pattern ~2023 | Tenant isolation, key rotation per tenant |
| Full-field search on encrypted data | Hash indexes + separate search service | Ongoing challenge | Exact match only; fuzzy search requires redesign |
| `prisma-field-encryption` DMMF parsing | `prisma-ast` schema parsing (PR #144) | Proposed Oct 2025 | Would fix Prisma 6.16+ / 7.x support |

**Deprecated/outdated:**
- `prisma-field-encryption` middleware interface: Deprecated, use extension
- Prisma DMMF reliance: Broken in Prisma 6.16+, library unpatched for Prisma 7
- Single global encryption key: Insufficient for multi-tenant data isolation

## Risk Assessment

### HIGH RISK: Library Compatibility

`prisma-field-encryption` is **broken on Prisma 7**. The fix (PR #144) is approved but unmerged. The maintainer has stated limited availability. Relying on this library means either:
- Downgrading to Prisma 6.15 (unacceptable)
- Waiting indefinitely for a fix (unpredictable)
- Building custom (recommended)

### HIGH RISK: Search Functionality Regression

Encrypting `Email.from`, `Email.subject`, `Contact.displayName` would break:
- Email search/filter (`contains` queries) -- used in 17+ locations in codebase
- RAG keyword search (`keyword-search.service.ts`)
- AI agent email/contact tools
- Trigram GIN indexes (currently on `from`, `subject`, `displayName`, `title`)

### MEDIUM RISK: Performance Impact

- Encryption/decryption on every read/write adds CPU overhead
- `bodyText` and `bodyHtml` can be large (10KB+); encryption overhead is proportional
- Key derivation per request (mitigated by in-memory cache)
- Migration script on large tables could take hours

### LOW RISK: Cryptographic Correctness

AES-256-GCM is well-understood. HKDF is RFC 5869 standard. Node.js `crypto` is battle-tested. The cryptographic primitives are not the risk -- the integration is.

## Open Questions

### 1. Which Fields Should Actually Be Encrypted?

**What we know:** Requirements say "all PII fields" but many PII fields are used in fuzzy search.

**What's unclear:** Is there a practical middle ground? Can we encrypt body text (rarely queried directly) but NOT from/subject/displayName (heavily searched)?

**Recommendation:** Define two tiers:
- **Tier 1 (encrypt):** `bodyText`, `bodyHtml`, `snippet`, `User.passwordHash` (already hashed), `ProviderConfig.accessToken/refreshToken` (already encrypted by CryptoService)
- **Tier 2 (defer or hash-only):** `from`, `subject`, `displayName`, `firstName`, `lastName` -- these need a search strategy FIRST

**Impact:** This scoping decision is CRITICAL and should be made by the planner/user before implementation begins.

### 2. Should We Build Custom or Wait for Library Fix?

**What we know:** PR #144 exists, is approved, but has issues (multi-file schema fails). Maintainer has limited time.

**What's unclear:** Will the fix land? When? Will it work with Prisma 7.3+?

**Recommendation:** Build custom. The custom extension is ~200 lines of code using Node.js built-ins. It gives full control over per-tenant keys, composite PK migration, and field selection. The risk of depending on an unmaintained library is too high for security-critical infrastructure.

### 3. How to Handle Json Fields (Contact.emails, Contact.phoneNumbers)?

**What we know:** These are `Json?` type fields containing arrays of objects like `[{type: 'work', value: 'john@example.com'}]`.

**What's unclear:** `prisma-field-encryption` only encrypts `String` fields. Encrypting Json requires serializing to string first, then encrypting the whole blob. This breaks `array_contains` queries.

**Recommendation:** Encrypt the entire Json field as a string (serialize -> encrypt -> store). Exact-match search on individual values within the Json would require extracting them into separate hash fields or a lookup table.

### 4. What About the Existing CryptoService?

**What we know:** `CryptoService` exists at `common/services/crypto.service.ts` using AES-256-CBC for provider tokens (OAuth access/refresh tokens, IMAP passwords).

**What's unclear:** Should field encryption use the same service/key or a separate system?

**Recommendation:** SEPARATE system. Field encryption uses AES-256-GCM (authenticated) with per-tenant HKDF-derived keys. The existing CryptoService uses AES-256-CBC with a shared key for provider tokens. These serve different purposes and should not share keys.

### 5. Impact on Embeddings and PII Tokenization (Phase 13)?

**What we know:** Phase 13 already sanitizes PII in embedding content. Embeddings use `Unsupported("vector")` fields that cannot be encrypted.

**What's unclear:** Does encrypting `bodyText` in the database affect the embedding pipeline? The embedding composer reads `bodyText` from the database.

**Recommendation:** The Prisma extension would decrypt `bodyText` before returning it to the application. The embedding composer would then sanitize PII (Phase 13) before generating vectors. These are complementary: encryption protects data AT REST in the database; PII tokenization protects data IN TRANSIT to the LLM.

## Sources

### Primary (HIGH confidence)
- [Node.js crypto.hkdfSync documentation](https://nodejs.org/api/crypto.html) - HKDF API, AES-GCM
- Codebase analysis: `backend/prisma/schema.prisma` - Composite PKs, field types, indexes
- Codebase analysis: `backend/src/prisma/prisma.service.ts` - Current PrismaService pattern
- Codebase analysis: `backend/src/common/services/crypto.service.ts` - Existing encryption
- Codebase analysis: keyword search patterns across 17+ service files

### Secondary (MEDIUM confidence)
- [prisma-field-encryption GitHub](https://github.com/47ng/prisma-field-encryption) - README, schema annotations, hash fields
- [prisma-field-encryption Issue #143](https://github.com/47ng/prisma-field-encryption/issues/143) - Prisma 6.16/7 DMMF breakage
- [prisma-field-encryption PR #144](https://github.com/47ng/prisma-field-encryption/pull/144) - prisma-ast fix (unmerged)
- [prisma-field-encryption Issue #148](https://github.com/47ng/prisma-field-encryption/issues/148) - Prisma 7 `Cannot find module` error
- [prisma-field-encryption Issue #149](https://github.com/47ng/prisma-field-encryption/issues/149) - Prisma 7 closed as duplicate
- [DeepWiki: prisma-field-encryption Key Concepts](https://deepwiki.com/47ng/prisma-field-encryption/1.2-key-concepts)
- [DeepWiki: prisma-field-encryption Schema Configuration](https://deepwiki.com/47ng/prisma-field-encryption/3-schema-configuration)
- [@47ng/cloak GitHub](https://github.com/47ng/cloak) - Key format `k1.aesgcm256.*`
- [Prisma Client Extensions docs](https://www.prisma.io/docs/orm/prisma-client/client-extensions) - `$extends()` API
- [NestJS + Prisma Encryption Discussion #20839](https://github.com/prisma/prisma/discussions/20839) - Integration patterns

### Tertiary (LOW confidence)
- [prisma-deterministic-search-field-encryption](https://github.com/godspeedsystems/prisma-deterministic-search-field-encryption) - Alternative library (deprecated middleware)
- Community blog posts on multi-tenant encryption (general patterns, not Prisma-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Core crypto is HIGH confidence, but the library (`prisma-field-encryption`) is BROKEN on Prisma 7. Custom build path is well-understood but untested in this codebase.
- Architecture: MEDIUM - Custom extension pattern is sound, but per-tenant key injection at query time needs validation. Composite PK migration needs testing.
- Pitfalls: HIGH - Identified through concrete codebase analysis (17+ query sites, 5 composite PK models, active GIN indexes)
- Search impact: HIGH confidence that encrypting fuzzy-searched fields WILL break functionality

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (30 days - check PR #144 status on prisma-field-encryption if reconsidering library approach)
