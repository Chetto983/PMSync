import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEventsService } from '../services/realtime-events.service';
import { RealtimeHandshakeService } from '../services/realtime-handshake.service';
import { AuthenticatedSocket } from '../types/realtime.types';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let mockHandshakeService: jest.Mocked<Partial<RealtimeHandshakeService>>;
  let mockEventsService: jest.Mocked<Partial<RealtimeEventsService>>;

  beforeEach(async () => {
    mockHandshakeService = {
      authenticate: jest.fn(),
    };

    mockEventsService = {
      setGateway: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: RealtimeHandshakeService, useValue: mockHandshakeService },
        { provide: RealtimeEventsService, useValue: mockEventsService },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);
  });

  afterEach(() => {
    gateway.onModuleDestroy();
  });

  describe('handleJoinRoom', () => {
    const createMockClient = (tenantId?: string): AuthenticatedSocket =>
      ({
        id: 'socket-123',
        tenantId,
        join: jest.fn().mockResolvedValue(undefined),
      }) as unknown as AuthenticatedSocket;

    it('should reject unauthenticated client', async () => {
      const client = createMockClient(undefined);
      const result = await gateway.handleJoinRoom({ room: 'test-room' }, client);
      expect(result).toEqual({
        event: 'error',
        data: { message: 'unauthenticated' },
      });
    });

    it('should reject empty room name', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleJoinRoom({ room: '' }, client);
      expect(result).toEqual({
        event: 'error',
        data: { message: 'room name cannot be empty' },
      });
    });

    it('should reject whitespace-only room name', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleJoinRoom({ room: '   ' }, client);
      expect(result).toEqual({
        event: 'error',
        data: { message: 'room name cannot be empty' },
      });
    });

    it('should reject room name exceeding max length', async () => {
      const client = createMockClient('tenant-123');
      const longRoom = 'a'.repeat(101);
      const result = await gateway.handleJoinRoom({ room: longRoom }, client);
      expect(result).toEqual({
        event: 'error',
        data: { message: 'room name exceeds maximum length of 100' },
      });
    });

    it('should reject room name with invalid characters', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleJoinRoom(
        { room: 'test room!' },
        client,
      );
      expect(result).toEqual({
        event: 'error',
        data: {
          message:
            'room name contains invalid characters (allowed: alphanumeric, underscore, hyphen, colon, dot)',
        },
      });
    });

    it('should reject non-string room', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleJoinRoom(
        { room: 123 as any },
        client,
      );
      expect(result).toEqual({
        event: 'error',
        data: { message: 'room must be a string' },
      });
    });

    it('should reject null room', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleJoinRoom(
        { room: null as any },
        client,
      );
      expect(result).toEqual({
        event: 'error',
        data: { message: 'room must be a string' },
      });
    });

    it('should accept valid room name with alphanumeric', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleJoinRoom({ room: 'testRoom123' }, client);
      expect(result).toEqual({
        event: 'joined_room',
        data: { room: 'tenant:tenant-123:testRoom123' },
      });
      expect(client.join).toHaveBeenCalledWith('tenant:tenant-123:testRoom123');
    });

    it('should accept valid room name with allowed special chars', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleJoinRoom(
        { room: 'thread:email-123_v2.0' },
        client,
      );
      expect(result).toEqual({
        event: 'joined_room',
        data: { room: 'tenant:tenant-123:thread:email-123_v2.0' },
      });
    });

    it('should accept room name at max length', async () => {
      const client = createMockClient('tenant-123');
      const maxRoom = 'a'.repeat(100);
      const result = await gateway.handleJoinRoom({ room: maxRoom }, client);
      expect(result).toEqual({
        event: 'joined_room',
        data: { room: `tenant:tenant-123:${maxRoom}` },
      });
    });
  });

  describe('handleLeaveRoom', () => {
    const createMockClient = (tenantId?: string): AuthenticatedSocket =>
      ({
        id: 'socket-123',
        tenantId,
        leave: jest.fn().mockResolvedValue(undefined),
      }) as unknown as AuthenticatedSocket;

    it('should reject unauthenticated client', async () => {
      const client = createMockClient(undefined);
      const result = await gateway.handleLeaveRoom({ room: 'test-room' }, client);
      expect(result).toEqual({
        event: 'error',
        data: { message: 'unauthenticated' },
      });
    });

    it('should reject empty room name', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleLeaveRoom({ room: '' }, client);
      expect(result).toEqual({
        event: 'error',
        data: { message: 'room name cannot be empty' },
      });
    });

    it('should reject room name with invalid characters', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleLeaveRoom(
        { room: 'test<script>' },
        client,
      );
      expect(result).toEqual({
        event: 'error',
        data: {
          message:
            'room name contains invalid characters (allowed: alphanumeric, underscore, hyphen, colon, dot)',
        },
      });
    });

    it('should accept valid room name and leave', async () => {
      const client = createMockClient('tenant-123');
      const result = await gateway.handleLeaveRoom({ room: 'testRoom' }, client);
      expect(result).toEqual({
        event: 'left_room',
        data: { room: 'tenant:tenant-123:testRoom' },
      });
      expect(client.leave).toHaveBeenCalledWith('tenant:tenant-123:testRoom');
    });
  });

  describe('handlePing', () => {
    it('should return pong with timestamp', () => {
      const client = {
        id: 'socket-123',
      } as unknown as AuthenticatedSocket;

      const result = gateway.handlePing(client);

      expect(result).toEqual({
        event: 'pong',
        data: { timestamp: expect.any(String) },
      });
    });
  });

  describe('hasTenantConnections', () => {
    it('should return false for tenant with no connections', () => {
      const result = gateway.hasTenantConnections('nonexistent-tenant');
      expect(result).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('should set gateway on events service during onModuleInit', () => {
      gateway.onModuleInit();
      expect(mockEventsService.setGateway).toHaveBeenCalledWith(gateway);
    });

    it('should not throw when onModuleDestroy called multiple times', () => {
      expect(() => gateway.onModuleDestroy()).not.toThrow();
      expect(() => gateway.onModuleDestroy()).not.toThrow();
    });
  });
});
