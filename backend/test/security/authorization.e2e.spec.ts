import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * E2E Tests for Authorization (RBAC)
 *
 * Verify that role-based access control is properly enforced
 * Regular users cannot access admin endpoints
 */
describe('Authorization / RBAC (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userToken: string;
  let adminToken: string;
  let superAdminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    await app.init();

    // Setup test users with different roles
    await setupTestUsers();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupTestUsers() {
    // Create regular user
    const userResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'user@rbac-test.com',
        password: 'Test123!@#',
        firstName: 'Regular',
        lastName: 'User',
      });

    // Disable MFA for regular user
    await prisma.user.update({
      where: { id: userResponse.body.userId },
      data: { isMfaEnabled: false },
    });

    const userLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'user@rbac-test.com',
        password: 'Test123!@#',
      });

    userToken = userLogin.body.accessToken;

    // Create admin user (manually update role in DB)
    const adminResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'admin@rbac-test.com',
        password: 'Test123!@#',
        firstName: 'Admin',
        lastName: 'User',
      });

    // Find admin user in database to get tenantId
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@rbac-test.com' },
    });

    // Update user role to admin and disable MFA
    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        role: 'admin',
        isMfaEnabled: false,
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@rbac-test.com',
        password: 'Test123!@#',
      });

    adminToken = adminLogin.body.accessToken;

    // Create super-admin user
    const superadminResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'superadmin@rbac-test.com',
        password: 'Test123!@#',
        firstName: 'SuperAdmin',
        lastName: 'User',
      });

    // Find super-admin user in database to get their ID
    const superadminUser = await prisma.user.findFirst({
      where: { email: 'superadmin@rbac-test.com' },
    });

    // Update user role to super-admin and disable MFA
    await prisma.user.update({
      where: { id: superadminUser.id },
      data: {
        role: 'super-admin',
        isMfaEnabled: false,
      },
    });

    const superAdminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'superadmin@rbac-test.com',
        password: 'Test123!@#',
      });

    superAdminToken = superAdminLogin.body.accessToken;
  }

  describe('Tenant Management (Super-Admin Only)', () => {
    it('should block regular user from listing all tenants', async () => {
      await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should block admin from listing all tenants', async () => {
      await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('should allow super-admin to list all tenants', async () => {
      await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });

    it('should block regular user from creating tenant', async () => {
      await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Malicious Tenant',
          slug: 'malicious',
        })
        .expect(403);
    });

    it('should block admin from creating tenant', async () => {
      await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Malicious Tenant',
          slug: 'malicious',
        })
        .expect(403);
    });

    it('should allow super-admin to create tenant', async () => {
      await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'New Tenant',
          slug: 'new-tenant-rbac',
        })
        .expect(201);
    });

    it('should block regular user from deleting tenant', async () => {
      await request(app.getHttpServer())
        .delete('/tenants/some-tenant-id')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should allow super-admin to delete tenant', async () => {
      // Create tenant first
      const createResponse = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Temp Tenant',
          slug: 'temp-tenant-rbac',
        });

      const tenantId = createResponse.body.id;

      // Delete tenant
      await request(app.getHttpServer())
        .delete(`/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  describe('GDPR Compliance Endpoints (Admin Only)', () => {
    it('should block regular user from accessing GDPR status', async () => {
      await request(app.getHttpServer())
        .get('/compliance/gdpr/status')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should allow admin to access GDPR status', async () => {
      await request(app.getHttpServer())
        .get('/compliance/gdpr/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should allow super-admin to access GDPR status', async () => {
      await request(app.getHttpServer())
        .get('/compliance/gdpr/status')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  describe('Tenant Update (Admin + Super-Admin)', () => {
    let testTenantId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Update Test Tenant',
          slug: 'update-test-tenant',
        });

      testTenantId = response.body.id;
    });

    it('should block regular user from updating tenant', async () => {
      await request(app.getHttpServer())
        .put(`/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Hacked Name' })
        .expect(403);
    });

    it('should allow admin to update own tenant', async () => {
      // Admin can update their own tenant
      const adminUser = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      const adminTenantId = adminUser.body.tenantId;

      await request(app.getHttpServer())
        .put(`/tenants/${adminTenantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Tenant Name' })
        .expect(200);
    });

    it('should allow super-admin to update any tenant', async () => {
      await request(app.getHttpServer())
        .put(`/tenants/${testTenantId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Super Admin Updated' })
        .expect(200);
    });
  });

  describe('Regular User Permissions', () => {
    it('should allow user to access their own data', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('should allow user to access their emails', async () => {
      await request(app.getHttpServer())
        .get('/emails')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('should allow user to access their contacts', async () => {
      await request(app.getHttpServer())
        .get('/contacts')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('should allow user to access their calendar', async () => {
      await request(app.getHttpServer())
        .get('/calendar/events')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('should allow user to access AI features', async () => {
      await request(app.getHttpServer())
        .get('/ai/chat/sessions')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });
  });

  describe('Role Escalation Prevention', () => {
    it('should prevent user from escalating their own role', async () => {
      // User tries to update their own role
      const userResponse = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      const userId = userResponse.body.id;

      // Try to update role via user endpoint (should be rejected by DTO)
      await request(app.getHttpServer())
        .put('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: 'super-admin' })
        .expect(200); // Request succeeds but role is ignored

      // Verify role didn't change
      const updatedUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      expect(updatedUser?.role).toBe('user'); // Still 'user', not 'super-admin'
    });
  });
});
