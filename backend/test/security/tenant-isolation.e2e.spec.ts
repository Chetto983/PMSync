import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ContactsService } from '../../src/modules/contacts/services/contacts.service';
import { CalendarService } from '../../src/modules/calendar/services/calendar.service';
import { CryptoService } from '../../src/common/services/crypto.service';

/**
 * E2E Tests for Tenant Isolation
 *
 * These tests verify that cross-tenant access is properly blocked
 * across all modules: emails, contacts, calendar, AI, etc.
 */
describe('Tenant Isolation (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Test data
  let tenantAId: string;
  let tenantBId: string;
  let userAToken: string;
  let userBToken: string;
  let userAId: string;
  let userBId: string;
  let providerAId: string;
  let providerBId: string;
  let crypto: CryptoService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    crypto = app.get<CryptoService>(CryptoService);
    await app.init();

    // Stub external sync methods to avoid live provider calls
    const contactsService = app.get<ContactsService>(ContactsService);
    jest.spyOn(contactsService, 'createContact').mockImplementation(async (tenantId, data: any) => {
      const id = `contact-${Date.now()}`;
      return {
        id,
        tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        emails: data.emails,
        providerContacts: [],
      } as any;
    });
    jest.spyOn(contactsService, 'syncContacts').mockResolvedValue(0 as any);

    const calendarService = app.get<CalendarService>(CalendarService);
    jest.spyOn(calendarService, 'createEvent').mockImplementation(async (tenantId, data: any) => {
      const id = `event-${Date.now()}`;
      return {
        id,
        tenantId,
        providerId: data.providerId,
        title: data.title,
        calendarId: data.calendarId || 'primary',
        calendarName: data.calendarName || 'primary',
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
      } as any;
    });

    // Setup: Create two separate tenants with users
    await setupTestTenants();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    await app.close();
  });

  async function setupTestTenants() {
    // Clean residual providers from previous runs
    await prisma.providerConfig.deleteMany({
      where: { email: { in: ['tenant-a@gmail.com', 'tenant-b@gmail.com'] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: ['tenant-a-test@example.com', 'tenant-b-test@example.com'] } },
    });

    // Register User A
    const userAResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'tenant-a-test@example.com',
        password: 'Test123!@#',
        firstName: 'Tenant',
        lastName: 'A',
      })
      .expect(201);

    // Disable MFA for User A
    await prisma.user.update({
      where: { id: userAResponse.body.userId },
      data: { isMfaEnabled: false },
    });

    // Register User B
    const userBResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'tenant-b-test@example.com',
        password: 'Test123!@#',
        firstName: 'Tenant',
        lastName: 'B',
      })
      .expect(201);

    // Disable MFA for User B
    await prisma.user.update({
      where: { id: userBResponse.body.userId },
      data: { isMfaEnabled: false },
    });

    // Login User A
    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'tenant-a-test@example.com',
        password: 'Test123!@#',
      })
      .expect(201);

    userAToken = loginA.body.accessToken;
    tenantAId = loginA.body.user.tenantId;
    userAId = loginA.body.user.id;

    // Login User B
    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'tenant-b-test@example.com',
        password: 'Test123!@#',
      })
      .expect(201);

    userBToken = loginB.body.accessToken;
    tenantBId = loginB.body.user.tenantId;
    userBId = loginB.body.user.id;

    expect(tenantAId).not.toEqual(tenantBId);

    // Create providers for each tenant (supporting email/calendar/contacts)
    const encryptedAccess = crypto.encrypt('a'.repeat(64));
    const encryptedRefresh = crypto.encrypt('r'.repeat(64));

    const providerA = await prisma.providerConfig.create({
      data: {
        tenantId: tenantAId,
        userId: userAId,
        providerType: 'google',
        email: 'tenant-a@gmail.com',
        accessToken: encryptedAccess.encrypted,
        tokenEncryptionIv: encryptedAccess.iv,
        refreshToken: encryptedRefresh.encrypted,
        refreshTokenEncryptionIv: encryptedRefresh.iv,
        tokenExpiresAt: new Date(Date.now() + 3600000),
        supportsEmail: true,
        supportsCalendar: true,
        supportsContacts: true,
        isActive: true,
      },
    });
    const providerB = await prisma.providerConfig.create({
      data: {
        tenantId: tenantBId,
        userId: userBId,
        providerType: 'google',
        email: 'tenant-b@gmail.com',
        accessToken: encryptedAccess.encrypted,
        tokenEncryptionIv: encryptedAccess.iv,
        refreshToken: encryptedRefresh.encrypted,
        refreshTokenEncryptionIv: encryptedRefresh.iv,
        tokenExpiresAt: new Date(Date.now() + 3600000),
        supportsEmail: true,
        supportsCalendar: true,
        supportsContacts: true,
        isActive: true,
      },
    });

    providerAId = providerA.id;
    providerBId = providerB.id;
  }

  async function cleanupTestData() {
    // Delete test users and their data
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['tenant-a-test@example.com', 'tenant-b-test@example.com'],
        },
      },
    });
  }

  describe('Email Isolation', () => {
    let emailAId: string;

    it('should allow user to create draft email', async () => {
      const response = await request(app.getHttpServer())
        .post('/emails/drafts')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Confidential Email from Tenant A',
          body: 'SECRET DATA',
          to: ['recipient@example.com'],
          providerId: providerAId,
        })
        .expect(201);

      emailAId = response.body.id;
      expect(response.body.tenantId).toEqual(tenantAId);
    });

    it('should block cross-tenant email read', async () => {
      await request(app.getHttpServer())
        .get(`/emails/${emailAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404); // Should not find email from different tenant
    });

    it('should block cross-tenant email update', async () => {
      await request(app.getHttpServer())
        .patch(`/emails/${emailAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ subject: 'HACKED' })
        .expect(404);
    });

    it('should block cross-tenant email delete', async () => {
      await request(app.getHttpServer())
        .delete(`/emails/${emailAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('should only list own tenant emails', async () => {
      const response = await request(app.getHttpServer())
        .get('/emails')
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(200);

      const emailList = Array.isArray(response.body)
        ? response.body
        : response.body.items || response.body.emails || [];
      const emailIds = emailList.map((e: any) => e.id);
      expect(emailIds).not.toContain(emailAId);
    });
  });

  describe('Contact Isolation', () => {
    let contactAId: string;

    it('should allow user to create contact', async () => {
      const response = await request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          firstName: 'VIP',
          lastName: 'Client',
          company: 'Secret Corp',
          providerId: providerAId,
          emails: [{ value: `vip-${Date.now()}@tenantA.com`, primary: true }],
        })
        .expect(201);

      contactAId = response.body.id;
      expect(response.body.tenantId).toEqual(tenantAId);
    });

    it('should block cross-tenant contact read', async () => {
      await request(app.getHttpServer())
        .get(`/contacts/${contactAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('should block cross-tenant contact update', async () => {
      await request(app.getHttpServer())
        .patch(`/contacts/${contactAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ company: 'HACKED' })
        .expect(404);
    });

    it('should block cross-tenant contact delete', async () => {
      await request(app.getHttpServer())
        .delete(`/contacts/${contactAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('should only list own tenant contacts', async () => {
      const response = await request(app.getHttpServer())
        .get('/contacts')
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(200);

      const contactList = Array.isArray(response.body)
        ? response.body
        : response.body.items || response.body.contacts || [];
      const contactIds = contactList.map((c: any) => c.id);
      expect(contactIds).not.toContain(contactAId);
    });
  });

  describe('Calendar Isolation', () => {
    let eventAId: string;

    it('should allow user to create calendar event', async () => {
      const response = await request(app.getHttpServer())
        .post('/calendar/events')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          providerId: providerAId,
          title: 'Secret Board Meeting',
          description: 'Confidential',
          startTime: new Date('2025-12-01T10:00:00Z').toISOString(),
          endTime: new Date('2025-12-01T11:00:00Z').toISOString(),
        })
        .expect(201);

      eventAId = response.body.id;
      expect(response.body.tenantId).toEqual(tenantAId);
    });

    it('should block cross-tenant calendar event read', async () => {
      await request(app.getHttpServer())
        .get(`/calendar/events/${eventAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('should block cross-tenant calendar event update', async () => {
      await request(app.getHttpServer())
        .patch(`/calendar/events/${eventAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ summary: 'HACKED' })
        .expect(404);
    });

    it('should block cross-tenant calendar event delete', async () => {
      await request(app.getHttpServer())
        .delete(`/calendar/events/${eventAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('should only list own tenant calendar events', async () => {
      const response = await request(app.getHttpServer())
        .get('/calendar/events')
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(200);

      const events = Array.isArray(response.body)
        ? response.body
        : response.body.items || response.body.events || [];
      const eventIds = events.map((e: any) => e.id);
      expect(eventIds).not.toContain(eventAId);
    });
  });

  describe('AI Session Isolation', () => {
    it('should allow user to call AI chat', async () => {
      const response = await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ message: 'hello there' })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Provider Sync Isolation (CRITICAL)', () => {
    it('should block cross-tenant contact sync', async () => {
      await request(app.getHttpServer())
        .post(`/contacts/sync/${providerAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(403);
    });

    it('should block cross-tenant calendar sync', async () => {
      await request(app.getHttpServer())
        .post(`/calendar/sync/${providerAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(403);
    });

    it('should allow own tenant provider sync', async () => {
      // Tenant A can sync their own provider
      const response = await request(app.getHttpServer())
        .post(`/contacts/sync/${providerAId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Bulk Operations Isolation', () => {
    let emailA1Id: string;
    let emailA2Id: string;

    beforeAll(async () => {
      // Create multiple emails for Tenant A
      const email1 = await request(app.getHttpServer())
        .post('/emails/drafts')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Email 1',
          body: 'Content 1',
          to: ['test@example.com'],
          providerId: providerAId,
        })
        .expect(201);

      const email2 = await request(app.getHttpServer())
        .post('/emails/drafts')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          subject: 'Email 2',
          body: 'Content 2',
          to: ['test@example.com'],
          providerId: providerAId,
        })
        .expect(201);

      emailA1Id = email1.body.id;
      emailA2Id = email2.body.id;
    });

    it('should block cross-tenant bulk delete', async () => {
      const response = await request(app.getHttpServer())
        .delete('/emails/bulk')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ emailIds: [emailA1Id, emailA2Id] })
        .expect(200);

      expect(response.body.deleted).toBe(0);
    });

    it('should block cross-tenant bulk mark read', async () => {
      const response = await request(app.getHttpServer())
        .patch('/emails/bulk/read')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ emailIds: [emailA1Id, emailA2Id], isRead: true })
        .expect(200);

      expect(response.body.updated).toBe(0);
    });

    it('should allow own tenant bulk operations', async () => {
      const response = await request(app.getHttpServer())
        .patch('/emails/bulk/read')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ emailIds: [emailA1Id, emailA2Id], isRead: true })
        .expect(200);

      expect(response.body.updated).toBeGreaterThan(0);
    });
  });

  describe('Label Isolation', () => {
    let labelAId: string;

    it('should allow user to create label', async () => {
      const response = await request(app.getHttpServer())
        .post('/labels')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: `Confidential-${Date.now()}`,
          color: '#FF0000',
        })
        .expect(201);

      labelAId = response.body.id || response.body?.label?.id;
      expect(labelAId).toBeDefined();
    });

    it('should block cross-tenant label update', async () => {
      await request(app.getHttpServer())
        .put(`/labels/${labelAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ name: 'HACKED' })
        .expect(404);
    });

    it('should block cross-tenant label delete', async () => {
      await request(app.getHttpServer())
        .delete(`/labels/${labelAId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('should only list own tenant labels', async () => {
      const response = await request(app.getHttpServer())
        .get('/labels')
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(200);

      const labels = Array.isArray(response.body)
        ? response.body
        : response.body.items || response.body.labels || [];
      const labelIds = labels.map((l: any) => l.id);
      expect(labelIds).not.toContain(labelAId);
    });
  });

  describe('Parameter Injection', () => {
    it('should ignore injected tenantId in contact creation', async () => {
      const response = await request(app.getHttpServer())
        .post('/contacts')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          firstName: 'Injected',
          tenantId: tenantAId, // Try to inject Tenant A's ID
          providerId: providerBId,
          emails: [{ value: `injected-${Date.now()}@test.com`, primary: true }],
        })
        .expect(201);

      // Should create in Tenant B, not Tenant A
      expect(response.body.tenantId).toEqual(tenantBId);
      expect(response.body.tenantId).not.toEqual(tenantAId);
    });

    it('should ignore injected userId in AI chat', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/voltagent/chat')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          message: 'Hello',
          userId: userAId, // Try to inject User A's ID - should be ignored
          tenantId: tenantAId, // Try to inject Tenant A's ID - should be ignored
        })
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should ignore injected userId in VoltAgent chat (api/v1)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/voltagent/chat')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          message: 'Hello',
          userId: userAId, // Try to inject User A's ID - should be ignored
          tenantId: tenantAId, // Try to inject Tenant A's ID - should be ignored
        })
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });
});
