/**
 * LaneAssignmentService — Assigns inbox lanes based on label metadata and triage signals.
 *
 * Lane priority:
 *   1. Primary label's defaultLane
 *   2. Override: escalationRisk → action-now
 *   3. Override: deadline within 48h → action-now
 *   4. Fallback: intent + actionability mapping
 *   5. Default: review-later
 *
 * Phase 10 — Sprint 15 (T-1503)
 */
import { Injectable } from '@nestjs/common';
import type { TenantLabel, LabelResolutionResult } from './label-resolution.service';

export interface LaneInput {
  labelResult: LabelResolutionResult;
  tenantLabels: TenantLabel[];
  actionability: 'none' | 'todo' | 'waiting';
  urgency: 'critical' | 'high' | 'medium' | 'low';
  escalationRisk: boolean;
  hasDeadline: boolean;
  deadlineDate: Date | null;
}

export interface LaneResult {
  lane: string;
  laneReason: string;
}

@Injectable()
export class LaneAssignmentService {
  /**
   * Assign an inbox lane for the email.
   */
  assignLane(input: LaneInput): LaneResult {
    const {
      labelResult,
      tenantLabels,
      actionability,
      urgency,
      escalationRisk,
      hasDeadline,
      deadlineDate,
    } = input;

    // Override: escalation risk always goes to action-now
    if (escalationRisk) {
      return { lane: 'action-now', laneReason: 'Escalation risk detected' };
    }

    // Override: deadline within 48h → action-now
    if (hasDeadline && deadlineDate && this.isWithin48h(deadlineDate)) {
      return { lane: 'action-now', laneReason: 'Deadline within 48 hours' };
    }

    // 1. Primary label's defaultLane (first label with a defaultLane wins)
    for (const labelName of labelResult.labels) {
      const def = tenantLabels.find((l) => l.name === labelName);
      if (def?.defaultLane) {
        return {
          lane: def.defaultLane,
          laneReason: `Label "${def.name}" default lane`,
        };
      }
    }

    // 2. suppressUrgency + suppression category → system-alerts or review-later
    if (labelResult.suppressUrgency) {
      const suppressDef = labelResult.labels
        .map((n) => tenantLabels.find((l) => l.name === n))
        .find((d) => d?.suppressUrgency && d?.category === 'suppression');
      if (suppressDef) {
        return { lane: 'system-alerts', laneReason: `Suppressed by "${suppressDef.name}"` };
      }
      return { lane: 'review-later', laneReason: 'Urgency suppressed' };
    }

    // 3. Fallback: map from actionability + urgency
    if (actionability === 'todo' && (urgency === 'critical' || urgency === 'high')) {
      return { lane: 'action-now', laneReason: 'High-urgency action required' };
    }
    if (actionability === 'waiting') {
      return { lane: 'waiting-on-reply', laneReason: 'Waiting for response' };
    }
    if (actionability === 'todo') {
      return { lane: 'action-now', laneReason: 'Action required' };
    }

    return { lane: 'review-later', laneReason: 'Informational' };
  }

  private isWithin48h(date: Date): boolean {
    const now = Date.now();
    const diff = date.getTime() - now;
    return diff > 0 && diff <= 48 * 60 * 60 * 1000;
  }
}
