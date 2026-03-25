import { ContextAssemblyService } from './context-assembly.service';
import type { GraphTraversalResult } from './entity-graph.service';
import type { MemoryResult } from './memory.service';

describe('ContextAssemblyService', () => {
  let service: ContextAssemblyService;

  beforeEach(() => {
    service = new ContextAssemblyService();
  });

  // ── Helpers ──────────────────────────────────────────────

  function makeGraphNode(
    overrides: Partial<GraphTraversalResult> = {},
  ): GraphTraversalResult {
    return {
      nodeId: 'n1',
      nodeType: 'email',
      label: 'Test Email',
      metadata: {
        subject: 'Meeting tomorrow',
        from: 'alice@example.com',
        receivedAt: '2026-03-20',
        snippet: 'Let us discuss the project timeline for Q2 deliverables.',
      },
      hop: 0,
      score: 1.0,
      edgeType: 'sent',
      ...overrides,
    };
  }

  function makeMemory(
    overrides: Partial<MemoryResult> = {},
  ): MemoryResult {
    return {
      content: 'User prefers morning meetings',
      category: 'preference',
      createdAt: new Date('2026-03-15'),
      ...overrides,
    };
  }

  // ── Tests ────────────────────────────────────────────────

  describe('assemble()', () => {
    it('should return empty strings with 0 token counts for empty inputs', () => {
      const result = service.assemble([], [], []);

      expect(result.graphContext).toBe('');
      expect(result.memoryContext).toBe('');
      expect(result.fewShotContext).toBe('');
      expect(result.rawTokenCount).toBe(0);
      expect(result.assembledTokenCount).toBe(0);
    });

    it('should fill graph context up to 60% of token budget', () => {
      // Create many graph nodes to exceed the 60% budget
      const nodes: GraphTraversalResult[] = [];
      for (let i = 0; i < 100; i++) {
        nodes.push(
          makeGraphNode({
            nodeId: `node-${i}`,
            score: 1.0 - i * 0.01,
            metadata: {
              subject: `Email subject number ${i} with some extra text to fill tokens`,
              from: `sender${i}@example.com`,
              receivedAt: '2026-03-20',
              snippet:
                'This is a longer snippet to ensure we consume tokens properly for the test.',
            },
          }),
        );
      }

      const result = service.assemble(nodes, [], [], { tokenBudget: 4096 });

      // Graph context should not exceed 60% of 4096 = 2457 tokens
      const graphTokens = service.countTokens(result.graphContext);
      expect(graphTokens).toBeLessThanOrEqual(2560); // ~60% of 4096 + header overhead
      expect(graphTokens).toBeGreaterThan(0);
      // Not all 100 nodes should fit
      expect(result.graphContext.split('\n').length).toBeLessThan(100);
    });

    it('should fill memory context up to 20% of token budget', () => {
      const memories: MemoryResult[] = [];
      for (let i = 0; i < 50; i++) {
        memories.push(
          makeMemory({
            content: `Memory item ${i}: The user has a long preference about something that takes many tokens to describe in detail`,
          }),
        );
      }

      const result = service.assemble([], memories, [], { tokenBudget: 4096 });

      const memoryTokens = service.countTokens(result.memoryContext);
      expect(memoryTokens).toBeLessThanOrEqual(820); // 20% of 4096
      expect(memoryTokens).toBeGreaterThan(0);
      expect(result.memoryContext.split('\n').length).toBeLessThan(50);
    });

    it('should return both rawTokenCount and assembledTokenCount, with assembled < raw', () => {
      const nodes = [
        makeGraphNode({
          metadata: {
            subject: 'Important meeting',
            from: 'alice@example.com',
            receivedAt: '2026-03-20',
            snippet: 'Let us discuss the project timeline.',
            extraField: 'This is extra data that raw JSON includes but structured does not',
            anotherField: { nested: true, values: [1, 2, 3, 4, 5] },
          },
        }),
      ];
      const memories = [makeMemory()];

      const result = service.assemble(nodes, memories, []);

      expect(result.rawTokenCount).toBeGreaterThan(0);
      expect(result.assembledTokenCount).toBeGreaterThan(0);
      // Structured assembly should use fewer tokens than raw JSON
      expect(result.assembledTokenCount).toBeLessThan(result.rawTokenCount);
    });

    it('should sort graph results by score descending before filling budget', () => {
      const nodes = [
        makeGraphNode({
          nodeId: 'low',
          score: 0.3,
          nodeType: 'contact',
          label: 'Low Score Contact',
          metadata: { company: 'Low Co' },
        }),
        makeGraphNode({
          nodeId: 'high',
          score: 0.9,
          nodeType: 'contact',
          label: 'High Score Contact',
          metadata: { company: 'High Co' },
        }),
        makeGraphNode({
          nodeId: 'mid',
          score: 0.6,
          nodeType: 'contact',
          label: 'Mid Score Contact',
          metadata: { company: 'Mid Co' },
        }),
      ];

      const result = service.assemble(nodes, [], []);
      const lines = result.graphContext.split('\n').filter(l => l.trim() && !l.startsWith('#'));

      // First data line should be from the highest-scored node
      expect(lines[0]).toContain('High Score Contact');
      // Last data line should be from the lowest-scored node
      expect(lines[lines.length - 1]).toContain('Low Score Contact');
    });

    it('should handle few-shot examples within budget', () => {
      const examples = [
        'Example 1: User asks about contacts and I search the graph.',
        'Example 2: User asks about meetings and I look up calendar events.',
      ];

      const result = service.assemble([], [], examples);

      expect(result.fewShotContext).toContain('Example 1');
      expect(result.fewShotContext).toContain('Example 2');
      expect(result.assembledTokenCount).toBeGreaterThan(0);
    });
  });

  describe('assembleNodeContext()', () => {
    it('should format email nodes with subject, from, date, snippet', () => {
      const node = makeGraphNode({
        nodeType: 'email',
        hop: 1,
        edgeType: 'sent',
      });

      const line = service.assembleNodeContext(node);

      expect(line).toContain('[Email, hop 1, via sent]');
      expect(line).toContain('Subject: Meeting tomorrow');
      expect(line).toContain('From: alice@example.com');
      expect(line).toContain('Date: 2026-03-20');
      expect(line).toContain('Snippet:');
    });

    it('should format contact nodes with name, company, job title, score', () => {
      const node = makeGraphNode({
        nodeType: 'contact',
        label: 'John Doe',
        hop: 1,
        metadata: {
          company: 'Acme Corp',
          jobTitle: 'CTO',
          relationshipScore: 85,
        },
      });

      const line = service.assembleNodeContext(node);

      expect(line).toContain('[Contact, hop 1]');
      expect(line).toContain('John Doe');
      expect(line).toContain('Acme Corp');
      expect(line).toContain('CTO');
      expect(line).toContain('Score: 85');
    });

    it('should format thread nodes', () => {
      const node = makeGraphNode({
        nodeType: 'thread',
        label: 'Re: Project Update',
        hop: 2,
        metadata: { messageCount: 5 },
      });

      const line = service.assembleNodeContext(node);

      expect(line).toContain('[Thread, hop 2]');
      expect(line).toContain('Re: Project Update');
      expect(line).toContain('5 messages');
    });

    it('should format calendar_event nodes', () => {
      const node = makeGraphNode({
        nodeType: 'calendar_event',
        label: 'Team Standup',
        hop: 1,
        metadata: {
          startTime: '2026-03-21T09:00:00Z',
          location: 'Room 42',
        },
      });

      const line = service.assembleNodeContext(node);

      expect(line).toContain('[Event, hop 1]');
      expect(line).toContain('Team Standup');
      expect(line).toContain('2026-03-21T09:00:00Z');
      expect(line).toContain('Room 42');
    });

    it('should format topic nodes', () => {
      const node = makeGraphNode({
        nodeType: 'topic',
        label: 'Q2 Roadmap',
        hop: 2,
      });

      const line = service.assembleNodeContext(node);

      expect(line).toContain('[Topic, hop 2]');
      expect(line).toContain('Q2 Roadmap');
    });

    it('should format memory nodes', () => {
      const node = makeGraphNode({
        nodeType: 'memory',
        label: 'User prefers Slack over email',
        metadata: { category: 'communication' },
      });

      const line = service.assembleNodeContext(node);

      expect(line).toContain('[Memory]');
      expect(line).toContain('User prefers Slack over email');
      expect(line).toContain('communication');
    });

    it('should truncate email snippets to 100 characters', () => {
      const longSnippet = 'A'.repeat(200);
      const node = makeGraphNode({
        metadata: {
          subject: 'Test',
          from: 'test@test.com',
          receivedAt: '2026-03-20',
          snippet: longSnippet,
        },
      });

      const line = service.assembleNodeContext(node);

      // The snippet in the output should be truncated
      const snippetMatch = line.match(/Snippet: (.*)/);
      expect(snippetMatch).not.toBeNull();
      expect(snippetMatch![1].length).toBeLessThanOrEqual(100);
    });
  });

  describe('countTokens()', () => {
    it('should return 0 for empty string', () => {
      expect(service.countTokens('')).toBe(0);
    });

    it('should return positive count for non-empty text', () => {
      expect(service.countTokens('Hello world')).toBeGreaterThan(0);
    });
  });
});
