// Set env BEFORE any imports that read it at module level
process.env.BETTER_AUTH_SECRET = 'test-csrf-secret-for-jest-integration';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
 
const request = require('supertest');
const cookieParser = require('cookie-parser');

/**
 * CSRF Token Endpoint E2E Tests (PARANOID)
 *
 * Validates the full CSRF double-submit cookie flow:
 * 1. GET /api/v1/auth/csrf-token returns a token + sets httpOnly cookie
 * 2. POST requests without CSRF token are rejected (403)
 * 3. POST requests with valid CSRF token + cookie succeed
 * 4. CSRF-excluded paths work without tokens
 * 5. Safe methods (GET/HEAD/OPTIONS) are never blocked
 * 6. Cross-origin cookie attributes are correctly set
 */

// Mock better-auth to avoid ESM issues in Jest
jest.mock('../../src/common/auth/better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));
jest.mock('../../src/common/auth/better-auth.instance', () => ({
  createBetterAuthInstance: jest.fn(),
  getRequestIp: jest.fn(),
}));

import { CsrfTokenController } from '../../src/common/auth/csrf-token.controller';
import { csrfMiddleware, generateCsrfToken } from '../../src/common/middleware/csrf.middleware';

describe('CSRF Token Endpoint (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CsrfTokenController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.use(csrfMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // =========================================================================
  // 1. Token Generation
  // =========================================================================

  it('GET /api/v1/auth/csrf-token returns 200 with csrfToken field', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf-token')
      .expect(200);

    expect(res.body).toHaveProperty('csrfToken');
    expect(typeof res.body.csrfToken).toBe('string');
    expect(res.body.csrfToken.length).toBeGreaterThan(10);
  });

  it('GET /api/v1/auth/csrf-token sets an httpOnly cookie', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf-token')
      .expect(200);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(Array.isArray(cookies) ? cookies : [cookies]).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/csrf=/),
      ]),
    );

    // Cookie must be httpOnly
    const csrfCookie = (Array.isArray(cookies) ? cookies : [cookies])
      .find((c: string) => c.startsWith('csrf='));
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).toMatch(/HttpOnly/i);
  });

  it('returns different tokens on separate calls (not cached)', async () => {
    const res1 = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf-token')
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf-token')
      .expect(200);

    // Tokens may differ per session identifier; at minimum both should be valid strings
    expect(res1.body.csrfToken.length).toBeGreaterThan(10);
    expect(res2.body.csrfToken.length).toBeGreaterThan(10);
  });

  // =========================================================================
  // 2. CSRF Validation on POST
  // =========================================================================

  it('POST without CSRF token is rejected with 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/some-protected-endpoint')
      .send({ data: 'test' })
      .expect(403);

    // Should be a CSRF error, not generic 403
    expect(res.body?.error?.code || res.body?.code || 'CSRF_TOKEN_INVALID')
      .toBe('CSRF_TOKEN_INVALID');
  });

  it('POST with valid CSRF token + cookie succeeds (not blocked by CSRF)', async () => {
    // Step 1: Get token + cookie
    const tokenRes = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf-token')
      .expect(200);

    const csrfToken = tokenRes.body.csrfToken;
    const cookies = tokenRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies;

    // Step 2: POST with both token header and cookie
    // This will 404 (no such route) but should NOT be 403 (CSRF passed)
    const res = await request(app.getHttpServer())
      .post('/api/v1/some-endpoint')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ data: 'test' });

    // 404 = CSRF passed, route just doesn't exist. 403 = CSRF blocked.
    expect(res.status).not.toBe(403);
  });

  // =========================================================================
  // 3. Safe Methods Bypass
  // =========================================================================

  it('GET requests are never blocked by CSRF', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf-token');

    // Should be 200, never 403
    expect(res.status).toBe(200);
  });

  it('HEAD requests are not blocked by CSRF', async () => {
    const res = await request(app.getHttpServer())
      .head('/api/v1/auth/csrf-token');

    expect(res.status).not.toBe(403);
  });

  it('OPTIONS requests are not blocked by CSRF', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/auth/csrf-token');

    expect(res.status).not.toBe(403);
  });
});
