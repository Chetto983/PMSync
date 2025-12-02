import { Test, TestingModule } from '@nestjs/testing';
import { ModelRouterService } from './model-router.service';

describe('ModelRouterService', () => {
  let service: ModelRouterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ModelRouterService],
    }).compile();

    service = module.get<ModelRouterService>(ModelRouterService);
  });

  afterEach(() => {
    service.resetStats();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('routeMessage', () => {
    describe('simple queries', () => {
      it('should route greetings to small model', () => {
        const result = service.routeMessage('Hello');

        expect(result.complexity).toBe('simple');
        expect(result.recommendedModel).toBe('small');
        expect(result.confidence).toBeGreaterThan(0.7);
      });

      it('should route simple questions to small model', () => {
        const result = service.routeMessage('What is my email address?');

        expect(result.complexity).toBe('simple');
        expect(result.recommendedModel).toBe('small');
      });

      it('should route "check calendar" to small model', () => {
        const result = service.routeMessage('Check my calendar');

        expect(result.complexity).toBe('simple');
        expect(result.recommendedModel).toBe('small');
      });

      it('should route "unread emails" to small model', () => {
        const result = service.routeMessage('Show me unread emails');

        expect(result.complexity).toBe('simple');
        expect(result.recommendedModel).toBe('small');
      });

      it('should route "how many" questions to small model', () => {
        const result = service.routeMessage('How many emails do I have?');

        expect(result.complexity).toBe('simple');
        expect(result.recommendedModel).toBe('small');
      });
    });

    describe('moderate queries', () => {
      it('should route analysis requests to medium model', () => {
        const result = service.routeMessage('Analyze the sentiment of this email');

        expect(result.complexity).toBe('moderate');
        expect(result.recommendedModel).toBe('medium');
      });

      it('should route drafting requests to medium model', () => {
        const result = service.routeMessage('Draft a reply to John');

        expect(result.complexity).toBe('moderate');
        expect(result.recommendedModel).toBe('medium');
      });

      it('should route comparison requests to medium model', () => {
        const result = service.routeMessage('Compare these two proposals');

        expect(result.complexity).toBe('moderate');
        expect(result.recommendedModel).toBe('medium');
      });

      it('should route scheduling requests to medium model', () => {
        const result = service.routeMessage('Schedule a meeting with Sarah');

        expect(result.complexity).toBe('moderate');
        expect(result.recommendedModel).toBe('medium');
      });
    });

    describe('complex queries', () => {
      it('should route detailed requests to large model', () => {
        const result = service.routeMessage(
          'Create a detailed report on all client communications this month',
        );

        expect(result.complexity).toBe('complex');
        expect(result.recommendedModel).toBe('large');
      });

      it('should route step-by-step requests to large model', () => {
        const result = service.routeMessage(
          'Give me a step-by-step plan for the project rollout',
        );

        expect(result.complexity).toBe('complex');
        expect(result.recommendedModel).toBe('large');
      });

      it('should route implementation requests to large model', () => {
        const result = service.routeMessage('Implement a new email filter workflow');

        expect(result.complexity).toBe('complex');
        expect(result.recommendedModel).toBe('large');
      });

      it('should route planning requests to large model', () => {
        const result = service.routeMessage('Plan my week based on all pending emails');

        expect(result.complexity).toBe('complex');
        expect(result.recommendedModel).toBe('large');
      });
    });

    describe('preference modifiers', () => {
      it('should downgrade model when preferSpeed is true', () => {
        const result = service.routeMessage(
          'Create a detailed analysis of quarterly reports',
          { preferSpeed: true },
        );

        // Complex task but preferSpeed should use medium instead of large
        expect(result.recommendedModel).toBe('medium');
      });

      it('should upgrade model when preferQuality is true', () => {
        const result = service.routeMessage('Hello, how are you?', {
          preferQuality: true,
        });

        // Simple greeting but preferQuality should use medium instead of small
        expect(result.recommendedModel).toBe('medium');
      });

      it('should honor forceModel override', () => {
        const result = service.routeMessage('Complex multi-step planning task', {
          forceModel: 'small',
        });

        expect(result.recommendedModel).toBe('small');
        expect(result.confidence).toBe(1.0);
        expect(result.reasoning).toContain('explicitly specified');
      });
    });

    describe('token estimation', () => {
      it('should estimate tokens for short messages', () => {
        const result = service.routeMessage('Hello');

        expect(result.estimatedTokens).toBeGreaterThan(0);
        expect(result.estimatedTokens).toBeLessThan(10);
      });

      it('should estimate tokens for longer messages', () => {
        const longMessage = 'This is a much longer message that contains many more words and should result in a higher token estimate because it has more content to process.';
        const result = service.routeMessage(longMessage);

        expect(result.estimatedTokens).toBeGreaterThan(20);
      });
    });
  });

  describe('routeForTools', () => {
    it('should route simple tools to small model', () => {
      const result = service.routeForTools(['get_unread_emails', 'mark_read']);

      expect(result.complexity).toBe('simple');
      expect(result.recommendedModel).toBe('small');
    });

    it('should route moderate tools to medium model', () => {
      const result = service.routeForTools(['summarize_email', 'compose_reply']);

      expect(result.complexity).toBe('moderate');
      expect(result.recommendedModel).toBe('medium');
    });

    it('should route complex tools to large model', () => {
      const result = service.routeForTools(['analyze_email', 'calculate_priority']);

      expect(result.complexity).toBe('complex');
      expect(result.recommendedModel).toBe('large');
    });

    it('should upgrade complexity for many tools', () => {
      const result = service.routeForTools([
        'get_unread_emails',
        'mark_read',
        'star',
      ]);

      // 3 simple tools should upgrade to moderate
      expect(result.complexity).toBe('moderate');
    });
  });

  describe('getStats', () => {
    it('should track routing statistics', () => {
      service.routeMessage('Hello');
      service.routeMessage('Analyze this email');
      service.routeMessage('Create detailed plan');

      const stats = service.getStats();

      expect(stats.totalRequests).toBe(3);
      expect(stats.byModel.small).toBe(1);
      expect(stats.byModel.medium).toBe(1);
      expect(stats.byModel.large).toBe(1);
    });

    it('should calculate estimated savings', () => {
      // Route multiple simple queries that would otherwise use large model
      for (let i = 0; i < 10; i++) {
        service.routeMessage('What are my unread emails?');
      }

      const stats = service.getStats();

      expect(stats.estimatedSavings).toBeGreaterThanOrEqual(0);
    });
  });

  describe('recordLatency', () => {
    it('should track latency for model accuracy', () => {
      service.routeMessage('Hello');
      service.recordLatency('small', 150);

      service.routeMessage('Analyze email');
      service.recordLatency('medium', 450);

      const stats = service.getStats();

      expect(stats.avgResponseTime.small).toBe(150);
      expect(stats.avgResponseTime.medium).toBe(450);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', () => {
      service.routeMessage('Hello');
      service.routeMessage('Analyze this');

      service.resetStats();

      const stats = service.getStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.byModel.small).toBe(0);
      expect(stats.byModel.medium).toBe(0);
      expect(stats.byModel.large).toBe(0);
    });
  });
});
