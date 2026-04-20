/**
 * Phase 148 D-05 listener. Subscribes to `'triage.accuracy.applied'` events
 * emitted by Phase-147 TriageFeedbackService (wired in Plan 04). Translates
 * each event into one or two enqueues on the accuracy-update queue.
 *
 * Label-name → labelId resolution uses UserLabel.slug (preferred) then
 * case-insensitive UserLabel.name fallback (for labels created pre-slug).
 *
 * B-7 hardening: containsSeparator() is invoked on EVERY dedup-key component
 * including the post-resolution labelId on each of the 2 enqueue branches.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { LabelAccuracyQueueService } from '../services/label-accuracy.queue';
import {
  ACCURACY_APPLIED_TOPIC,
  type LabelAccuracyEvent,
} from '../services/label-accuracy.events';

@Injectable()
export class LabelAccuracyListener {
  private readonly logger = new Logger(LabelAccuracyListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: LabelAccuracyQueueService,
  ) {}

  @OnEvent(ACCURACY_APPLIED_TOPIC, { async: true })
  async handleLabelAccuracyEvent(event: LabelAccuracyEvent): Promise<void> {
    try {
      // B-7: pre-resolution component checks.
      if (
        this.containsSeparator(event.tenantId) ||
        this.containsSeparator(event.feedbackId) ||
        this.containsSeparator(event.emailId)
      ) {
        this.logger.warn(
          `Rejecting malformed accuracy event: component contains ':' — tenantId=${event.tenantId} feedbackId=${event.feedbackId}`,
        );
        return;
      }

      const names = [event.oldLabelName, event.newLabelName].filter(
        (n): n is string => typeof n === 'string' && n.length > 0,
      );
      if (names.length === 0) return;

      const labels = await this.prisma.userLabel.findMany({
        where: {
          tenantId: event.tenantId,
          OR: [
            { slug: { in: names } },
            { name: { in: names, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, slug: true },
      });
      const bySlug = new Map(labels.map((l) => [l.slug, l.id]));
      const byName = new Map(labels.map((l) => [l.name.toLowerCase(), l.id]));

      // Old label → FP+1 (AI label was removed by the user)
      if (event.oldLabelName) {
        const labelId =
          bySlug.get(event.oldLabelName) ??
          byName.get(event.oldLabelName.toLowerCase());
        // B-7: per-branch post-resolution labelId guard.
        if (labelId && !this.containsSeparator(labelId)) {
          await this.queue.enqueueAccuracyUpdate({
            tenantId: event.tenantId,
            feedbackId: event.feedbackId,
            labelId,
            kind: 'fp',
            delta: 1,
            triageSource: event.triageSource,
            signal: event.signal,
          });
        }
      }
      // New label → FN+1 (AI missed this label; user added it)
      if (event.newLabelName) {
        const labelId =
          bySlug.get(event.newLabelName) ??
          byName.get(event.newLabelName.toLowerCase());
        // B-7: per-branch post-resolution labelId guard.
        if (labelId && !this.containsSeparator(labelId)) {
          await this.queue.enqueueAccuracyUpdate({
            tenantId: event.tenantId,
            feedbackId: event.feedbackId,
            labelId,
            kind: 'fn',
            delta: 1,
            triageSource: event.triageSource,
            signal: event.signal,
          });
        }
      }
    } catch (err) {
      this.logger.warn(
        `Accuracy listener failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private containsSeparator(s: string): boolean {
    return typeof s === 'string' && s.includes(':');
  }
}
