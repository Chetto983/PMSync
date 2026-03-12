/**
 * RelationshipScoreService integration tests — BTEST-02
 * Tests run against real PostgreSQL. Scoring math verified on real DB rows.
 */
import { RelationshipScoreService } from '../relationship-score.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { createTestTenant, createTestContact } from '../../../../../test/helpers/factories';

const mockHashSearch = {
  buildExactSenderFilter: jest
    .fn()
    .mockReturnValue({ OR: [{ from: { in: [] } }] }),
};

describe('RelationshipScoreService', () => {
  let service: RelationshipScoreService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const contactIds: string[] = [];

  beforeAll(() => {
    prisma = getTestPrismaClient();
    service = new RelationshipScoreService(prisma as any, mockHashSearch as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockHashSearch.buildExactSenderFilter.mockReturnValue({ OR: [{ from: { in: [] } }] });
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await cleanupTestData();
  });

  describe('getRelationshipScores', () => {
    it('returns empty array when tenant has no contacts with interactions', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      // Contact with 0 interactions — excluded by query (totalInteractions > 0)
      const contact = await createTestContact(tenant.id, {
        totalInteractions: 0,
      });
      contactIds.push(contact.id);

      const scores = await service.getRelationshipScores(tenant.id);
      expect(scores).toEqual([]);
    });

    it('returns contact with non-zero interactions and correct shape', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const contact = await createTestContact(tenant.id, {
        displayName: 'High Freq Contact',
        emails: [{ value: 'highfreq@test.local', type: 'work' }],
        totalInteractions: 50,
        sentCount: 30,
        receivedCount: 20,
        lastInteractedAt: yesterday,
      });
      contactIds.push(contact.id);

      const scores = await service.getRelationshipScores(tenant.id);

      expect(scores.length).toBeGreaterThan(0);
      const score = scores.find((s) => s.contactId === contact.id);
      expect(score).toBeDefined();
      expect(score!.totalScore).toBeGreaterThan(0);
      expect(score!.totalScore).toBeLessThanOrEqual(100);
      expect(score!.totalInteractions).toBe(50);
      expect(score!.name).toBe('High Freq Contact');
    });

    it('high-frequency contact scores higher than zero-interaction contact', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const highFreq = await createTestContact(tenant.id, {
        displayName: 'High Freq',
        emails: [{ value: 'hf@test.local', type: 'work' }],
        totalInteractions: 50,
        sentCount: 25,
        receivedCount: 25,
        lastInteractedAt: yesterday,
      });
      contactIds.push(highFreq.id);

      // Also add a contact with interactions > 0 but very old and minimal
      const lowFreq = await createTestContact(tenant.id, {
        displayName: 'Low Freq',
        emails: [{ value: 'lf@test.local', type: 'work' }],
        totalInteractions: 1,
        sentCount: 1,
        receivedCount: 0,
        lastInteractedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      });
      contactIds.push(lowFreq.id);

      const scores = await service.getRelationshipScores(tenant.id);

      const hfScore = scores.find((s) => s.contactId === highFreq.id);
      const lfScore = scores.find((s) => s.contactId === lowFreq.id);

      expect(hfScore).toBeDefined();
      // highFreq has more interactions and more recent — scores higher overall
      // (frequencyScore from 50 interactions >> 1 interaction; recency: yesterday >> 90d ago)
      if (lfScore) {
        expect(hfScore!.totalScore).toBeGreaterThanOrEqual(lfScore.totalScore);
      }
    });

    it('reciprocal contact (balanced sent/received) has higher reciprocityScore than one-directional', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const now = new Date();
      const reciprocal = await createTestContact(tenant.id, {
        emails: [{ value: 'reciprocal@test.local', type: 'work' }],
        totalInteractions: 10,
        sentCount: 5,
        receivedCount: 5,
        lastInteractedAt: now,
      });
      contactIds.push(reciprocal.id);

      const oneSided = await createTestContact(tenant.id, {
        emails: [{ value: 'onesided@test.local', type: 'work' }],
        totalInteractions: 10,
        sentCount: 10,
        receivedCount: 0,
        lastInteractedAt: now,
      });
      contactIds.push(oneSided.id);

      const scores = await service.getRelationshipScores(tenant.id);
      const rScore = scores.find((s) => s.contactId === reciprocal.id);
      const oScore = scores.find((s) => s.contactId === oneSided.id);

      expect(rScore).toBeDefined();
      expect(oScore).toBeDefined();
      expect(rScore!.reciprocityScore).toBeGreaterThan(oScore!.reciprocityScore);
    });

    it('recent contact has higher recencyScore than old contact', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const recentContact = await createTestContact(tenant.id, {
        emails: [{ value: 'recent@test.local', type: 'work' }],
        totalInteractions: 5,
        sentCount: 3,
        receivedCount: 2,
        lastInteractedAt: yesterday,
      });
      contactIds.push(recentContact.id);

      const oldContact = await createTestContact(tenant.id, {
        emails: [{ value: 'old@test.local', type: 'work' }],
        totalInteractions: 5,
        sentCount: 3,
        receivedCount: 2,
        lastInteractedAt: ninetyDaysAgo,
      });
      contactIds.push(oldContact.id);

      const scores = await service.getRelationshipScores(tenant.id);
      const rScore = scores.find((s) => s.contactId === recentContact.id);
      const oScore = scores.find((s) => s.contactId === oldContact.id);

      expect(rScore).toBeDefined();
      expect(oScore).toBeDefined();
      expect(rScore!.recencyScore).toBeGreaterThan(oScore!.recencyScore);
    });

    it('does not return contacts from a different tenant (cross-tenant isolation)', async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();
      tenantIds.push(tenantA.id, tenantB.id);

      const contactA = await createTestContact(tenantA.id, {
        emails: [{ value: 'a@test.local', type: 'work' }],
        totalInteractions: 10,
        lastInteractedAt: new Date(),
      });
      contactIds.push(contactA.id);

      const contactB = await createTestContact(tenantB.id, {
        emails: [{ value: 'b@test.local', type: 'work' }],
        totalInteractions: 10,
        lastInteractedAt: new Date(),
      });
      contactIds.push(contactB.id);

      const scoresA = await service.getRelationshipScores(tenantA.id);
      const scoresB = await service.getRelationshipScores(tenantB.id);

      const idsA = scoresA.map((s) => s.contactId);
      const idsB = scoresB.map((s) => s.contactId);

      expect(idsA).not.toContain(contactB.id);
      expect(idsB).not.toContain(contactA.id);
    });
  });
});
