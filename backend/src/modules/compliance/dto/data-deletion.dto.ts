/**
 * DTOs for account deletion (GDPR Article 17 - Right to Erasure)
 *
 * DATA-02, DATA-03: Account deletion with 30-day grace period.
 */

/**
 * Status of a user's deletion request.
 */
export class DeletionStatusDto {
  /** Current deletion status */
  status: 'ACTIVE' | 'SCHEDULED' | 'CANCELLED';

  /** When the deletion was requested (null if ACTIVE) */
  deletedAt?: Date;

  /** When hard-delete will occur (null if ACTIVE) */
  purgeDate?: Date;

  /** Days remaining before hard-delete (null if ACTIVE) */
  daysRemaining?: number;
}

/**
 * Response returned after requesting or cancelling deletion.
 */
export class DeletionResponseDto {
  /** Result status */
  status: string;

  /** When hard-delete will occur (only for SCHEDULED) */
  purgeDate?: Date;

  /** Human-readable message */
  message: string;
}
