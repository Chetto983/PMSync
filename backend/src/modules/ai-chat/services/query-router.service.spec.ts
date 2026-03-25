import { QueryRouterService } from './query-router.service';

describe('QueryRouterService', () => {
  let service: QueryRouterService;

  beforeEach(() => {
    service = new QueryRouterService();
  });

  describe('classify - basic tiers', () => {
    it('should classify greetings as simple', () => {
      const result = service.classify('hello');
      expect(result.complexity).toBe('simple');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should classify email search as search', () => {
      const result = service.classify('search for emails about budget');
      expect(result.complexity).toBe('search');
    });

    it('should classify relationship queries as multi_hop', () => {
      const result = service.classify('people I met at the conference');
      expect(result.complexity).toBe('multi_hop');
    });
  });

  describe('classify - multi_hop sub-classification', () => {
    it('should sub-classify "What did Marco say about the project?" as relationship', () => {
      const result = service.classify('What did Marco say about the project?');
      expect(result.complexity).toBe('multi_hop');
      expect(result.multiHopSubType).toBe('relationship');
    });

    it('should sub-classify "Find emails from people I met at the conference" as temporal_entity', () => {
      const result = service.classify('Find emails from people I met at the conference');
      expect(result.complexity).toBe('multi_hop');
      expect(result.multiHopSubType).toBe('temporal_entity');
    });

    it('should sub-classify "What do I know about Acme Corp\'s payment terms?" as memory', () => {
      const result = service.classify("What do I know about Acme Corp's payment terms?");
      expect(result.complexity).toBe('multi_hop');
      expect(result.multiHopSubType).toBe('memory');
    });

    it('should sub-classify "Who should I follow up with this week?" as cross_domain', () => {
      const result = service.classify('Who should I follow up with this week?');
      expect(result.complexity).toBe('multi_hop');
      expect(result.multiHopSubType).toBe('cross_domain');
    });

    it('should not set multiHopSubType for simple queries', () => {
      const result = service.classify('hello there');
      expect(result.complexity).toBe('simple');
      expect(result.multiHopSubType).toBeUndefined();
    });

    it('should not set multiHopSubType for search queries', () => {
      const result = service.classify('search for emails about budget');
      expect(result.complexity).toBe('search');
      expect(result.multiHopSubType).toBeUndefined();
    });

    it('should sub-classify Italian relationship query correctly', () => {
      const result = service.classify('storico con Marco riguardo il progetto');
      expect(result.complexity).toBe('multi_hop');
      expect(result.multiHopSubType).toBe('relationship');
    });
  });

  describe('getExcludedDomains', () => {
    it('should exclude domains for simple queries', () => {
      const excluded = service.getExcludedDomains('simple');
      expect(excluded).toContain('knowledge');
    });

    it('should not exclude domains for multi_hop queries', () => {
      const excluded = service.getExcludedDomains('multi_hop');
      expect(excluded).toEqual([]);
    });
  });
});
