/**
 * OpsAlertService — T-1801
 *
 * Fires operational alerts to an external webhook (Slack/Discord) when
 * structured log events occur (queue backpressure, worker failure rate, etc.).
 *
 * Features:
 * - Fire-and-forget (never blocks the caller)
 * - 15-minute cooldown dedup per source+level
 * - No-op when OPS_ALERT_WEBHOOK_URL is not configured
 * - 5-second timeout on HTTP POST
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService, CacheNamespace } from './cache.service';
import axios from 'axios';

export interface OpsAlert {
  level: 'warning' | 'critical';
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Cooldown in seconds — same source+level won't fire again within this window */
const COOLDOWN_SECONDS = 15 * 60; // 15 minutes

/** HTTP timeout for webhook POST */
const WEBHOOK_TIMEOUT_MS = 5000;

@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);
  private readonly webhookUrl: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {
    this.webhookUrl = this.config.get<string>('OPS_ALERT_WEBHOOK_URL');
    if (this.webhookUrl) {
      this.logger.log(`Ops alerts enabled → ${this.webhookUrl.substring(0, 40)}...`);
    } else {
      this.logger.debug('Ops alerts disabled (OPS_ALERT_WEBHOOK_URL not set)');
    }
  }

  /**
   * Fire an alert. Non-blocking — errors are logged, never thrown.
   */
  async fire(alert: OpsAlert): Promise<void> {
    // Always log the alert regardless of webhook config
    const logMethod = alert.level === 'critical' ? 'error' : 'warn';
    this.logger[logMethod](
      `[OPS-ALERT:${alert.level}] ${alert.source}: ${alert.message}`,
    );

    if (!this.webhookUrl) return;

    // Cooldown dedup: skip if same source+level fired recently
    const dedupKey = `ops-alert:${alert.source}:${alert.level}`;
    const recent = await this.cache.get(dedupKey, { namespace: CacheNamespace.RATE_LIMIT });
    if (recent) {
      this.logger.debug(`Ops alert suppressed (cooldown): ${dedupKey}`);
      return;
    }

    // Mark as sent (TTL = cooldown)
    await this.cache.set(dedupKey, { sentAt: new Date().toISOString() }, {
      namespace: CacheNamespace.RATE_LIMIT,
      ttl: COOLDOWN_SECONDS,
    });

    // Fire-and-forget POST
    this.postWebhook(alert).catch((err) => {
      this.logger.warn(`Ops alert webhook failed: ${err instanceof Error ? err.message : err}`);
    });
  }

  private async postWebhook(alert: OpsAlert): Promise<void> {
    const emoji = alert.level === 'critical' ? '🚨' : '⚠️';
    const color = alert.level === 'critical' ? '#dc3545' : '#ffc107';

    // Slack-compatible payload (also works with Discord webhooks)
    const payload = {
      text: `${emoji} *[${alert.level.toUpperCase()}]* ${alert.source}`,
      attachments: [
        {
          color,
          text: alert.message,
          fields: alert.metadata
            ? Object.entries(alert.metadata).map(([k, v]) => ({
                title: k,
                value: String(v),
                short: true,
              }))
            : undefined,
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await axios.post(this.webhookUrl!, payload, {
      timeout: WEBHOOK_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
