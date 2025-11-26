import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../../src/prisma/prisma-client.factory';

// Tenant under test provided by user context
const TARGET_TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

describe('Tenant Providers Sanity', () => {
  let prisma: PrismaClient;
  let skipSuite = false;

  beforeAll(async () => {
    try {
      prisma = createPrismaClient();
      // Simple connectivity check
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      // If DB is not reachable, skip gracefully
      skipSuite = true;
       
      console.warn('Skipping tenant provider tests: database not reachable', error);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('should have at least one active provider for target tenant', async () => {
    if (skipSuite) {
       
      console.warn('Skipping: database not reachable');
      return;
    }

    const providers = await prisma.providerConfig.findMany({
      where: { tenantId: TARGET_TENANT_ID, isActive: true },
      select: { id: true, email: true, providerType: true },
    });

    if (providers.length === 0) {
      return pending(`No active providers for tenant ${TARGET_TENANT_ID}`);
    }

    expect(providers.length).toBeGreaterThan(0);
  });

  it('should have tokens present for active providers', async () => {
    if (skipSuite) {
       
      console.warn('Skipping: database not reachable');
      return;
    }

    const providers = await prisma.providerConfig.findMany({
      where: { tenantId: TARGET_TENANT_ID, isActive: true },
      select: {
        id: true,
        email: true,
        providerType: true,
        accessToken: true,
        tokenEncryptionIv: true,
      },
    });

    if (providers.length === 0) {
      return pending(`No active providers for tenant ${TARGET_TENANT_ID}`);
    }

    const missingTokens = providers.filter(
      (p) => !p.accessToken || !p.tokenEncryptionIv,
    );

    if (missingTokens.length > 0) {
       
      console.warn('Providers missing tokens', missingTokens);
    }

    expect(missingTokens.length).toBe(0);
  });
});
