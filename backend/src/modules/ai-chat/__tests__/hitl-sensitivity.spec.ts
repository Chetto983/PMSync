function makeHighRiskApproval(sensitivity: string): () => boolean {
  return () => sensitivity !== 'NONE';
}

function makeMediumRiskApproval(sensitivity: string): () => boolean {
  return () => sensitivity === 'ALL_MUTATIONS';
}

describe('HITL Sensitivity (HITL-03)', () => {
  describe('HIGH_ONLY sensitivity', () => {
    const sensitivity = 'HIGH_ONLY';

    it('requires approval for HIGH-risk tools', () => {
      expect(makeHighRiskApproval(sensitivity)()).toBe(true);
    });

    it('does not require approval for MEDIUM-risk mutation tools', () => {
      expect(makeMediumRiskApproval(sensitivity)()).toBe(false);
    });
  });

  describe('ALL_MUTATIONS sensitivity', () => {
    const sensitivity = 'ALL_MUTATIONS';

    it('requires approval for HIGH-risk tools', () => {
      expect(makeHighRiskApproval(sensitivity)()).toBe(true);
    });

    it('requires approval for MEDIUM-risk mutation tools', () => {
      expect(makeMediumRiskApproval(sensitivity)()).toBe(true);
    });
  });

  describe('NONE sensitivity', () => {
    const sensitivity = 'NONE';

    it('does not require approval for HIGH-risk tools', () => {
      expect(makeHighRiskApproval(sensitivity)()).toBe(false);
    });

    it('does not require approval for MEDIUM-risk mutation tools', () => {
      expect(makeMediumRiskApproval(sensitivity)()).toBe(false);
    });
  });
});
