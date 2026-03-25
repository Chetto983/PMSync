import { FEW_SHOT_EXAMPLES, selectFewShotExamples } from './few-shot-examples';
import type { QueryClassification } from '../services/query-router.service';

describe('FewShotExamples', () => {
  describe('FEW_SHOT_EXAMPLES constant', () => {
    it('should have exactly 4 entries', () => {
      expect(FEW_SHOT_EXAMPLES).toHaveLength(4);
    });

    it('should have unique subTypes across all entries', () => {
      const subTypes = FEW_SHOT_EXAMPLES.map((ex) => ex.subType);
      expect(new Set(subTypes).size).toBe(subTypes.length);
    });

    it('should have pre-measured tokenCount > 0 for all entries', () => {
      for (const ex of FEW_SHOT_EXAMPLES) {
        expect(ex.tokenCount).toBeGreaterThan(0);
      }
    });
  });

  describe('selectFewShotExamples', () => {
    it('should return empty array for simple complexity', () => {
      const classification: QueryClassification = {
        complexity: 'simple',
        confidence: 0.95,
        signals: ['simple:greeting'],
      };
      expect(selectFewShotExamples(classification)).toEqual([]);
    });

    it('should return exactly 1 example for search complexity', () => {
      const classification: QueryClassification = {
        complexity: 'search',
        confidence: 0.8,
        signals: ['search:email'],
      };
      const result = selectFewShotExamples(classification);
      expect(result).toHaveLength(1);
      expect(typeof result[0]).toBe('string');
    });

    it('should return 2-3 examples for multi_hop + relationship subType, first matching relationship', () => {
      const classification: QueryClassification = {
        complexity: 'multi_hop',
        confidence: 0.85,
        signals: ['multi_hop:relationship'],
        multiHopSubType: 'relationship',
      };
      const result = selectFewShotExamples(classification);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.length).toBeLessThanOrEqual(3);
      // First example should be the relationship one
      const relationshipExample = FEW_SHOT_EXAMPLES.find((ex) => ex.subType === 'relationship');
      expect(result[0]).toBe(relationshipExample!.example);
    });

    it('should return 2-3 examples for multi_hop + cross_domain subType, first matching cross_domain', () => {
      const classification: QueryClassification = {
        complexity: 'multi_hop',
        confidence: 0.85,
        signals: ['multi_hop:cross_domain'],
        multiHopSubType: 'cross_domain',
      };
      const result = selectFewShotExamples(classification);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.length).toBeLessThanOrEqual(3);
      const crossDomainExample = FEW_SHOT_EXAMPLES.find((ex) => ex.subType === 'cross_domain');
      expect(result[0]).toBe(crossDomainExample!.example);
    });

    it('should handle multi_hop with general subType (no matching example)', () => {
      const classification: QueryClassification = {
        complexity: 'multi_hop',
        confidence: 0.75,
        signals: ['multi_hop:general'],
        multiHopSubType: 'general',
      };
      const result = selectFewShotExamples(classification);
      // No 'general' subType in examples, so all come from others
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });
});
