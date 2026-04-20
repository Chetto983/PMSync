/**
 * Phase 148 D-15: public event contract for label accuracy tracking.
 *
 * Two topics:
 *   ACCURACY_APPLIED_TOPIC (upstream) — TriageFeedbackService (Plan 04) emits this
 *     when recordFeedback/captureLabelDiff logs a correction. LabelAccuracyListener
 *     (Plan 03) subscribes and enqueues to the 'accuracy-update' BullMQ queue.
 *
 *   ACCURACY_CHANGED_TOPIC (downstream) — LabelAccuracyService emits this after
 *     every counter mutation (inline FP/FN and sweeper TP/rollover). Phase 151/152
 *     (safety governance auto-rollback) and Phase 155 (dashboard) subscribe. This
 *     phase ships ZERO consumer code — the event is the public contract.
 *
 * These strings are load-bearing: once Phase 151/152/155 import them, renaming
 * requires a coordinated multi-phase change.
 */

/** D-05 dedup-key component: kind ∈ {'fp','fn','tp'}. */
export type LabelAccuracyKind = 'fp' | 'fn' | 'tp';

/** D-05 window keys. */
export type AccuracyWindowKey = '7d' | '30d' | 'all';

/** D-07 triage source dimension (matches EmailAnalysis.triageSource). */
export type AccuracyTriageSource = 'llm' | 'rule' | 'llm+rule';

/**
 * D-15 upstream event. Emitted by Phase-147 TriageFeedbackService after every
 * feedback row commit (Plan 04 wires the emitter).
 *
 * feedbackId: `EmailTriageFeedback.id` of the source row. Load-bearing for the
 *   dedup key `accuracy:${tenantId}:${feedbackId}:${labelId}:${kind}` (D-05);
 *   MUST NOT contain ':'.
 * oldLabelName / newLabelName: `Email.aiLabels` is String[] of names/slugs, NOT
 *   labelIds. The listener/service resolves to labelId via UserLabel.slug/name.
 *   null means the feedback did not reference an AI label (e.g., pure reorder).
 */
export const ACCURACY_APPLIED_TOPIC = 'triage.accuracy.applied' as const;
export interface LabelAccuracyEvent {
  readonly tenantId: string;
  readonly feedbackId: string;
  readonly emailId: string;
  readonly signal: 'edit' | 'correction';
  readonly oldLabelName: string | null; // D-02: label removed (FP for this label)
  readonly newLabelName: string | null; // D-03: label added (FN for this label)
  readonly triageSource?: AccuracyTriageSource;
  readonly at: string; // ISO
}

/**
 * D-15 downstream event (exact shape from 148-CONTEXT.md). Phase 151/152/155
 * subscribe. Phase 148 ships zero consumer.
 */
export const ACCURACY_CHANGED_TOPIC = 'triage.accuracy.changed' as const;
export interface AccuracyDeltaEvent {
  readonly tenantId: string;
  readonly labelId: string;
  readonly windowKey: AccuracyWindowKey;
  readonly before: {
    readonly precision: number | null;
    readonly recall: number | null;
    readonly f1: number | null;
    readonly sampleSize: number;
  };
  readonly after: {
    readonly precision: number | null;
    readonly recall: number | null;
    readonly f1: number | null;
    readonly sampleSize: number;
  };
  /** null if before OR after is in the 'learning' state (sampleSize < 20 per D-11) */
  readonly deltaF1: number | null;
  readonly triageSource?: AccuracyTriageSource;
  readonly at: string; // ISO
}
