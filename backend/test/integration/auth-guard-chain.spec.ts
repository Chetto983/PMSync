// Set env BEFORE any imports that read it at module level
process.env.BETTER_AUTH_SECRET = 'test-auth-guard-secret';

// Mock better-auth to avoid ESM issues in Jest
jest.mock('../../src/common/auth/better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));
jest.mock('../../src/common/auth/better-auth.instance', () => ({
  createBetterAuthInstance: jest.fn(),
  getRequestIp: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';

const request = require('supertest');
const cookieParser = require('cookie-parser');

import { BETTER_AUTH } from '../../src/common/auth/better-auth.module';
import { BetterAuthGuard } from '../../src/common/auth/better-auth.guard';
import { TenantGuard } from '../../src/common/auth/tenant.guard';
import { RolesGuard } from '../../src/common/auth/roles.guard';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { TenantsController } from '../../src/modules/tenants/controllers/tenants.controller';
import { TenantService } from '../../src/modules/tenants/services/tenant.service';
import { createTestTenant, createTestUser, createTestSession } from '../helpers/factories';
import { getTestPrismaClient } from '../helpers/prisma-test-client';
import { withoutTenantScopingAsync } from '../../src/prisma/tenant-scoping/tenant-context';

/**
 * Auth Guard Chain Integration Tests — BINT-02
 *
 * Proves the full BetterAuthGuard -> TenantGuard -> RolesGuard pipeline:
 * 1. Unauthenticated (no session) -> 401
 * 2. Wrong tenant (non-super-admin cross-tenant) -> 403
 * 3. Insufficient role (member on super-admin endpoint) -> 403
 * 4. Valid super-admin -> 200
 */
describe('Auth Guard Chain (Integration)', () => {
  let app: INestApplication;
  const createdTenantIds: string[] = [];

  const mockAuth = {
    api: {
      getSession: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, EventEmitterModule.forRoot()],
      controllers: [TenantsController],
      providers: [
        TenantService,
        { provide: BETTER_AUTH, useValue: mockAuth },
        { provide: APP_GUARD, useClass: BetterAuthGuard },
        BetterAuthGuard,
        TenantGuard,
        RolesGuard,
        Reflector,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();

    // Targeted cleanup: delete in FK order — session -> user -> tenant
    if (createdTenantIds.length > 0) {
      const prisma = getTestPrismaClient();
      await withoutTenantScopingAsync(async () => {
        await prisma.session.deleteMany({
          where: { user: { tenantId: { in: createdTenantIds } } },
        });
        await prisma.user.deleteMany({
          where: { tenantId: { in: createdTenantIds } },
        });
        await prisma.tenant.deleteMany({
          where: { id: { in: createdTenantIds } },
        });
      });
    }
  });

  beforeEach(() => {
    mockAuth.api.getSession.mockReset();
  });

  // ===========================================================================
  // Scenario 1: Unauthenticated -> 401
  // ===========================================================================

  it('unauthenticated request returns 401', async () => {
    mockAuth.api.getSession.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/v1/tenants')
      .expect(401);
  });

  // ===========================================================================
  // Scenario 2: Valid session, wrong tenant (non-super-admin cross-tenant) -> 403
  // ===========================================================================

  it('valid session but wrong-tenant header returns 403', async () => {
    const tenantA = await createTestTenant();
    const tenantB = await createTestTenant();
    createdTenantIds.push(tenantA.id, tenantB.id);

    const memberUser = await createTestUser(tenantA.id, { role: 'member' });
    const session = await createTestSession(memberUser.id, { tenantId: tenantA.id });

    // BetterAuthGuard: user belongs to tenantA
    mockAuth.api.getSession.mockResolvedValue({
      session: { id: session.id, activeOrganizationId: null },
      user: {
        id: memberUser.id,
        email: memberUser.email,
        tenantId: tenantA.id,
        role: 'member',
        isActive: true,
      },
    });

    // X-Tenant-Id points to tenantB — cross-tenant access denied for 'member'
    await request(app.getHttpServer())
      .get('/api/v1/tenants')
      .set('X-Tenant-Id', tenantB.id)
      .expect(403);
  });

  // ===========================================================================
  // Scenario 3: Valid session, valid tenant, insufficient role -> 403
  // ===========================================================================

  it('valid session, valid tenant, insufficient role returns 403', async () => {
    const tenant = await createTestTenant();
    createdTenantIds.push(tenant.id);

    const memberUser = await createTestUser(tenant.id, { role: 'member' });
    const session = await createTestSession(memberUser.id, { tenantId: tenant.id });

    // TenantGuard: tenant found + same tenant (no cross-tenant)
    // RolesGuard: 'member' insufficient for 'super-admin' endpoint
    mockAuth.api.getSession.mockResolvedValue({
      session: { id: session.id, activeOrganizationId: null },
      user: {
        id: memberUser.id,
        email: memberUser.email,
        tenantId: tenant.id,
        role: 'member',
        isActive: true,
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/tenants')
      .set('X-Tenant-Id', tenant.id)
      .expect(403);
  });

  // ===========================================================================
  // Scenario 4: Valid session, valid tenant, super-admin -> 200
  // ===========================================================================

  it('valid session with super-admin role returns 200', async () => {
    const tenant = await createTestTenant();
    createdTenantIds.push(tenant.id);

    const adminUser = await createTestUser(tenant.id, { role: 'super-admin' });
    const session = await createTestSession(adminUser.id, { tenantId: tenant.id });

    mockAuth.api.getSession.mockResolvedValue({
      session: { id: session.id, activeOrganizationId: null },
      user: {
        id: adminUser.id,
        email: adminUser.email,
        tenantId: tenant.id,
        role: 'super-admin',
        isActive: true,
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/tenants')
      .set('X-Tenant-Id', tenant.id)
      .expect(200);
  });
});
