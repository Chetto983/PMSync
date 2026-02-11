import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LegalStatusDto } from '../dto/legal-acceptance.dto';
import {
  CURRENT_TOS_VERSION,
  CURRENT_PP_VERSION,
  CURRENT_VERSIONS,
  VALID_DOCUMENT_TYPES,
  DocumentType,
} from '../legal.constants';

/**
 * Legal acceptance service (LEGAL-01, LEGAL-02)
 *
 * Records user acceptance of Terms of Service and Privacy Policy
 * with version tracking, IP address, and user agent for legal evidence.
 *
 * Follows the same Prisma query patterns as ConsentService.
 */
@Injectable()
export class LegalAcceptanceService {
  private readonly logger = new Logger(LegalAcceptanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record acceptance of a legal document.
   * Validates that documentType is valid and documentVersion matches
   * the current version for that document type.
   */
  async accept(
    userId: string,
    tenantId: string,
    documentType: string,
    documentVersion: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Validate document type
    if (!VALID_DOCUMENT_TYPES.includes(documentType as DocumentType)) {
      throw new BadRequestException(`Invalid document type: ${documentType}`);
    }

    // Validate version matches current version
    const currentVersion = CURRENT_VERSIONS[documentType as DocumentType];
    if (documentVersion !== currentVersion) {
      throw new BadRequestException(
        `Version mismatch for ${documentType}: expected ${currentVersion}, got ${documentVersion}`,
      );
    }

    const record = await this.prisma.legalAcceptance.create({
      data: {
        userId,
        tenantId,
        documentType,
        documentVersion,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });

    this.logger.log(
      `Legal acceptance recorded: user=${userId} type=${documentType} version=${documentVersion}`,
    );

    return record;
  }

  /**
   * Check if user has accepted BOTH current ToS and Privacy Policy versions.
   * Used by LegalAcceptanceGuard for route enforcement.
   */
  async hasAcceptedCurrentVersions(userId: string, tenantId: string): Promise<boolean> {
    const [tosAcceptance, ppAcceptance] = await Promise.all([
      this.prisma.legalAcceptance.findFirst({
        where: {
          userId,
          tenantId,
          documentType: 'TOS',
          documentVersion: CURRENT_TOS_VERSION,
        },
        orderBy: { acceptedAt: 'desc' },
      }),
      this.prisma.legalAcceptance.findFirst({
        where: {
          userId,
          tenantId,
          documentType: 'PRIVACY_POLICY',
          documentVersion: CURRENT_PP_VERSION,
        },
        orderBy: { acceptedAt: 'desc' },
      }),
    ]);

    return tosAcceptance !== null && ppAcceptance !== null;
  }

  /**
   * Get detailed legal acceptance status for all document types.
   * Returns which documents are accepted and their versions.
   */
  async getStatus(userId: string, tenantId: string): Promise<LegalStatusDto> {
    // Get latest acceptance per document type
    const [latestTos, latestPp] = await Promise.all([
      this.prisma.legalAcceptance.findFirst({
        where: {
          userId,
          tenantId,
          documentType: 'TOS',
        },
        orderBy: { acceptedAt: 'desc' },
      }),
      this.prisma.legalAcceptance.findFirst({
        where: {
          userId,
          tenantId,
          documentType: 'PRIVACY_POLICY',
        },
        orderBy: { acceptedAt: 'desc' },
      }),
    ]);

    return {
      tosAccepted: latestTos?.documentVersion === CURRENT_TOS_VERSION,
      tosVersion: latestTos?.documentVersion ?? null,
      ppAccepted: latestPp?.documentVersion === CURRENT_PP_VERSION,
      ppVersion: latestPp?.documentVersion ?? null,
      currentTosVersion: CURRENT_TOS_VERSION,
      currentPpVersion: CURRENT_PP_VERSION,
    };
  }
}
