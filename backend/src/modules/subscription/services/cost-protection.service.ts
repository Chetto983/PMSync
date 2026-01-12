/**
 * CostProtectionService - AI Cost Caps and Alerts
 *
 * Prevents bankruptcy from uncontrolled AI usage with:
 * - Per-tier daily cost caps
 * - Real-time cost tracking
 * - Alert thresholds
 * - Kill switch support
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md Part 6
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageTrackingService, OPERATION_COSTS } from './usage-tracking.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionPlan } from '@prisma/client';

/**
 * Daily cost caps per tier
 * @see P10 Part 6.1
 */
export const DAILY_COST_CAPS: Record<SubscriptionPlan, number | null> = {
  FREE: 0.10,           // $0.10/day max
  STARTER: 0.50,        // $0.50/day max
  PROFESSIONAL: 2.00,   // $2.00/day max
  ENTERPRISE: null,     // Custom/unlimited
};

export interface CostProtectionStatus {
  dailyCost: number;
  dailyCap: number | null;
  percentUsed: number;
  isBlocked: boolean;
  alertLevel: 'ok' | 'warning' | 'critical' | 'blocked';
}

@Injectable()
export class CostProtectionService {
  private readonly logger = new Logger(CostProtectionService.name);

  // Configuration
  private readonly alertThreshold: number;
  private readonly criticalThreshold: number;
  private readonly globalDailyCap: number;
  private readonly globalMonthlyCap: number;
  private readonly alertEmail: string;

  constructor(
    private readonly config: ConfigService,
    private readonly usageTracking: UsageTrackingService,
    private readonly subscriptionService: SubscriptionService,
  ) {
    // Load configuration
    this.alertThreshold = this.config.get<number>('AI_COST_ALERT_THRESHOLD') || 0.8;
    this.criticalThreshold = 0.95;
    this.globalDailyCap = this.config.get<number>('AI_DAILY_COST_CAP') || 50.0;
    this.globalMonthlyCap = this.config.get<number>('AI_MONTHLY_COST_CAP') || 1500.0;
    this.alertEmail = this.config.get<string>('AI_COST_ALERT_EMAIL') || '';
  }

  // ==========================================================================
  // Cost Protection Checks
  // ==========================================================================

  /**
   * Check if operation is allowed based on cost caps
   */
  async canProceed(
    tenantId: string,
    operation: keyof typeof OPERATION_COSTS,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const subscription = await this.subscriptionService.getOrCreateSubscription(tenantId);
    const dailyCost = await this.usageTracking.getDailyCost(tenantId);
    const operationCost = OPERATION_COSTS[operation];
    const cap = DAILY_COST_CAPS[subscription.plan];

    // Check global daily cap (safety net)
    if (dailyCost + operationCost > this.globalDailyCap) {
      this.logger.warn(`Global daily cap reached: $${dailyCost.toFixed(4)} of $${this.globalDailyCap}`);
      return {
        allowed: false,
        reason: 'Global daily cost limit reached. Contact support for enterprise plan.',
      };
    }

    // Check per-tier daily cap
    if (cap !== null && dailyCost + operationCost > cap) {
      this.logger.warn(`Tenant ${tenantId} reached daily cap: $${dailyCost.toFixed(4)} of $${cap}`);
      return {
        allowed: false,
        reason: `Daily AI budget of $${cap.toFixed(2)} reached. Upgrade your plan for more capacity.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get cost protection status for a tenant
   */
  async getStatus(tenantId: string): Promise<CostProtectionStatus> {
    const subscription = await this.subscriptionService.getOrCreateSubscription(tenantId);
    const dailyCost = await this.usageTracking.getDailyCost(tenantId);
    const cap = DAILY_COST_CAPS[subscription.plan];

    let percentUsed = 0;
    let isBlocked = false;
    let alertLevel: CostProtectionStatus['alertLevel'] = 'ok';

    if (cap !== null) {
      percentUsed = Math.round((dailyCost / cap) * 100);

      if (percentUsed >= 100) {
        isBlocked = true;
        alertLevel = 'blocked';
      } else if (percentUsed >= this.criticalThreshold * 100) {
        alertLevel = 'critical';
      } else if (percentUsed >= this.alertThreshold * 100) {
        alertLevel = 'warning';
      }
    }

    return {
      dailyCost,
      dailyCap: cap,
      percentUsed,
      isBlocked,
      alertLevel,
    };
  }

  // ==========================================================================
  // Alerts
  // ==========================================================================

  /**
   * Check and send alerts if thresholds are crossed
   */
  async checkAndAlert(tenantId: string): Promise<void> {
    const status = await this.getStatus(tenantId);

    if (status.alertLevel === 'warning') {
      await this.sendAlert(tenantId, 'warning', status);
    } else if (status.alertLevel === 'critical') {
      await this.sendAlert(tenantId, 'critical', status);
    } else if (status.alertLevel === 'blocked') {
      await this.sendAlert(tenantId, 'blocked', status);
    }
  }

  /**
   * Send cost alert
   */
  private async sendAlert(
    tenantId: string,
    level: 'warning' | 'critical' | 'blocked',
    status: CostProtectionStatus,
  ): Promise<void> {
    const message = this.formatAlertMessage(tenantId, level, status);
    this.logger.warn(message);

    // TODO: Implement actual alerting (email, Slack, PagerDuty)
    // For now, just log
    if (this.alertEmail) {
      // await this.emailService.sendCostAlert(this.alertEmail, tenantId, level, status);
    }
  }

  /**
   * Format alert message
   */
  private formatAlertMessage(
    tenantId: string,
    level: string,
    status: CostProtectionStatus,
  ): string {
    return [
      `[COST ALERT - ${level.toUpperCase()}]`,
      `Tenant: ${tenantId}`,
      `Daily Cost: $${status.dailyCost.toFixed(4)}`,
      `Daily Cap: ${status.dailyCap !== null ? `$${status.dailyCap.toFixed(2)}` : 'unlimited'}`,
      `Usage: ${status.percentUsed}%`,
    ].join(' | ');
  }

  // ==========================================================================
  // Cost Estimation
  // ==========================================================================

  /**
   * Estimate cost for a batch operation
   */
  estimateCost(
    operation: keyof typeof OPERATION_COSTS,
    count: number,
  ): number {
    return OPERATION_COSTS[operation] * count;
  }

  /**
   * Get daily cost breakdown by operation type
   */
  async getDailyBreakdown(tenantId: string): Promise<{
    total: number;
    byOperation: Record<string, number>;
  }> {
    const featureUsage = await this.usageTracking.getFeatureUsage(tenantId);

    const byOperation: Record<string, number> = {
      smartReplies: featureUsage.smartReplies * OPERATION_COSTS.smartReply,
      summaries: featureUsage.summaries * OPERATION_COSTS.summary,
      triage: featureUsage.triage * OPERATION_COSTS.triage,
      briefings: featureUsage.briefings * OPERATION_COSTS.briefing,
      embeddings: featureUsage.embeddings * OPERATION_COSTS.embedding,
    };

    const total = Object.values(byOperation).reduce((a, b) => a + b, 0);

    return { total, byOperation };
  }

  // ==========================================================================
  // Kill Switches
  // ==========================================================================

  /**
   * Check if AI is globally disabled
   */
  isAIDisabled(): boolean {
    return this.config.get<string>('DISABLE_AI') === 'true';
  }

  /**
   * Check if embeddings are globally disabled
   */
  isEmbeddingsDisabled(): boolean {
    return this.config.get<string>('DISABLE_EMBEDDINGS') === 'true';
  }

  /**
   * Check if a specific feature is enabled
   */
  isFeatureEnabled(feature: 'smart_replies' | 'summarization' | 'scheduling' | 'contact_dedupe' | 'proactive'): boolean {
    const envMap: Record<string, string> = {
      smart_replies: 'AI_SMART_REPLIES',
      summarization: 'AI_SUMMARIZATION',
      scheduling: 'AI_SCHEDULING',
      contact_dedupe: 'AI_CONTACT_DEDUPE',
      proactive: 'AI_PROACTIVE',
    };

    const envVar = envMap[feature];
    const value = this.config.get<string>(envVar);

    // Most features are enabled by default (except proactive)
    if (feature === 'proactive') {
      return value === 'true';
    }
    return value !== 'false';
  }
}
