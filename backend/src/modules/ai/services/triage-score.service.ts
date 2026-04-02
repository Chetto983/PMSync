/**
 * TriageScoreService — Computes priority/urgency scores subordinate to label metadata.
 *
 * Replaces the old normalizeTriageSignals() with label-aware scoring:
 *   - suppressUrgency labels → cap urgency to low, priority 4-5
 *   - workflow/action-now labels → floor priority to 1-2
 *   - actionability-based adjustments
 *   - Zero labels → raw LLM signals without adjustments
 *
 * Phase 10 — Sprint 15 (T-1502)
 */
import { Injectable, Logger } from '@nestjs/common';
import type { TenantLabel, LabelResolutionResult } from './label-resolution.service';

export interface TriageSignals {
  priority: 1 | 2 | 3 | 4 | 5;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  intent: string;
  actionability: 'none' | 'todo' | 'waiting';
  escalationRisk: boolean;
  hasDeadline: boolean;
  deadlineDate: Date | null;
  needsFollowUp: boolean;
  followUpDate: Date | null;
  followUpReason: string | null;
}

export interface TriageScoreResult {
  priority: 1 | 2 | 3 | 4 | 5;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  deadlineDate: Date | null;
  needsFollowUp: boolean;
  followUpDate: Date | null;
  followUpReason: string | null;
  priorityReason: string;
}

const MAX_REASON_LENGTH = 120;

@Injectable()
export class TriageScoreService {
  private readonly logger = new Logger(TriageScoreService.name);

  /**
   * Compute triage scores that are subordinate to resolved labels.
   * Uses label metadata (not hardcoded names) for adjustments.
   */
  compute(
    labelResult: LabelResolutionResult,
    signals: TriageSignals,
    tenantLabels: TenantLabel[],
    email: { from: string; subject: string | null },
  ): TriageScoreResult {
    let { priority, urgency } = signals;
    const { deadlineDate, needsFollowUp, followUpDate, followUpReason } = signals;
    const reasons: string[] = [];

    // Zero labels → return raw LLM signals without label-based adjustments
    if (labelResult.labels.length === 0) {
      return {
        priority,
        urgency,
        deadlineDate,
        needsFollowUp,
        followUpDate,
        followUpReason,
        priorityReason: this.buildReason(reasons, signals, email),
      };
    }

    // Get label metadata for resolved labels
    const resolvedDefs = labelResult.labels
      .map((name) => tenantLabels.find((l) => l.name === name))
      .filter((d): d is TenantLabel => d !== undefined);

    // Rule: suppressUrgency → cap urgency to low, priority 4-5
    if (labelResult.suppressUrgency) {
      urgency = 'low';
      priority = Math.max(priority, 4) as 1 | 2 | 3 | 4 | 5;
      const suppressLabel = resolvedDefs.find((d) => d.suppressUrgency);
      if (suppressLabel) {
        reasons.push(`Label "${suppressLabel.name}": urgency suppressed`);
      }
    }

    // Rule: workflow label with defaultLane=action-now → floor priority to 1-2
    if (!labelResult.suppressUrgency) {
      const actionNowLabel = resolvedDefs.find(
        (d) => d.category === 'workflow' && d.defaultLane === 'action-now',
      );
      if (actionNowLabel) {
        priority = Math.min(priority, 2) as 1 | 2 | 3 | 4 | 5;
        if (urgency !== 'critical') urgency = 'high';
        reasons.push(`Label "${actionNowLabel.name}": requires immediate action`);
      }
    }

    // Rule: actionability=none + no deadline → cap urgency to medium
    if (signals.actionability === 'none' && !signals.hasDeadline && !labelResult.suppressUrgency) {
      if (urgency === 'critical' || urgency === 'high') {
        urgency = 'medium';
        reasons.push('No action needed and no deadline');
      }
    }

    // Rule: actionability=waiting → set urgency to medium (unless deadline close)
    if (signals.actionability === 'waiting' && !labelResult.suppressUrgency) {
      const isDeadlineClose = deadlineDate && this.isWithin48h(deadlineDate);
      if (!isDeadlineClose && (urgency === 'critical' || urgency === 'high')) {
        urgency = 'medium';
        reasons.push('Waiting on reply, no imminent deadline');
      }
    }

    return {
      priority,
      urgency,
      deadlineDate,
      needsFollowUp: labelResult.suppressUrgency && !signals.hasDeadline ? false : needsFollowUp,
      followUpDate: labelResult.suppressUrgency && !signals.hasDeadline ? null : followUpDate,
      followUpReason: labelResult.suppressUrgency && !signals.hasDeadline ? null : followUpReason,
      priorityReason: this.buildReason(reasons, signals, email),
    };
  }

  private buildReason(
    labelReasons: string[],
    signals: TriageSignals,
    email: { from: string; subject: string | null },
  ): string {
    // Use label-based reason if available
    if (labelReasons.length > 0) {
      return labelReasons[0].slice(0, MAX_REASON_LENGTH);
    }

    // Fallback: build from strongest signal
    if (signals.escalationRisk) {
      return `Escalation risk: ${email.subject || email.from}`.slice(0, MAX_REASON_LENGTH);
    }
    if (signals.hasDeadline) {
      return `Deadline detected: ${email.subject || email.from}`.slice(0, MAX_REASON_LENGTH);
    }
    if (signals.intent === 'request') {
      return `Action requested: ${email.subject || email.from}`.slice(0, MAX_REASON_LENGTH);
    }
    if (signals.intent === 'alert') {
      return `Alert: ${email.subject || email.from}`.slice(0, MAX_REASON_LENGTH);
    }

    return `From ${email.from}`.slice(0, MAX_REASON_LENGTH);
  }

  private isWithin48h(date: Date): boolean {
    const now = Date.now();
    const diff = date.getTime() - now;
    return diff > 0 && diff <= 48 * 60 * 60 * 1000;
  }
}
