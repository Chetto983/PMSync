/**
 * BillingAlertService - Email alerts for cost thresholds
 *
 * Sends alerts when tenants approach their daily cost limits:
 * - Warning: 80% of daily cap
 * - Critical: 95% of daily cap
 * - Blocked: 100% of daily cap (AI disabled)
 *
 * Features:
 * - 60-minute cooldown to prevent spam
 * - Admin notification for critical/blocked
 * - Audit logging for compliance
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md Part 6
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../../common/services/cache.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/services/email.service';
import type { CostProtectionStatus } from '../types/cost-protection.types';

export type AlertLevel = 'warning' | 'critical' | 'blocked';

export interface BillingAlert {
  tenantId: string;
  level: AlertLevel;
  dailyCost: number;
  dailyCap: number | null;
  percentUsed: number;
  timestamp: Date;
}

@Injectable()
export class BillingAlertService {
  private readonly logger = new Logger(BillingAlertService.name);

  // Cooldown period in seconds (60 minutes)
  private readonly alertCooldownSec = 60 * 60;

  // Admin email for critical alerts
  private readonly adminEmail: string;

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
    private readonly emailService: EmailService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {
    this.adminEmail = this.config.get<string>('AI_COST_ALERT_EMAIL') || '';
  }

  // ==========================================================================
  // Alert Sending
  // ==========================================================================

  /**
   * Send billing alert if cooldown has expired
   */
  async sendAlertIfNeeded(
    tenantId: string,
    level: AlertLevel,
    status: CostProtectionStatus,
  ): Promise<boolean> {
    // Check cooldown
    const cooldownKey = this.buildCooldownKey(tenantId, level);
    const lastAlert = await this.cache.get<number>(cooldownKey);

    if (lastAlert && Date.now() - lastAlert < this.alertCooldownSec * 1000) {
      this.logger.debug(`Alert cooldown active for ${tenantId}:${level}`);
      return false;
    }

    // Send alert
    await this.sendAlert(tenantId, level, status);

    // Set cooldown
    await this.cache.set(cooldownKey, Date.now(), { ttl: this.alertCooldownSec });

    return true;
  }

  /**
   * Send billing alert
   */
  private async sendAlert(
    tenantId: string,
    level: AlertLevel,
    status: CostProtectionStatus,
  ): Promise<void> {
    const alert: BillingAlert = {
      tenantId,
      level,
      dailyCost: status.dailyCost,
      dailyCap: status.dailyCap,
      percentUsed: status.percentUsed,
      timestamp: new Date(),
    };

    // Log alert (always)
    const message = this.formatAlertMessage(alert);
    if (level === 'warning') {
      this.logger.warn(message);
    } else {
      this.logger.error(message);
    }

    // Persist alert for audit trail
    await this.persistAlert(alert);

    // Get tenant admin email
    const tenantAdminEmail = await this.getTenantAdminEmail(tenantId);

    // Send email alerts
    await this.sendAlertEmails(alert, tenantAdminEmail);
  }

  /**
   * Send email alerts to appropriate recipients via SendGrid transactional email.
   * Non-blocking: email failures are logged but do not break billing flow.
   */
  private async sendAlertEmails(
    alert: BillingAlert,
    tenantAdminEmail: string | null,
  ): Promise<void> {
    const { tenantId, level } = alert;

    if (tenantAdminEmail) {
      try {
        await this.emailService.sendEmail(
          tenantAdminEmail,
          this.formatEmailSubject(level),
          this.formatEmailBody(alert),
        );
        this.logger.log(`Billing alert email sent to ${tenantAdminEmail} | Level: ${level} | Tenant: ${tenantId}`);
      } catch (err) {
        this.logger.error(
          `Failed to send billing alert email to ${tenantAdminEmail}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Admin notification for critical/blocked
    if ((level === 'critical' || level === 'blocked') && this.adminEmail) {
      try {
        await this.emailService.sendEmail(
          this.adminEmail,
          `[ADMIN] ${this.formatEmailSubject(level)}`,
          this.formatEmailBody(alert),
        );
        this.logger.log(`Admin billing alert email sent to ${this.adminEmail} | Level: ${level} | Tenant: ${tenantId}`);
      } catch (err) {
        this.logger.error(
          `Failed to send admin alert email: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // ==========================================================================
  // Alert Persistence
  // ==========================================================================

  /**
   * Persist alert for audit trail
   */
  private async persistAlert(alert: BillingAlert): Promise<void> {
    if (!this.prisma) {
      this.logger.debug('Prisma not available, skipping alert persistence');
      return;
    }

    try {
      // Store in a generic audit log or dedicated billing_alerts table
      // For now, store in Redis with 30-day retention
      const key = `billing:alerts:${alert.tenantId}:${alert.timestamp.toISOString()}`;
      await this.cache.set(key, alert, { ttl: 86400 * 30 });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to persist billing alert: ${msg}`);
    }
  }

  /**
   * Get recent alerts for a tenant
   */
  async getRecentAlerts(tenantId: string, limit: number = 10): Promise<BillingAlert[]> {
    // In production, this would query from database
    // For now, return empty - alerts are primarily for notification
    this.logger.debug(`Getting recent alerts for ${tenantId}, limit=${limit}`);
    return [];
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Get tenant admin email
   */
  private async getTenantAdminEmail(tenantId: string): Promise<string | null> {
    if (!this.prisma) return null;

    try {
      // Find the first admin user for this tenant
      const adminUser = await this.prisma.user.findFirst({
        where: {
          tenantId,
          role: { in: ['admin', 'owner'] },
        },
        select: { email: true },
      });

      return adminUser?.email || null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to get tenant admin email: ${msg}`);
      return null;
    }
  }

  /**
   * Build cooldown cache key
   */
  private buildCooldownKey(tenantId: string, level: AlertLevel): string {
    return `billing:alert:cooldown:${tenantId}:${level}`;
  }

  /**
   * Format alert message for logging
   */
  private formatAlertMessage(alert: BillingAlert): string {
    return [
      `[BILLING ALERT - ${alert.level.toUpperCase()}]`,
      `Tenant: ${alert.tenantId}`,
      `Daily Cost: $${alert.dailyCost.toFixed(4)}`,
      `Daily Cap: ${alert.dailyCap !== null ? `$${alert.dailyCap.toFixed(2)}` : 'unlimited'}`,
      `Usage: ${alert.percentUsed}%`,
    ].join(' | ');
  }

  /**
   * Format email subject
   */
  private formatEmailSubject(level: AlertLevel): string {
    const subjects: Record<AlertLevel, string> = {
      warning: '⚠️ AI Usage Warning - 80% of Daily Limit',
      critical: '🚨 AI Usage Critical - 95% of Daily Limit',
      blocked: '🛑 AI Usage Blocked - Daily Limit Reached',
    };
    return subjects[level];
  }

  /**
   * Format email body (HTML)
   */
  formatEmailBody(alert: BillingAlert): string {
    const actionMap: Record<AlertLevel, string> = {
      warning: 'Consider upgrading your plan for additional capacity.',
      critical: 'AI features will be disabled at 100%. Upgrade now to avoid interruption.',
      blocked: 'AI features are now disabled until tomorrow or until you upgrade your plan.',
    };

    return `
      <h2>AI Usage ${alert.level === 'blocked' ? 'Limit Reached' : 'Alert'}</h2>
      <p>Your AI usage has reached <strong>${alert.percentUsed}%</strong> of your daily limit.</p>
      <table style="border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Daily Cost</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">$${alert.dailyCost.toFixed(4)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Daily Cap</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${alert.dailyCap !== null ? `$${alert.dailyCap.toFixed(2)}` : 'Unlimited'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Usage</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${alert.percentUsed}%</td>
        </tr>
      </table>
      <p><strong>Next Steps:</strong> ${actionMap[alert.level]}</p>
      <p><a href="${this.config.get('FRONTEND_URL', 'https://app.pmsync.com')}/settings/billing">Manage Subscription</a></p>
    `;
  }
}
