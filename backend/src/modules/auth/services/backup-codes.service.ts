import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';

/**
 * Backup code verification result
 */
export interface BackupCodeVerifyResult {
  success: boolean;
  reason?: 'valid' | 'invalid' | 'already_used' | 'no_codes';
  remainingCount?: number;
}

/**
 * BackupCodesService - Emergency MFA recovery codes
 *
 * Features:
 * - Generates 10 secure 8-character recovery codes
 * - Codes are hashed with HMAC-SHA256 before storage
 * - Each code can only be used once
 * - Regeneration invalidates all previous codes
 *
 * Code format: XXXX-XXXX (alphanumeric, uppercase, no ambiguous chars)
 *
 * @see MFA_ENHANCEMENT_ROADMAP.md Phase 2
 */
@Injectable()
export class BackupCodesService {
  private readonly logger = new Logger(BackupCodesService.name);

  // Configuration
  private readonly codeCount: number;
  private readonly codeLength: number;
  private readonly hmacSecret: string;

  // Exclude ambiguous characters: 0, O, 1, I, L
  private readonly charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  constructor(private readonly prisma: PrismaService) {
    this.codeCount = parseInt(process.env.BACKUP_CODE_COUNT || '10', 10);
    this.codeLength = parseInt(process.env.BACKUP_CODE_LENGTH || '8', 10);

    // Derive HMAC secret from JWT_SECRET
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret === 'secret' || jwtSecret.length < 32) {
      this.logger.warn('JWT_SECRET is weak. Backup codes will use fallback HMAC - NOT SECURE FOR PRODUCTION.');
      this.hmacSecret = 'insecure-backup-code-secret';
    } else {
      this.hmacSecret = crypto
        .createHmac('sha256', jwtSecret)
        .update('backup-codes')
        .digest('hex');
    }
  }

  /**
   * Generate new backup codes for a user
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param userId - User ID
   * @returns Array of plaintext codes (show only once!)
   */
  async generate(tenantId: string, userId: string): Promise<string[]> {
    // Delete any existing codes first
    await this.prisma.mfaBackupCode.deleteMany({
      where: { tenantId, userId },
    });

    const codes: string[] = [];
    const codeRecords: { tenantId: string; userId: string; codeHash: string }[] = [];

    // Generate codes
    for (let i = 0; i < this.codeCount; i++) {
      const code = this.generateCode();
      const formattedCode = this.formatCode(code);
      const hash = this.hashCode(code);

      codes.push(formattedCode);
      codeRecords.push({ tenantId, userId, codeHash: hash });
    }

    // Store hashed codes
    await this.prisma.mfaBackupCode.createMany({
      data: codeRecords,
    });

    this.logger.log(
      JSON.stringify({
        event: 'backup_codes_generated',
        userId,
        count: this.codeCount,
      }),
    );

    return codes;
  }

  /**
   * Regenerate backup codes (invalidates old ones)
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param userId - User ID
   * @returns New array of plaintext codes
   */
  async regenerate(tenantId: string, userId: string): Promise<string[]> {
    this.logger.log(
      JSON.stringify({
        event: 'backup_codes_regenerating',
        tenantId,
        userId,
      }),
    );

    return this.generate(tenantId, userId);
  }

  /**
   * Verify and consume a backup code
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param userId - User ID
   * @param code - Backup code (with or without dash)
   * @returns Verification result
   */
  async verify(tenantId: string, userId: string, code: string): Promise<BackupCodeVerifyResult> {
    // Normalize code (remove dashes, uppercase)
    const normalizedCode = code.replace(/-/g, '').toUpperCase();
    const hash = this.hashCode(normalizedCode);

    // Find matching unused code
    const backupCode = await this.prisma.mfaBackupCode.findFirst({
      where: {
        tenantId,
        userId,
        codeHash: hash,
      },
    });

    if (!backupCode) {
      // Check if user has any codes at all
      const hasAnyCodes = await this.prisma.mfaBackupCode.count({
        where: { tenantId, userId },
      });

      if (hasAnyCodes === 0) {
        return { success: false, reason: 'no_codes' };
      }

      this.logger.warn(
        JSON.stringify({
          event: 'backup_code_invalid',
          userId,
        }),
      );

      return { success: false, reason: 'invalid' };
    }

    if (backupCode.isUsed) {
      this.logger.warn(
        JSON.stringify({
          event: 'backup_code_already_used',
          userId,
          codeId: backupCode.id,
        }),
      );

      return { success: false, reason: 'already_used' };
    }

    // Mark code as used
    await this.prisma.mfaBackupCode.update({
      where: { id: backupCode.id },
      data: {
        isUsed: true,
        usedAt: new Date(),
      },
    });

    // Get remaining count
    const remainingCount = await this.prisma.mfaBackupCode.count({
      where: {
        tenantId,
        userId,
        isUsed: false,
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'backup_code_used',
        tenantId,
        userId,
        remainingCount,
      }),
    );

    return {
      success: true,
      reason: 'valid',
      remainingCount,
    };
  }

  /**
   * Get remaining unused backup codes count
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param userId - User ID
   * @returns Number of remaining unused codes
   */
  async getRemainingCount(tenantId: string, userId: string): Promise<number> {
    return this.prisma.mfaBackupCode.count({
      where: {
        tenantId,
        userId,
        isUsed: false,
      },
    });
  }

  /**
   * Check if user has backup codes set up
   */
  async hasBackupCodes(userId: string): Promise<boolean> {
    const count = await this.prisma.mfaBackupCode.count({
      where: { userId },
    });
    return count > 0;
  }

  /**
   * Delete all backup codes for a user
   *
   * @param userId - User ID
   */
  async deleteAll(userId: string): Promise<void> {
    await this.prisma.mfaBackupCode.deleteMany({
      where: { userId },
    });

    this.logger.log(
      JSON.stringify({
        event: 'backup_codes_deleted',
        userId,
      }),
    );
  }

  /**
   * Generate a random code
   */
  private generateCode(): string {
    let code = '';
    const bytes = crypto.randomBytes(this.codeLength);

    for (let i = 0; i < this.codeLength; i++) {
      code += this.charset[bytes[i] % this.charset.length];
    }

    return code;
  }

  /**
   * Format code as XXXX-XXXX
   */
  private formatCode(code: string): string {
    const mid = Math.floor(code.length / 2);
    return `${code.substring(0, mid)}-${code.substring(mid)}`;
  }

  /**
   * Hash code with HMAC-SHA256
   */
  private hashCode(code: string): string {
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(code.toUpperCase())
      .digest('hex');
  }
}
