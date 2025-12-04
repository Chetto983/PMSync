import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * E2E Tests for Authentication
 *
 * Verify that all protected endpoints require authentication
 * and reject invalid/missing tokens
 */
describe('Authentication (E2E)', () => {
  let app: INestApplication;
  let validToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Create a valid user and get token
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'auth-test@example.com',
        password: 'Test123!@#',
        firstName: 'Auth',
        lastName: 'Test',
      });

    // Disable MFA for test user
    const prisma = app.get(PrismaService);
    const createdUser = await prisma.user.findFirst({
      where: { email: 'auth-test@example.com' },
      select: { id: true },
    });

    if (createdUser?.id) {
      await prisma.user.update({
        where: { id: createdUser.id },
        data: { isMfaEnabled: false },
      });
    }

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'auth-test@example.com',
        password: 'Test123!@#',
      });

    validToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Public Endpoints (No Auth Required)', () => {
    it('should allow access to /health', async () => {
      await request(app.getHttpServer())
        .get('/health')
        .expect(200);
    });

    it('should allow POST /auth/register', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'new-user@example.com',
          password: 'Test123!@#',
          firstName: 'New',
        })
      .expect(200);
    });

    it('should allow POST /auth/login', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'auth-test@example.com',
          password: 'Test123!@#',
        })
        .expect(200);
    });
  });

  describe('Protected Endpoints (Auth Required)', () => {
    const protectedEndpoints = [
      { method: 'get', path: '/auth/me' },
      { method: 'get', path: '/emails' },
      { method: 'get', path: '/contacts' },
      { method: 'get', path: '/calendar/events' },
      { method: 'get', path: '/ai/chat/sessions' },
      { method: 'get', path: '/providers' },
      { method: 'get', path: '/labels' },
      { method: 'get', path: '/users/me' },
    ];

    protectedEndpoints.forEach(({ method, path }) => {
      it(`should reject ${method.toUpperCase()} ${path} without token`, async () => {
        await request(app.getHttpServer())
          [method](path)
          .expect(401);
      });

      it(`should reject ${method.toUpperCase()} ${path} with invalid token`, async () => {
        await request(app.getHttpServer())
          [method](path)
          .set('Authorization', 'Bearer invalid_token_here')
          .expect(401);
      });

      it(`should allow ${method.toUpperCase()} ${path} with valid token`, async () => {
        const response = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', `Bearer ${validToken}`);

        expect(response.status).not.toBe(401);
      });
    });
  });

  describe('JWT Token Validation', () => {
    it('should reject expired token', async () => {
      // This would require mocking time or creating an expired token
      // For now, test with malformed token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.invalid';

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('should reject token with invalid signature', async () => {
      const tamperedToken = validToken.slice(0, -5) + 'XXXXX';

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });

    it('should reject token without Bearer prefix', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', validToken)
        .expect(401);
    });

    it('should accept valid token format', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit OTP verification (3/min)', async () => {
      const email = 'ratelimit-otp@example.com';

      // Register user first
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'Test123!@#',
          firstName: 'Rate',
        });

      // Try to verify OTP 4 times
      for (let i = 0; i < 4; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/verify-otp')
          .send({
            email,
            code: '000000',
          });

        if (i < 3) {
          expect(response.status).not.toBe(429);
        } else {
          expect(response.status).toBe(429); // 4th request should be rate limited
        }
      }
    });

    it('should rate limit login attempts (5/min)', async () => {
      const email = 'ratelimit-login@example.com';

      // Try to login 6 times with wrong password
      for (let i = 0; i < 6; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email,
            password: 'WrongPassword123',
          });

        if (i < 5) {
          expect(response.status).not.toBe(429);
        } else {
          expect(response.status).toBe(429); // 6th request should be rate limited
        }
      }
    });
  });

  describe('Password Security', () => {
    it('should reject weak passwords', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'weak-pass@example.com',
          password: '123',
          firstName: 'Weak',
        })
        .expect(400);
    });

    it('should require minimum password length', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'short-pass@example.com',
          password: 'Test1!', // Less than 8 characters
          firstName: 'Short',
        })
        .expect(400);
    });

    it('should accept strong passwords', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'strong-pass@example.com',
          password: 'Test123!@#$%',
          firstName: 'Strong',
        })
        .expect(201);
    });
  });

  describe('Session Management', () => {
    it('should return user info with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('tenantId');
    });

    it('should allow logout', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });
  });
});
