/**
 * Phase 150.1 WR-04 consolidation: single source of truth for
 * email → domain extraction across the Phase 150 graph-memory stack.
 *
 * Before this file existed, two services implemented "extract the
 * domain from an email string" separately:
 *   - triage-graph-lookup.service.ts:60-62 inline `slice(atIdx + 1)`
 *   - triage-decay-gc.helpers.ts:48-52 `match(/@([^>\s]+)/)`
 *
 * The two agreed on the happy path but diverged on edge cases (angle-
 * bracketed addresses, whitespace after domain). D-04a's contract — NO
 * subdomain collapsing, NO `+` alias stripping — is a design guarantee
 * that needs a single owner so a future "helpful" refactor can't silently
 * change which sender-bucket maps to which domain edge.
 *
 * Consumers: triage-graph-lookup.service.ts, triage-decay-gc.helpers.ts,
 * triage-affinity-promotion.helpers.ts (via the `extractDomain` re-export
 * in triage-decay-gc.helpers.ts, preserved for backward compatibility).
 */

/**
 * Extract the domain portion of an email address, honoring D-04a:
 *   - lowercase + trim
 *   - NO subdomain collapsing (mail.acme.com stays mail.acme.com)
 *   - NO `+` local-part stripping (acme+promo@x.com → x.com is still the only
 *     valid outcome; local-part normalization is a separate concern)
 *   - handles both plain `user@host` and `Name <user@host>` shapes
 *
 * Returns null for inputs without a valid local@domain structure.
 */
export function extractDomain(
  from: string | null | undefined,
): string | null {
  if (!from) return null;
  // Match @domain, stopping at angle-bracket close or whitespace.
  // This handles "user@host", "<user@host>", and "Name <user@host>".
  const match = from.match(/@([^>\s]+)/);
  if (!match) return null;
  const domain = match[1].toLowerCase().trim();
  return domain.length > 0 ? domain : null;
}
