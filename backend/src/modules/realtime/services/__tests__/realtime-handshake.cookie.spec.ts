import { RealtimeHandshakeService } from '../realtime-handshake.service';
import { AUTH_COOKIE_NAME } from '../../../auth/helpers/cookie.helper';

/**
 * Unit tests for WebSocket handshake cookie extraction (SEC-01)
 *
 * Tests that extractToken checks cookies FIRST, then falls back to
 * existing auth.token/header/query extraction methods.
 */
describe('RealtimeHandshakeService - Cookie Extraction', () => {
  let service: RealtimeHandshakeService;

  beforeEach(() => {
    // Create service with minimal mocks (we only test extractToken, not authenticate)
    const mockJwtService = {} as any;
    const mockConfigService = {
      get: jest.fn().mockReturnValue('a'.repeat(32)), // JWT_SECRET
    } as any;
    const mockPrisma = {} as any;

    service = new RealtimeHandshakeService(mockJwtService, mockConfigService, mockPrisma);
  });

  function createMockClient(overrides: {
    cookie?: string;
    authorization?: string;
    authToken?: string;
    queryToken?: string;
  } = {}): any {
    return {
      id: 'test-client',
      handshake: {
        headers: {
          ...(overrides.cookie !== undefined ? { cookie: overrides.cookie } : {}),
          ...(overrides.authorization ? { authorization: overrides.authorization } : {}),
        },
        auth: overrides.authToken ? { token: overrides.authToken } : {},
        query: overrides.queryToken ? { token: overrides.queryToken } : {},
      },
    };
  }

  describe('extractToken', () => {
    it('should return token from cookie when present', () => {
      const client = createMockClient({
        cookie: `${AUTH_COOKIE_NAME}=jwt-from-cookie`,
      });

      const token = service.extractToken(client);
      expect(token).toBe('jwt-from-cookie');
    });

    it('should prioritize cookie over auth.token', () => {
      const client = createMockClient({
        cookie: `${AUTH_COOKIE_NAME}=jwt-from-cookie`,
        authToken: 'jwt-from-auth',
      });

      const token = service.extractToken(client);
      expect(token).toBe('jwt-from-cookie');
    });

    it('should prioritize cookie over Authorization header', () => {
      const client = createMockClient({
        cookie: `${AUTH_COOKIE_NAME}=jwt-from-cookie`,
        authorization: 'Bearer jwt-from-header',
      });

      const token = service.extractToken(client);
      expect(token).toBe('jwt-from-cookie');
    });

    it('should fall back to auth.token when no cookie', () => {
      const client = createMockClient({
        authToken: 'jwt-from-auth',
      });

      const token = service.extractToken(client);
      expect(token).toBe('jwt-from-auth');
    });

    it('should fall back to Authorization header when no cookie and no auth.token', () => {
      const client = createMockClient({
        authorization: 'Bearer jwt-from-header',
      });

      const token = service.extractToken(client);
      expect(token).toBe('jwt-from-header');
    });

    it('should fall back to query.token when nothing else present', () => {
      const client = createMockClient({
        queryToken: 'jwt-from-query',
      });

      const token = service.extractToken(client);
      expect(token).toBe('jwt-from-query');
    });

    it('should return null when nothing present', () => {
      const client = createMockClient({});

      const token = service.extractToken(client);
      expect(token).toBeNull();
    });

    it('should parse access_token from multiple cookies correctly', () => {
      const client = createMockClient({
        cookie: `csrf_token=abc123; ${AUTH_COOKIE_NAME}=jwt-target; other_cookie=val`,
      });

      const token = service.extractToken(client);
      expect(token).toBe('jwt-target');
    });

    it('should handle empty cookie header gracefully', () => {
      const client = createMockClient({
        cookie: '',
      });

      const token = service.extractToken(client);
      expect(token).toBeNull();
    });

    it('should handle cookie header without access_token', () => {
      const client = createMockClient({
        cookie: 'csrf_token=abc123; other=val',
        authToken: 'jwt-fallback',
      });

      const token = service.extractToken(client);
      expect(token).toBe('jwt-fallback');
    });

    it('should handle cookie with spaces around values', () => {
      const client = createMockClient({
        cookie: `  ${AUTH_COOKIE_NAME}=jwt-with-spaces ;  other=val `,
      });

      const token = service.extractToken(client);
      expect(token).toBe('jwt-with-spaces');
    });
  });
});
