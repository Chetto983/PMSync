import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { RealtimeHandshakeService } from './realtime-handshake.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedSocket } from '../types/realtime.types';

describe('RealtimeHandshakeService', () => {
  let service: RealtimeHandshakeService;
  let jwtService: jest.Mocked<JwtService>;
  let prismaService: jest.Mocked<PrismaService>;

  const mockJwtSecret = 'test-secret-that-is-at-least-32-chars-long';

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    tenantId: 'tenant-123',
    isActive: true,
    tenant: { isActive: true },
  };

  const mockDecodedToken = {
    userId: 'user-123',
    tenantId: 'tenant-123',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const mockJwtService = {
      verifyAsync: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return mockJwtSecret;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeHandshakeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RealtimeHandshakeService>(RealtimeHandshakeService);
    jwtService = module.get(JwtService);
    prismaService = module.get(PrismaService);
  });

  describe('extractToken', () => {
    it('should extract token from Authorization header', () => {
      const client = {
        handshake: {
          headers: { authorization: 'Bearer test-token' },
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      const token = service.extractToken(client);
      expect(token).toBe('test-token');
    });

    it('should extract token from auth object', () => {
      const client = {
        handshake: {
          headers: {},
          auth: { token: 'auth-token' },
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      const token = service.extractToken(client);
      expect(token).toBe('auth-token');
    });

    it('should extract token from query string', () => {
      const client = {
        handshake: {
          headers: {},
          auth: {},
          query: { token: 'query-token' },
        },
      } as unknown as AuthenticatedSocket;

      const token = service.extractToken(client);
      expect(token).toBe('query-token');
    });

    it('should return null if no token found', () => {
      const client = {
        handshake: {
          headers: {},
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      const token = service.extractToken(client);
      expect(token).toBeNull();
    });
  });

  describe('authenticate', () => {
    it('should authenticate valid token and return handshake result', async () => {
      const client = {
        id: 'socket-123',
        handshake: {
          headers: { authorization: 'Bearer valid-token' },
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      jwtService.verifyAsync.mockResolvedValue(mockDecodedToken);
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await service.authenticate(client);

      expect(result).toEqual({
        userId: 'user-123',
        tenantId: 'tenant-123',
        email: 'test@example.com',
        tenantRoom: 'tenant:tenant-123',
      });
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token', {
        secret: mockJwtSecret,
      });
    });

    it('should throw UnauthorizedException if token is missing', async () => {
      const client = {
        id: 'socket-123',
        handshake: {
          headers: {},
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      await expect(service.authenticate(client)).rejects.toThrow(UnauthorizedException);
      await expect(service.authenticate(client)).rejects.toThrow('Missing token');
    });

    it('should throw UnauthorizedException if token is invalid', async () => {
      const client = {
        id: 'socket-123',
        handshake: {
          headers: { authorization: 'Bearer invalid-token' },
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.authenticate(client)).rejects.toThrow(UnauthorizedException);
      await expect(service.authenticate(client)).rejects.toThrow('Invalid token');
    });

    it('should throw UnauthorizedException if token payload is missing userId', async () => {
      const client = {
        id: 'socket-123',
        handshake: {
          headers: { authorization: 'Bearer token' },
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      jwtService.verifyAsync.mockResolvedValue({ tenantId: 'tenant-123' });

      await expect(service.authenticate(client)).rejects.toThrow(UnauthorizedException);
      await expect(service.authenticate(client)).rejects.toThrow('Invalid token payload');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const client = {
        id: 'socket-123',
        handshake: {
          headers: { authorization: 'Bearer token' },
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      jwtService.verifyAsync.mockResolvedValue(mockDecodedToken);
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.authenticate(client)).rejects.toThrow(UnauthorizedException);
      await expect(service.authenticate(client)).rejects.toThrow('User not found');
    });

    it('should throw UnauthorizedException if tenant mismatch', async () => {
      const client = {
        id: 'socket-123',
        handshake: {
          headers: { authorization: 'Bearer token' },
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      jwtService.verifyAsync.mockResolvedValue({
        ...mockDecodedToken,
        tenantId: 'different-tenant',
      });
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);

      await expect(service.authenticate(client)).rejects.toThrow(UnauthorizedException);
      await expect(service.authenticate(client)).rejects.toThrow('Tenant mismatch');
    });

    it('should throw ForbiddenException if user is inactive', async () => {
      const client = {
        id: 'socket-123',
        handshake: {
          headers: { authorization: 'Bearer token' },
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      jwtService.verifyAsync.mockResolvedValue(mockDecodedToken);
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as any);

      await expect(service.authenticate(client)).rejects.toThrow(ForbiddenException);
      await expect(service.authenticate(client)).rejects.toThrow('Account is disabled');
    });

    it('should throw ForbiddenException if tenant is inactive', async () => {
      const client = {
        id: 'socket-123',
        handshake: {
          headers: { authorization: 'Bearer token' },
          auth: {},
          query: {},
        },
      } as unknown as AuthenticatedSocket;

      jwtService.verifyAsync.mockResolvedValue(mockDecodedToken);
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { isActive: false },
      } as any);

      await expect(service.authenticate(client)).rejects.toThrow(ForbiddenException);
      await expect(service.authenticate(client)).rejects.toThrow('Organization is disabled');
    });
  });
});
