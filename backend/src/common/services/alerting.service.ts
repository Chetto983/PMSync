import { Injectable, Logger } from '@nestjs/common';

/**
 * Alert definition with severity levels and thresholds
 * Phase 5.2: Centralized alerting service for monitoring
 */
export interface Alert {
    level: 'warning' | 'critical';
    type: string;
    message: string;
    value?: number;
    threshold?: number;
    timestamp: Date;
}

export interface AlertThresholds {
    queueUtilizationWarning: number;
    queueUtilizationCritical: number;
    providerErrorThreshold: number;
    authErrorThreshold: number;
}

export interface AlertCheckResult {
    hasAlerts: boolean;
    criticalCount: number;
    warningCount: number;
    alerts: Alert[];
}

@Injectable()
export class AlertingService {
    private readonly logger = new Logger(AlertingService.name);

    /** Default thresholds (can be overridden via config) */
    private readonly thresholds: AlertThresholds = {
        queueUtilizationWarning: 80,
        queueUtilizationCritical: 95,
        providerErrorThreshold: 3,
        authErrorThreshold: 1,
    };

    /**
     * Create an alert object with timestamp
     */
    createAlert(
        level: 'warning' | 'critical',
        type: string,
        message: string,
        value?: number,
        threshold?: number,
    ): Alert {
        return {
            level,
            type,
            message,
            value,
            threshold,
            timestamp: new Date(),
        };
    }

    /**
     * Check queue utilization against thresholds
     */
    checkQueueUtilization(
        queueName: string,
        utilizationPercent: number,
    ): Alert | null {
        if (utilizationPercent >= this.thresholds.queueUtilizationCritical) {
            return this.createAlert(
                'critical',
                'queue_utilization',
                `Queue ${queueName} utilization critical`,
                utilizationPercent,
                this.thresholds.queueUtilizationCritical,
            );
        }
        if (utilizationPercent >= this.thresholds.queueUtilizationWarning) {
            return this.createAlert(
                'warning',
                'queue_utilization',
                `Queue ${queueName} utilization high`,
                utilizationPercent,
                this.thresholds.queueUtilizationWarning,
            );
        }
        return null;
    }

    /**
     * Check provider errors against threshold
     */
    checkProviderErrors(errorCount: number): Alert | null {
        if (errorCount > this.thresholds.providerErrorThreshold) {
            return this.createAlert(
                'warning',
                'provider_errors',
                `${errorCount} providers with sync errors`,
                errorCount,
                this.thresholds.providerErrorThreshold,
            );
        }
        return null;
    }

    /**
     * Check auth errors (critical severity)
     */
    checkAuthErrors(authErrorCount: number): Alert | null {
        if (authErrorCount >= this.thresholds.authErrorThreshold) {
            return this.createAlert(
                'critical',
                'auth_errors',
                `${authErrorCount} providers with auth errors`,
                authErrorCount,
                this.thresholds.authErrorThreshold,
            );
        }
        return null;
    }

    /**
     * Check webhook expiration
     */
    checkWebhookExpiring(expiringCount: number): Alert | null {
        if (expiringCount > 0) {
            return this.createAlert(
                'warning',
                'webhook_expiring',
                `${expiringCount} webhooks expiring soon`,
                expiringCount,
            );
        }
        return null;
    }

    /**
     * Check Redis connectivity
     */
    checkRedisConnectivity(isConnected: boolean): Alert | null {
        if (!isConnected) {
            return this.createAlert('critical', 'redis_disconnected', 'Redis connection lost');
        }
        return null;
    }

    /**
     * Aggregate alerts into a result summary
     */
    summarizeAlerts(alerts: (Alert | null)[]): AlertCheckResult {
        const validAlerts = alerts.filter((a): a is Alert => a !== null);
        return {
            hasAlerts: validAlerts.length > 0,
            criticalCount: validAlerts.filter((a) => a.level === 'critical').length,
            warningCount: validAlerts.filter((a) => a.level === 'warning').length,
            alerts: validAlerts,
        };
    }

    /**
     * Get current thresholds (for API exposure)
     */
    getThresholds(): AlertThresholds {
        return { ...this.thresholds };
    }
}
