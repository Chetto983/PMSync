# ADR-036: HMAC Blind Index for Encrypted Sender Search

**Status:** Accepted
**Date:** 2026-03-04
**Decision makers:** Engineering team
**Context:** Phase 36 - Encrypted Search (SEC-02)

## Context

The Email `from` field requires exact-match search capability for features like meeting prep, relationship scoring, and sender-based filtering. At the same time, field encryption at rest is an enterprise security requirement.

Key constraints:

1. **Exact-match search** on `from` field is needed in multiple query sites (meeting-prep, relationship-score, etc.)
2. **Subject field** uses `contains`/`insensitive` substring queries in 17+ locations -- incompatible with deterministic hashing
3. **Per-tenant isolation** is mandatory -- one tenant's data must not be queryable by another
4. The existing `hashForSearch` function uses SHA-256 with concatenated salt, which lacks the cryptographic guarantees of HMAC

## Decision

Add an **HMAC-SHA256 blind index** (`fromHash`) on the Email `from` field only. The `subject` field stays plaintext in v4.0.

### Design choices

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Hash algorithm | HMAC-SHA256 | Keyed hash prevents rainbow table attacks; 256-bit output |
| Key derivation | HKDF-SHA256 per tenant | Same master key, distinct info label (`mailagent-blind-index-v1`) from encryption key (`mailagent-field-enc-v1`) |
| Scope | `from` field only | Only field with exact-match query pattern; `subject` needs substring search |
| Column | `fromHash String?` (nullable) | Nullable for backward compatibility during backfill |
| Index | B-tree on `[tenantId, fromHash]` | Composite index for tenant-scoped exact-match lookups |
| Query strategy | Dual-path (hash + plaintext fallback) | Correctness during and after backfill; fallback returns zero rows post-backfill |
| Extension wiring | Automatic via Prisma extension | `fromHash` computed on every Email write (create, update, upsert, createMany) |

### What stays plaintext

- **`subject`**: Used in substring/contains queries at 17+ sites. Deterministic hashing is incompatible with substring search. Encrypting `subject` would require a full-text search infrastructure redesign (deferred to v5.0).
- **`to`, `cc`, `bcc`**: Array fields; hashing would require per-element indexing. Not prioritized.

## Consequences

### Benefits

- **Exact-match sender search** works via indexed hash lookup without exposing plaintext in WHERE clauses
- **Per-tenant key isolation** prevents cross-tenant data correlation
- **Automatic injection** via Prisma extension means application code never manually computes hashes
- **Backward compatible** -- nullable column + dual-path queries work during and after backfill

### Tradeoffs

- **Frequency analysis within a tenant** is possible (same sender = same hash). This is an acknowledged tradeoff of deterministic hashing. Mitigation: per-tenant keys prevent cross-tenant frequency analysis.
- **No substring search** on hashed fields. Only exact-match is supported.
- **Dual instantiation** of TenantKeyService (one in PrismaService constructor, one via DI) -- intentional and safe since HKDF is deterministic.

## Threat Model

### Offline database theft

An attacker who obtains a database dump sees `fromHash` values but cannot reverse them to email addresses without the master key. The HMAC key is derived via HKDF from the master key, which is not stored in the database.

### Frequency analysis

Within a single tenant, an attacker can observe that certain `fromHash` values appear more frequently, indicating a common sender. This is inherent to deterministic hashing. Mitigation: per-tenant HKDF derivation ensures frequency patterns are isolated per tenant.

### Known-plaintext attack

If an attacker knows a specific email address and has access to the database, they cannot compute the corresponding `fromHash` without the HMAC key. Even with multiple known (plaintext, hash) pairs, HMAC-SHA256 is resistant to key recovery.

### Application-level compromise

If an attacker compromises the application server (gaining access to the master key in environment variables), they can compute blind indexes for arbitrary email addresses. This is equivalent to full application compromise and is outside the scope of this defense layer.

## Related

- Phase 14: Field encryption at rest (bodyText, bodyHtml, snippet)
- Phase 36-02: Query site migration to HashSearchService
- SEC-02 requirement: Encrypted field search capability
