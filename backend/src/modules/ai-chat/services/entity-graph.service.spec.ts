import { EntityGraphService } from './entity-graph.service';

describe('EntityGraphService', () => {
  let service: EntityGraphService;
  let prisma: {
    $queryRaw: jest.Mock;
    graphNode: { findMany: jest.Mock };
  };
  let mistralEmbeddingService: { generateEmbedding: jest.Mock };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      graphNode: { findMany: jest.fn().mockResolvedValue([]) },
    };
    mistralEmbeddingService = {
      generateEmbedding: jest.fn().mockResolvedValue(new Array(1024).fill(0)),
    };

    service = new EntityGraphService(prisma as any, mistralEmbeddingService as any);
  });

  describe('traverse()', () => {
    it('should return empty array when seedNodeIds is empty', async () => {
      const result = await service.traverse('tenant1', []);
      expect(result).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('should call $queryRaw with recursive CTE SQL', async () => {
      const mockResults = [
        {
          nodeId: 'node1',
          nodeType: 'contact',
          label: 'John Doe',
          metadata: {},
          hop: 0,
          score: 1.0,
          edgeType: null,
        },
      ];
      prisma.$queryRaw.mockResolvedValue(mockResults);

      const result = await service.traverse('tenant1', ['seed1']);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      // Verify the SQL template contains WITH RECURSIVE
      const sqlCall = prisma.$queryRaw.mock.calls[0][0];
      const sqlString =
        typeof sqlCall === 'object' && sqlCall.strings
          ? sqlCall.strings.join('')
          : String(sqlCall);
      expect(sqlString).toContain('WITH RECURSIVE');
      expect(result).toEqual(mockResults);
    });

    it('should include cycle detection in the CTE query', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.traverse('tenant1', ['seed1']);

      const sqlCall = prisma.$queryRaw.mock.calls[0][0];
      const sqlString =
        typeof sqlCall === 'object' && sqlCall.strings
          ? sqlCall.strings.join('')
          : String(sqlCall);
      // The SQL should contain cycle detection via path array
      expect(sqlString).toContain('path');
      expect(sqlString).toContain('ANY');
    });

    it('should clamp maxHops to maximum of 3', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      // Request 10 hops -- should be clamped to 3
      await service.traverse('tenant1', ['seed1'], { maxHops: 10 });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const sqlCall = prisma.$queryRaw.mock.calls[0][0];
      const values = sqlCall.values || [];
      // The maxHops parameter should be 3, not 10
      const hasThree = values.some((v: unknown) => v === 3);
      expect(hasThree).toBe(true);
    });

    it('should respect limit parameter', async () => {
      // Create 10 mock results
      const mockResults = Array.from({ length: 10 }, (_, i) => ({
        nodeId: `node${i}`,
        nodeType: 'contact',
        label: `Node ${i}`,
        metadata: {},
        hop: 0,
        score: 1.0 - i * 0.1,
        edgeType: null,
      }));
      prisma.$queryRaw.mockResolvedValue(mockResults);

      const result = await service.traverse('tenant1', ['seed1'], {
        limit: 5,
      });

      // Should return at most 5 results
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should return results with score decaying by hop distance', async () => {
      const mockResults = [
        {
          nodeId: 'seed1',
          nodeType: 'contact',
          label: 'Seed',
          metadata: {},
          hop: 0,
          score: 1.0,
          edgeType: null,
        },
        {
          nodeId: 'hop1',
          nodeType: 'email',
          label: 'Hop1',
          metadata: {},
          hop: 1,
          score: 0.7,
          edgeType: 'sent',
        },
      ];
      prisma.$queryRaw.mockResolvedValue(mockResults);

      const result = await service.traverse('tenant1', ['seed1']);

      // Hop 0 should have highest score
      expect(result[0].score).toBe(1.0);
      // Hop 1 should have decayed score
      expect(result[1].score).toBeLessThan(1.0);
    });

    it('should contain decay factor 0.7 in the SQL', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await service.traverse('tenant1', ['seed1']);

      const sqlCall = prisma.$queryRaw.mock.calls[0][0];
      const sqlString =
        typeof sqlCall === 'object' && sqlCall.strings
          ? sqlCall.strings.join('')
          : String(sqlCall);
      expect(sqlString).toContain('0.7');
    });
  });

  describe('findSeedNodes()', () => {
    it('should resolve query string into GraphNode IDs via label text search', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'node1' }, { id: 'node2' }]);

      const result = await service.findSeedNodes('tenant1', 'John');

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['node1', 'node2']);

      // Verify the SQL uses similarity search
      const sqlCall = prisma.$queryRaw.mock.calls[0][0];
      const sqlString =
        typeof sqlCall === 'object' && sqlCall.strings
          ? sqlCall.strings.join('')
          : String(sqlCall);
      expect(sqlString).toContain('similarity');
    });

    it('should return empty array on error', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('DB error'));

      const result = await service.findSeedNodes('tenant1', 'John');

      expect(result).toEqual([]);
    });
  });

  describe('getNodesByExternalId()', () => {
    it('should return nodes mapped to GraphTraversalResult with hop=0 and score=1.0', async () => {
      prisma.graphNode.findMany.mockResolvedValue([
        {
          id: 'node1',
          nodeType: 'contact',
          label: 'John Doe',
          metadata: { company: 'Acme' },
          externalId: 'ext1',
        },
      ]);

      const result = await service.getNodesByExternalId('tenant1', ['ext1']);

      expect(prisma.graphNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant1',
            externalId: { in: ['ext1'] },
          },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        nodeId: 'node1',
        nodeType: 'contact',
        label: 'John Doe',
        hop: 0,
        score: 1.0,
      });
    });

    it('should filter by nodeType when provided', async () => {
      prisma.graphNode.findMany.mockResolvedValue([]);

      await service.getNodesByExternalId('tenant1', ['ext1'], 'contact');

      expect(prisma.graphNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant1',
            externalId: { in: ['ext1'] },
            nodeType: 'contact',
          },
        }),
      );
    });
  });
});
