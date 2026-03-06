/**
 * Shared types for cost protection.
 * Extracted to break circular dependency between cost-protection.service.ts and billing-alert.service.ts.
 */

export interface CostProtectionStatus {
  dailyCost: number;
  dailyCap: number | null;
  percentUsed: number;
  isBlocked: boolean;
  alertLevel: 'ok' | 'warning' | 'critical' | 'blocked';
}
