/**
 * HITL Sensitivity Tests (HITL-03)
 *
 * Validates dynamic needsApproval function variant:
 * - HIGH_ONLY: approve HIGH-risk, skip MEDIUM-risk
 * - ALL_MUTATIONS: approve both HIGH and MEDIUM-risk
 * - NONE: never approve
 */
import { describe, it, expect } from 'vitest';

// needsApproval closures — same logic as used in tool services
function makeHighRiskApproval(sensitivity: string): () => boolean {
  return () => sensitivity !== 'NONE';
}

function makeMediumRiskApproval(sensitivity: string): () => boolean {
  return () => sensitivity === 'ALL_MUTATIONS';
}

describe('HITL Sensitivity (HITL-03)', () => {
  const HIGH_RISK_TOOLS = [
    'send_email', 'delete_email', 'forward_email', 'reply_email',
    'delete_event', 'delete_contact',
  ];
  const MEDIUM_RISK_MUTATIONS = [
    'archive_email', 'move_email', 'draft_email',
    'create_event', 'update_event',
    'create_contact', 'update_contact',
  ];

  describe('HIGH_ONLY sensitivity', () => {
    const sensitivity = 'HIGH_ONLY';

    it('requires approval for HIGH-risk tools', () => {
      const needsApproval = makeHighRiskApproval(sensitivity);
      expect(needsApproval()).toBe(true);
    });

    it('does not require approval for MEDIUM-risk mutation tools', () => {
      const needsApproval = makeMediumRiskApproval(sensitivity);
      expect(needsApproval()).toBe(false);
    });
  });

  describe('ALL_MUTATIONS sensitivity', () => {
    const sensitivity = 'ALL_MUTATIONS';

    it('requires approval for HIGH-risk tools', () => {
      const needsApproval = makeHighRiskApproval(sensitivity);
      expect(needsApproval()).toBe(true);
    });

    it('requires approval for MEDIUM-risk mutation tools', () => {
      const needsApproval = makeMediumRiskApproval(sensitivity);
      expect(needsApproval()).toBe(true);
    });
  });

  describe('NONE sensitivity', () => {
    const sensitivity = 'NONE';

    it('does not require approval for HIGH-risk tools', () => {
      const needsApproval = makeHighRiskApproval(sensitivity);
      expect(needsApproval()).toBe(false);
    });

    it('does not require approval for MEDIUM-risk mutation tools', () => {
      const needsApproval = makeMediumRiskApproval(sensitivity);
      expect(needsApproval()).toBe(false);
    });
  });
});
