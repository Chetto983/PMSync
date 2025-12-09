import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  CorrelationContextService,
  CorrelationContext,
  type CorrelationData as _CorrelationData,
} from './correlation-context.service';

describe('CorrelationContextService', () => {
  let service: CorrelationContextService;

  beforeEach(() => {
    service = new CorrelationContextService();
  });

  describe('runWithContext', () => {
    it('should provide correlation ID within context', () => {
      const result = service.runWithContext(
        { correlationId: 'test-123' },
        () => {
          return service.getCorrelationId();
        },
      );

      expect(result).toBe('test-123');
    });

    it('should generate correlation ID if not provided', () => {
      const result = service.runWithContext({}, () => {
        return service.getCorrelationId();
      });

      expect(result).toBeDefined();
      expect(result).not.toBe('no-context');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should provide full context data', () => {
      const result = service.runWithContext(
        {
          correlationId: 'corr-123',
          tenantId: 'tenant-456',
          userId: 'user-789',
          sessionId: 'session-abc',
        },
        () => {
          return service.getContext();
        },
      );

      expect(result?.correlationId).toBe('corr-123');
      expect(result?.tenantId).toBe('tenant-456');
      expect(result?.userId).toBe('user-789');
      expect(result?.sessionId).toBe('session-abc');
      expect(result?.createdAt).toBeDefined();
    });
  });

  describe('runWithContextAsync', () => {
    it('should provide correlation ID within async context', async () => {
      const result = await service.runWithContextAsync(
        { correlationId: 'async-123' },
        async () => {
          await Promise.resolve();
          return service.getCorrelationId();
        },
      );

      expect(result).toBe('async-123');
    });
  });

  describe('getLogContext', () => {
    it('should return log context with correlation ID', () => {
      const result = service.runWithContext(
        {
          correlationId: 'log-123',
          tenantId: 'tenant-456',
          userId: 'user-789',
        },
        () => {
          return service.getLogContext();
        },
      );

      expect(result.correlationId).toBe('log-123');
      expect(result.tenantId).toBe('tenant-456');
      expect(result.userId).toBe('user-789');
    });

    it('should return no-context when outside context', () => {
      const result = service.getLogContext();
      expect(result.correlationId).toBe('no-context');
    });
  });

  describe('formatLogMessage', () => {
    it('should format message with correlation ID', () => {
      const result = service.runWithContext(
        { correlationId: 'fmt-123' },
        () => {
          return service.formatLogMessage('Test message');
        },
      );

      expect(result).toBe('[fmt-123] Test message');
    });

    it('should format message with no-context when outside context', () => {
      const result = service.formatLogMessage('Test message');
      expect(result).toBe('[no-context] Test message');
    });
  });

  describe('individual getters', () => {
    it('should return tenant ID from context', () => {
      const result = service.runWithContext(
        { tenantId: 'tenant-123' },
        () => service.getTenantId(),
      );
      expect(result).toBe('tenant-123');
    });

    it('should return user ID from context', () => {
      const result = service.runWithContext(
        { userId: 'user-123' },
        () => service.getUserId(),
      );
      expect(result).toBe('user-123');
    });

    it('should return session ID from context', () => {
      const result = service.runWithContext(
        { sessionId: 'session-123' },
        () => service.getSessionId(),
      );
      expect(result).toBe('session-123');
    });
  });
});

describe('CorrelationContext (static helper)', () => {
  describe('getCorrelationId', () => {
    it('should return no-context when outside context', () => {
      expect(CorrelationContext.getCorrelationId()).toBe('no-context');
    });

    it('should return correlation ID within context', () => {
      const result = CorrelationContext.run(
        { correlationId: 'static-123' },
        () => CorrelationContext.getCorrelationId(),
      );
      expect(result).toBe('static-123');
    });
  });

  describe('run', () => {
    it('should execute function within context', () => {
      const result = CorrelationContext.run(
        { correlationId: 'run-123', tenantId: 'tenant-456' },
        () => {
          return {
            corrId: CorrelationContext.getCorrelationId(),
            context: CorrelationContext.getContext(),
          };
        },
      );

      expect(result.corrId).toBe('run-123');
      expect(result.context?.tenantId).toBe('tenant-456');
    });
  });

  describe('formatLog', () => {
    it('should format log message with correlation ID', () => {
      const result = CorrelationContext.run(
        { correlationId: 'format-123' },
        () => CorrelationContext.formatLog('Test log'),
      );
      expect(result).toBe('[format-123] Test log');
    });
  });

  describe('getLogContext', () => {
    it('should return structured log context', () => {
      const result = CorrelationContext.run(
        {
          correlationId: 'ctx-123',
          tenantId: 'tenant-456',
          userId: 'user-789',
          sessionId: 'session-abc',
        },
        () => CorrelationContext.getLogContext(),
      );

      expect(result.correlationId).toBe('ctx-123');
      expect(result.tenantId).toBe('tenant-456');
      expect(result.userId).toBe('user-789');
      expect(result.sessionId).toBe('session-abc');
    });
  });

  describe('nested contexts', () => {
    it('should maintain correct context in nested runs', () => {
      const outerResult = CorrelationContext.run(
        { correlationId: 'outer-123' },
        () => {
          const outerId = CorrelationContext.getCorrelationId();

          const innerResult = CorrelationContext.run(
            { correlationId: 'inner-456' },
            () => CorrelationContext.getCorrelationId(),
          );

          return { outerId, innerResult };
        },
      );

      expect(outerResult.outerId).toBe('outer-123');
      expect(outerResult.innerResult).toBe('inner-456');
    });
  });
});
