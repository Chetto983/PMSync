import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';

/**
 * Minimal smoke tests for calendar invite endpoints.
 * These validate API contracts and DB writes without asserting provider side-effects.
 */
describe.skip('Calendar Invite Endpoints (smoke)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: any;
  let authToken: string;
  let providerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // Seed minimal user/tenant/provider
    const slugSuffix = Date.now();
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant',
        slug: `test-tenant-${slugSuffix}`,
      },
    });

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `test-${slugSuffix}@example.com`,
        passwordHash: 'hash',
        role: 'user',
        isActive: true,
      },
    });

    // Create provider supporting email/calendar
    const provider = await prisma.providerConfig.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        providerType: 'google',
        email: user.email,
        displayName: 'Test Provider',
        supportsEmail: true,
        supportsCalendar: true,
        supportsContacts: false,
        isActive: true,
      },
    });
    providerId = provider.id;

    // Issue a fake JWT payload (the app may expect a real JWT; adjust if auth guards change)
    authToken = Buffer.from(JSON.stringify({ tenantId: tenant.id, email: user.email })).toString('base64');
  });

  afterAll(async () => {
    await app.close();
  });

  const authHeader = () => ({ Authorization: `Bearer ${authToken}` });

  it('should return 404 when invite not found for respond', async () => {
    await request(server)
      .post('/emails/unknown-id/calendar-invite/respond')
      .set(authHeader())
      .send({ response: 'accept' })
      .expect(404);
  });

  it('should create event and send invite via /emails/calendar-invite/send', async () => {
    const start = new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const res = await request(server)
      .post('/emails/calendar-invite/send')
      .set(authHeader())
      .send({
        providerId,
        to: [{ email: 'attendee@example.com', name: 'Attendee' }],
        summary: 'Test Meeting',
        description: 'Discuss roadmap',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        timeZone: 'UTC',
      })
      .expect(201);

    expect(res.body?.success).toBe(true);
    expect(res.body?.eventId).toBeDefined();
  });
});
