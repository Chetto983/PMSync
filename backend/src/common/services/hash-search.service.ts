import { Injectable } from '@nestjs/common';
import { TenantKeyService } from './tenant-key.service';
import { hmacForBlindIndex } from '../../prisma/encryption/field-encryption.utils';

/**
 * Prisma WHERE input shape for exact-match sender search.
 * Uses dual-path: hash lookup (fast, indexed) + plaintext fallback (for unbackfilled rows).
 */
export interface ExactSenderFilter {
  OR: Array<Record<string, unknown>>;
}

/**
 * Service for building hash-based exact-match search queries.
 *
 * Placed in `common/services/` (not `modules/email/services/`) to avoid circular
 * dependency when CalendarModule, ContactsModule, or other modules need sender lookup.
 * Only depends on TenantKeyService and hmacForBlindIndex -- both in common/prisma layer.
 */
@Injectable()
export class HashSearchService {
  constructor(private readonly tenantKeyService: TenantKeyService) {}

  /**
   * Build a Prisma WHERE clause for exact-match sender search.
   *
   * Returns a dual-path OR clause:
   * 1. Hash path: `fromHash = hash` (indexed, fast -- works for backfilled rows)
   * 2. Fallback path: `fromHash IS NULL AND from = value` (covers unbackfilled rows)
   *
   * After backfill completes, the fallback path returns zero rows (no performance penalty).
   *
   * @param tenantId - Tenant ID for HMAC key derivation
   * @param senderEmail - Single email or array of emails to match
   */
  buildExactSenderFilter(
    tenantId: string,
    senderEmail: string | string[],
  ): ExactSenderFilter {
    const hmacKey = this.tenantKeyService.getHmacKey(tenantId);

    if (Array.isArray(senderEmail)) {
      const hashes = senderEmail.map((email) =>
        hmacForBlindIndex(email, hmacKey),
      );
      return {
        OR: [
          { fromHash: { in: hashes } },
          { fromHash: null, from: { in: senderEmail } },
        ],
      };
    }

    const hash = hmacForBlindIndex(senderEmail, hmacKey);
    return {
      OR: [
        { fromHash: hash },
        { fromHash: null, from: senderEmail },
      ],
    };
  }
}
