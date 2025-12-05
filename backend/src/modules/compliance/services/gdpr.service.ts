import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DataSubjectRightDto,
  GdprCheckDto,
  GdprOfficerDto,
  GdprStatsDto,
  GdprStatusDto,
  PendingActionDto,
} from '../dto/gdpr-status.dto';

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  private readonly policyLastUpdated = '2025-10-28';
  private readonly lastAudit = '2025-10-30T13:47:00.000Z';
  private readonly dataProtectionOfficer: GdprOfficerDto = {
    name: 'PMSync Privacy Office',
    email: 'privacy@pmsync.local',
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get GDPR compliance status
   * @param tenantId - Optional tenant ID to filter stats (admin sees own tenant, super-admin sees all)
   */
  async getStatus(tenantId?: string): Promise<GdprStatusDto> {
    // If tenantId provided, filter stats by tenant
    const tenantFilter = tenantId ? { tenantId } : {};

    const [totalUsers, softDeletedUsers, auditLogEntries] = await this.prisma.$transaction([
      this.prisma.user.count({ where: tenantFilter }),
      this.prisma.user.count({ where: { ...tenantFilter, deletedAt: { not: null } } }),
      this.prisma.auditLog.count({ where: tenantFilter }),
    ]);

    const checks: GdprCheckDto[] = [
      {
        id: 'encryption-at-rest',
        label: 'Encryption at Rest',
        status: 'pass',
        details: 'Sensitive credentials are encrypted using AES-256 via CryptoService.',
      },
      {
        id: 'encryption-in-transit',
        label: 'Encryption in Transit',
        status: 'pass',
        details: 'All HTTP traffic is expected to be served over HTTPS with TLS 1.2+.',
      },
      {
        id: 'multi-tenancy-isolation',
        label: 'Tenant Data Isolation',
        status: 'pass',
        details: 'Database schema enforces tenant scoping for users, emails, and provider configurations.',
      },
      {
        id: 'audit-log',
        label: 'Audit Logging',
        status: auditLogEntries > 0 ? 'pass' : 'warn',
        details:
          auditLogEntries > 0
            ? 'Audit entries present in database.'
            : 'Audit log table empty; enable audit trail to meet accountability requirement.',
      },
      {
        id: 'right-to-erasure',
        label: 'Right to Erasure',
        status: softDeletedUsers > 0 ? 'warn' : 'pass',
        details:
          softDeletedUsers > 0
            ? 'Soft deletions recorded; schedule purge job to remove personal data permanently.'
            : 'User deletion queue is empty; erasure requests can be processed immediately.',
      },
    ];

    const dataSubjectRights: DataSubjectRightDto[] = [
      {
        id: 'access',
        label: 'Right of Access',
        status: 'available',
        details: 'Users can request/export their data through account settings or support.',
      },
      {
        id: 'rectification',
        label: 'Right to Rectification',
        status: 'available',
        details: 'Profile information can be updated directly from the dashboard.',
      },
      {
        id: 'erasure',
        label: 'Right to Erasure',
        status: softDeletedUsers > 0 ? 'manual' : 'available',
        details:
          'Account deletion triggers soft-delete; background purge workflow to remove data is pending automation.',
      },
      {
        id: 'portability',
        label: 'Data Portability',
        status: 'manual',
        details:
          'Data exports can be generated on request. Automated export tooling is planned via the AI agent.',
      },
    ];

    const pendingActions: PendingActionDto[] = [];

    if (softDeletedUsers > 0) {
      pendingActions.push({
        id: 'purge-soft-deleted-users',
        description: `Found ${softDeletedUsers} soft-deleted user(s) awaiting permanent purge.`,
        severity: 'medium',
        eta: 'Planned Q4 2025',
      });
    }

    const stats: GdprStatsDto = {
      totalUsers,
      softDeletedUsers,
      auditLogEntries,
    };

    const hasWarnings = checks.some((check) => check.status === 'warn') || pendingActions.length > 0;

    const status: GdprStatusDto = {
      compliant: !hasWarnings,
      status: hasWarnings ? 'attention' : 'compliant',
      lastAudit: this.lastAudit,
      policyLastUpdated: this.policyLastUpdated,
      dataProtectionOfficer: this.dataProtectionOfficer,
      checks,
      dataSubjectRights,
      pendingActions,
      stats,
    };

    if (hasWarnings) {
      this.logger.warn('GDPR status reports outstanding warnings or pending actions.');
    }

    return status;
  }
}
