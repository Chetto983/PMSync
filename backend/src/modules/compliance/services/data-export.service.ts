import {
  Injectable,
  Logger,
  NotFoundException,
  GoneException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DataExportResponseDto } from '../dto/data-export.dto';
import * as archiver from 'archiver';
import { createWriteStream } from 'fs';
import { mkdir, stat, unlink } from 'fs/promises';
import * as path from 'path';

/**
 * Typed structure for all exported user data categories.
 */
interface ExportData {
  profile: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  emails: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  calendarEvents: Record<string, unknown>[];
  aiHistory: Record<string, unknown>[];
  consentHistory: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  organizationMemberships: Record<string, unknown>[];
  sentInvitations: Record<string, unknown>[];
  authAccounts: Record<string, unknown>[];
  activeSessions: Record<string, unknown>[];
}

/**
 * Data Export Service (DATA-01 / GDPR Article 20)
 *
 * Assembles all user data from multiple Prisma models into a ZIP archive
 * of JSON files for data portability. Sensitive fields (passwordHash,
 * tokens, encryption keys) are explicitly excluded via Prisma select.
 *
 * Design decision: Uses inline async processing (fire-and-forget) instead
 * of BullMQ. For a single-tenant app with one user, inline async is simpler
 * and avoids adding a new queue dependency. Can be migrated to BullMQ later
 * if performance becomes an issue.
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Request a data export for the authenticated user.
   * Prevents duplicate requests by returning existing PENDING/PROCESSING exports.
   */
  async requestExport(
    userId: string,
    tenantId: string,
  ): Promise<DataExportResponseDto> {
    // Check for existing in-progress export
    const existing = await this.prisma.dataExportRequest.findFirst({
      where: {
        userId,
        tenantId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      this.logger.log(
        `Returning existing export ${existing.id} (status: ${existing.status}) for user ${userId}`,
      );
      return {
        exportId: existing.id,
        status: existing.status,
        createdAt: existing.createdAt,
        expiresAt: existing.expiresAt,
        fileSize: existing.fileSize,
      };
    }

    // Create new export request
    const exportRequest = await this.prisma.dataExportRequest.create({
      data: {
        userId,
        tenantId,
        status: 'PENDING',
      },
    });

    // Fire-and-forget processing (log errors, don't block response)
    this.processExport(exportRequest.id, userId, tenantId).catch((error) => {
      this.logger.error(
        `Export processing failed for ${exportRequest.id}: ${error}`,
      );
    });

    return {
      exportId: exportRequest.id,
      status: 'PENDING',
      createdAt: exportRequest.createdAt,
    };
  }

  /**
   * Process an export request: assemble data, generate ZIP, update status.
   */
  async processExport(
    exportId: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Mark as PROCESSING
      await this.prisma.dataExportRequest.update({
        where: { id: exportId },
        data: { status: 'PROCESSING' },
      });

      // Assemble all user data
      const data = await this.assembleUserData(userId, tenantId);

      // Generate ZIP file
      const filePath = await this.generateExportZip(exportId, data);

      // Get file size
      const fileStat = await stat(filePath);

      // Mark as READY with 72-hour expiration
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 72);

      await this.prisma.dataExportRequest.update({
        where: { id: exportId },
        data: {
          status: 'READY',
          filePath,
          fileSize: fileStat.size,
          expiresAt,
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `Export ${exportId} completed: ${fileStat.size} bytes, expires ${expiresAt.toISOString()}`,
      );
    } catch (error) {
      this.logger.error(`Export ${exportId} failed: ${error}`);
      await this.prisma.dataExportRequest
        .update({
          where: { id: exportId },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message : String(error),
          },
        })
        .catch((updateErr) => {
          this.logger.error(
            `Failed to update export ${exportId} to FAILED: ${updateErr}`,
          );
        });
    }
  }

  /**
   * Assemble all user data from Prisma models.
   * Uses Promise.all for parallel queries. Sensitive fields excluded via select.
   */
  async assembleUserData(
    userId: string,
    tenantId: string,
  ): Promise<ExportData> {
    const [
      profile,
      preferences,
      emails,
      contacts,
      calendarEvents,
      aiHistory,
      consentHistory,
      auditLogs,
      organizationMemberships,
      sentInvitations,
      authAccounts,
      activeSessions,
    ] = await Promise.all([
      // Profile (EXCLUDE: deletedAt)
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      // Preferences (EXCLUDE: internal IDs)
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: {
          theme: true,
          language: true,
          timezone: true,
          emailDensity: true,
          aiSmartRepliesEnabled: true,
          aiSummarizationEnabled: true,
          aiSchedulingEnabled: true,
          aiAutoTriageEnabled: true,
          jobTitle: true,
          jobRole: true,
          department: true,
          industry: true,
          communicationStyle: true,
          responseLength: true,
          workingHoursStart: true,
          workingHoursEnd: true,
          workingDays: true,
          proactivityLevel: true,
          notificationFrequency: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      // Emails (EXCLUDE: externalId, providerId, htmlBody for size)
      this.prisma.email.findMany({
        where: { tenantId },
        select: {
          subject: true,
          from: true,
          to: true,
          cc: true,
          bcc: true,
          bodyText: true,
          receivedAt: true,
          sentAt: true,
          isRead: true,
          isStarred: true,
          isDraft: true,
          folder: true,
          labels: true,
        },
        take: 50000,
      }),

      // Contacts
      this.prisma.contact.findMany({
        where: { tenantId },
        select: {
          displayName: true,
          emails: true,
          phoneNumbers: true,
          company: true,
          jobTitle: true,
          department: true,
          notes: true,
          tags: true,
          birthday: true,
          addresses: true,
        },
      }),

      // Calendar events
      this.prisma.calendarEvent.findMany({
        where: { tenantId },
        select: {
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          location: true,
          isAllDay: true,
          recurrence: true,
          attendees: true,
        },
      }),

      // AI Memory (EXCLUDE: vector, embeddings)
      this.prisma.aIMemory.findMany({
        where: { tenantId, userId },
        select: {
          content: true,
          memoryType: true,
          category: true,
          tags: true,
          createdAt: true,
        },
      }),

      // Consent history
      this.prisma.userConsent.findMany({
        where: { userId, tenantId },
        select: {
          feature: true,
          granted: true,
          version: true,
          createdAt: true,
        },
      }),

      // Audit logs (limit to 10000 most recent)
      this.prisma.auditLog.findMany({
        where: { userId, tenantId },
        select: {
          action: true,
          entity: true,
          entityId: true,
          createdAt: true,
        },
        take: 10000,
        orderBy: { createdAt: 'desc' },
      }),

      // Organization memberships
      this.prisma.member.findMany({
        where: { userId },
        select: {
          role: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
        },
      }),

      // Invitations sent by this user
      this.prisma.invitation.findMany({
        where: { inviterId: userId },
        select: {
          email: true,
          role: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
        },
      }),

      // Auth accounts (EXCLUDE: password, accessToken, refreshToken, idToken)
      this.prisma.account.findMany({
        where: { userId },
        select: {
          providerId: true,
          accountId: true,
          scope: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      // Active sessions (EXCLUDE: token)
      this.prisma.session.findMany({
        where: { userId },
        select: {
          ipAddress: true,
          userAgent: true,
          activeOrganizationId: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
        },
      }),
    ]);

    return {
      profile: profile as Record<string, unknown> | null,
      preferences: preferences as Record<string, unknown> | null,
      emails: emails as Record<string, unknown>[],
      contacts: contacts as Record<string, unknown>[],
      calendarEvents: calendarEvents as Record<string, unknown>[],
      aiHistory: aiHistory as Record<string, unknown>[],
      consentHistory: consentHistory as Record<string, unknown>[],
      auditLogs: auditLogs as Record<string, unknown>[],
      organizationMemberships: organizationMemberships as Record<string, unknown>[],
      sentInvitations: sentInvitations as Record<string, unknown>[],
      authAccounts: authAccounts as Record<string, unknown>[],
      activeSessions: activeSessions as Record<string, unknown>[],
    };
  }

  /**
   * Generate a ZIP archive from assembled export data.
   * Each data category is a separate JSON file inside the archive.
   */
  async generateExportZip(
    exportId: string,
    data: ExportData,
  ): Promise<string> {
    const exportDir = path.join(process.cwd(), 'tmp', 'exports');
    await mkdir(exportDir, { recursive: true });

    const filePath = path.join(exportDir, `export-${exportId}.zip`);
    const output = createWriteStream(filePath);
    const archive = archiver.default('zip', { zlib: { level: 6 } });

    return new Promise<string>((resolve, reject) => {
      output.on('close', () => resolve(filePath));
      archive.on('error', (err: Error) => reject(err));

      archive.pipe(output);

      // Append each data category as separate JSON file
      if (data.profile) {
        archive.append(JSON.stringify(data.profile, null, 2), {
          name: 'profile.json',
        });
      }

      if (data.preferences) {
        archive.append(JSON.stringify(data.preferences, null, 2), {
          name: 'preferences.json',
        });
      }

      archive.append(JSON.stringify(data.emails, null, 2), {
        name: 'emails.json',
      });

      archive.append(JSON.stringify(data.contacts, null, 2), {
        name: 'contacts.json',
      });

      archive.append(JSON.stringify(data.calendarEvents, null, 2), {
        name: 'calendar-events.json',
      });

      archive.append(JSON.stringify(data.aiHistory, null, 2), {
        name: 'ai-history.json',
      });

      archive.append(JSON.stringify(data.consentHistory, null, 2), {
        name: 'consent-history.json',
      });

      archive.append(JSON.stringify(data.auditLogs, null, 2), {
        name: 'audit-logs.json',
      });

      archive.append(JSON.stringify(data.organizationMemberships, null, 2), {
        name: 'organization-memberships.json',
      });

      archive.append(JSON.stringify(data.sentInvitations, null, 2), {
        name: 'sent-invitations.json',
      });

      archive.append(JSON.stringify(data.authAccounts, null, 2), {
        name: 'auth-accounts.json',
      });

      archive.append(JSON.stringify(data.activeSessions, null, 2), {
        name: 'active-sessions.json',
      });

      // Metadata file
      archive.append(
        JSON.stringify(
          {
            exportDate: new Date().toISOString(),
            format: 'GDPR Article 20 Data Portability Export',
            application: 'PMSync',
            version: '1.0',
            categories: [
              'profile',
              'preferences',
              'emails',
              'contacts',
              'calendar-events',
              'ai-history',
              'consent-history',
              'audit-logs',
              'organization-memberships',
              'sent-invitations',
              'auth-accounts',
              'active-sessions',
            ],
          },
          null,
          2,
        ),
        { name: 'metadata.json' },
      );

      archive.finalize();
    });
  }

  /**
   * Get export status for a specific export (security: user can only see their own).
   */
  async getExportStatus(
    exportId: string,
    userId: string,
  ): Promise<DataExportResponseDto> {
    const exportRequest = await this.prisma.dataExportRequest.findFirst({
      where: { id: exportId, userId },
    });

    if (!exportRequest) {
      throw new NotFoundException(`Export request ${exportId} not found`);
    }

    return {
      exportId: exportRequest.id,
      status: exportRequest.status,
      createdAt: exportRequest.createdAt,
      expiresAt: exportRequest.expiresAt,
      fileSize: exportRequest.fileSize,
    };
  }

  /**
   * Get the file path for a completed export (for download).
   * Validates ownership, readiness, and expiration.
   */
  async getExportFilePath(exportId: string, userId: string): Promise<string> {
    const exportRequest = await this.prisma.dataExportRequest.findFirst({
      where: { id: exportId, userId },
    });

    if (!exportRequest || !exportRequest.filePath) {
      throw new NotFoundException(`Export request ${exportId} not found`);
    }

    if (exportRequest.status !== 'READY') {
      throw new NotFoundException(
        `Export ${exportId} is not ready (status: ${exportRequest.status})`,
      );
    }

    if (exportRequest.expiresAt && exportRequest.expiresAt < new Date()) {
      throw new GoneException(`Export ${exportId} has expired`);
    }

    return exportRequest.filePath;
  }

  /**
   * List recent exports for a user (last 10, ordered by creation date).
   */
  async listExports(
    userId: string,
    tenantId: string,
  ): Promise<DataExportResponseDto[]> {
    const exports = await this.prisma.dataExportRequest.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return exports.map((exp) => ({
      exportId: exp.id,
      status: exp.status,
      createdAt: exp.createdAt,
      expiresAt: exp.expiresAt,
      fileSize: exp.fileSize,
    }));
  }

  /**
   * Cleanup expired exports: delete files from disk and update status.
   * Also cleans up FAILED exports older than 24 hours.
   */
  async cleanupExpiredExports(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    // 1. Find READY exports that have expired
    const expiredExports = await this.prisma.dataExportRequest.findMany({
      where: {
        status: 'READY',
        expiresAt: { lt: now },
      },
    });

    for (const exp of expiredExports) {
      // Delete file from disk (ignore ENOENT)
      if (exp.filePath) {
        try {
          await unlink(exp.filePath);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            this.logger.warn(`Failed to delete export file ${exp.filePath}: ${err}`);
          }
        }
      }

      await this.prisma.dataExportRequest.update({
        where: { id: exp.id },
        data: { status: 'EXPIRED' },
      });
      cleaned++;
    }

    // 2. Clean FAILED exports older than 24 hours
    const failedCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const failedExports = await this.prisma.dataExportRequest.findMany({
      where: {
        status: 'FAILED',
        createdAt: { lt: failedCutoff },
      },
    });

    for (const exp of failedExports) {
      if (exp.filePath) {
        try {
          await unlink(exp.filePath);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            this.logger.warn(`Failed to delete failed export file ${exp.filePath}: ${err}`);
          }
        }
      }

      await this.prisma.dataExportRequest.update({
        where: { id: exp.id },
        data: { status: 'EXPIRED' },
      });
      cleaned++;
    }

    if (cleaned > 0) {
      this.logger.log(
        `Cleaned up ${cleaned} expired/failed data exports (${expiredExports.length} expired, ${failedExports.length} failed)`,
      );
    }

    return cleaned;
  }
}
