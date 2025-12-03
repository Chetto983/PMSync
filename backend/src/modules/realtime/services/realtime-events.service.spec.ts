import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeGateway } from '../gateways/realtime.gateway';

describe('RealtimeEventsService', () => {
  let service: RealtimeEventsService;
  let mockGateway: jest.Mocked<Partial<RealtimeGateway>>;

  beforeEach(async () => {
    mockGateway = {
      server: {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any,
      hasTenantConnections: jest.fn().mockReturnValue(true),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: any) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeEventsService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RealtimeEventsService>(RealtimeEventsService);
    service.setGateway(mockGateway as any);
  });

  afterEach(() => {
    // Trigger cleanup to clear timers
    service.onModuleDestroy();
  });

  describe('setGateway', () => {
    it('should set the gateway reference', () => {
      expect(service.hasTenantConnections('tenant-123')).toBe(true);
      expect(mockGateway.hasTenantConnections).toHaveBeenCalledWith('tenant-123');
    });
  });

  describe('hasTenantConnections', () => {
    it('should return false when gateway not set', () => {
      const freshService = new RealtimeEventsService({
        get: jest.fn((key: string, defaultValue: any) => defaultValue),
      } as any);
      expect(freshService.hasTenantConnections('tenant-123')).toBe(false);
      freshService.onModuleDestroy();
    });

    it('should delegate to gateway', () => {
      mockGateway.hasTenantConnections!.mockReturnValue(false);
      expect(service.hasTenantConnections('inactive-tenant')).toBe(false);
    });
  });

  describe('emitSyncStatus', () => {
    it('should emit sync:status event with typed payload', () => {
      service.emitSyncStatus('tenant-123', {
        providerId: 'provider-123',
        status: 'completed',
        type: 'calendar',
        count: 42,
      });

      expect(mockGateway.server!.to).toHaveBeenCalledWith('tenant:tenant-123');
      expect(mockGateway.server!.emit).toHaveBeenCalledWith(
        'sync:status',
        expect.objectContaining({
          providerId: 'provider-123',
          status: 'completed',
          type: 'calendar',
          count: 42,
          timestamp: expect.any(String),
        }),
      );
    });

    it('should skip emit when tenant has no connections', () => {
      mockGateway.hasTenantConnections!.mockReturnValue(false);

      service.emitSyncStatus('inactive-tenant', {
        providerId: 'provider-123',
        status: 'started',
      });

      expect(mockGateway.server!.to).not.toHaveBeenCalled();
    });
  });

  describe('emitCalendarSyncComplete', () => {
    it('should emit sync:status with type calendar and count', () => {
      service.emitCalendarSyncComplete('tenant-123', {
        providerId: 'provider-123',
        count: 15,
      });

      expect(mockGateway.server!.emit).toHaveBeenCalledWith(
        'sync:status',
        expect.objectContaining({
          providerId: 'provider-123',
          status: 'completed',
          type: 'calendar',
          count: 15,
        }),
      );
    });
  });

  describe('emitContactSyncComplete', () => {
    it('should emit sync:status with type contacts and count', () => {
      service.emitContactSyncComplete('tenant-123', {
        providerId: 'provider-123',
        count: 100,
      });

      expect(mockGateway.server!.emit).toHaveBeenCalledWith(
        'sync:status',
        expect.objectContaining({
          providerId: 'provider-123',
          status: 'completed',
          type: 'contacts',
          count: 100,
        }),
      );
    });
  });

  describe('emitEmailNew', () => {
    it('should buffer email events and flush after timeout', async () => {
      // Emit event
      service.emitEmailNew('tenant-123', {
        providerId: 'provider-123',
        reason: 'message-processed',
        emailId: 'email-1',
      });

      // Not emitted immediately (buffered)
      expect(mockGateway.server!.emit).not.toHaveBeenCalled();

      // Wait for buffer flush (200ms default + buffer)
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Now should be emitted
      expect(mockGateway.server!.emit).toHaveBeenCalledWith(
        'email:new',
        expect.objectContaining({
          providerId: 'provider-123',
          reason: 'message-processed',
          emailId: 'email-1',
        }),
      );
    });
  });

  describe('AI Events', () => {
    it('should emit ai:action:created event', () => {
      const payload = {
        actionId: 'action-123',
        userId: 'user-123',
        agentName: 'EmailAgent',
        actionType: 'reply',
        status: 'pending' as const,
      };

      service.emitAiActionCreated('tenant-123', payload);

      expect(mockGateway.server!.emit).toHaveBeenCalledWith(
        'ai:action:created',
        expect.objectContaining(payload),
      );
    });

    it('should emit ai:session:update event', () => {
      const payload = {
        sessionId: 'session-123',
        userId: 'user-123',
        status: 'processing' as const,
        agentUsed: 'EmailAgent',
      };

      service.emitAiSessionUpdate('tenant-123', payload);

      expect(mockGateway.server!.emit).toHaveBeenCalledWith(
        'ai:session:update',
        expect.objectContaining(payload),
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all timers and buffers', () => {
      // Trigger some buffered events
      service.emitEmailNew('tenant-123', {
        providerId: 'provider-123',
        reason: 'message-processed',
      });

      // Cleanup
      service.onModuleDestroy();

      // Verify no errors when called again
      expect(() => service.onModuleDestroy()).not.toThrow();
    });

    it('should flush buffered events on shutdown when FLUSH_ON_SHUTDOWN is true', () => {
      // Buffer some email events (not flushed yet due to timer)
      service.emitEmailNew('tenant-123', {
        providerId: 'provider-123',
        reason: 'message-processed',
        emailId: 'email-1',
      });

      service.emitEmailNew('tenant-123', {
        providerId: 'provider-123',
        reason: 'message-processed',
        emailId: 'email-2',
      });

      // Events should NOT have been emitted yet (buffered)
      expect(mockGateway.server!.emit).not.toHaveBeenCalled();

      // Trigger shutdown - should flush buffered events
      service.onModuleDestroy();

      // Now events should have been emitted during shutdown flush
      expect(mockGateway.server!.emit).toHaveBeenCalled();
    });

    it('should NOT flush events when gateway is not available', () => {
      // Create service without gateway
      const freshService = new RealtimeEventsService({
        get: jest.fn((key: string, defaultValue: any) => defaultValue),
      } as any);

      // Buffer an event
      freshService.emitEmailNew('tenant-123', {
        providerId: 'provider-123',
        reason: 'message-processed',
      });

      // Should not throw even without gateway
      expect(() => freshService.onModuleDestroy()).not.toThrow();
    });
  });

  describe('notifyMailboxChange', () => {
    it('should emit email:new for message-processed', async () => {
      service.notifyMailboxChange('tenant-123', 'provider-123', 'message-processed', {
        emailId: 'email-1',
      });

      // Wait for buffer flush
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(mockGateway.server!.emit).toHaveBeenCalledWith(
        'email:new',
        expect.objectContaining({
          providerId: 'provider-123',
          reason: 'message-processed',
          emailId: 'email-1',
        }),
      );
    });

    it('should emit sync:status for sync-complete', () => {
      service.notifyMailboxChange('tenant-123', 'provider-123', 'sync-complete');

      expect(mockGateway.server!.emit).toHaveBeenCalledWith(
        'sync:status',
        expect.objectContaining({
          providerId: 'provider-123',
          status: 'completed',
        }),
      );
    });

    it('should suppress message events when option is set', () => {
      service.notifyMailboxChange(
        'tenant-123',
        'provider-123',
        'message-processed',
        { emailId: 'email-1' },
        { suppressMessageEvents: true },
      );

      expect(mockGateway.server!.emit).not.toHaveBeenCalled();
    });
  });
});
