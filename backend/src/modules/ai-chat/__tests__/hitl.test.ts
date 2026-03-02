/**
 * HitlService -- Real Prisma integration tests for HITL action lifecycle.
 *
 * Requires: POSTGRES_URL (DATABASE_URL) environment variable pointing to a running database.
 * Tests the full ActionQueue lifecycle: create pending, approve, reject, modify.
 *
 * Phase 24 Plan 03: E2E Validation Gate (AI-05, AI-08)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import 'dotenv/config';
import { PrismaClient, ActionStatus, ActionType } from '@prisma/client';
import { createPrismaClient } from '../../../prisma/prisma-client.factory';
import { HitlService } from '../services/hitl.service';

describe('HitlService (real Prisma)', () => {
  let prisma: PrismaClient;
  let service: HitlService;
  let testTenantId: string;
  let testUserId: string;
  const cleanupActionIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();

    service = new HitlService(prisma as any);

    // Find existing test tenant and user
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) throw new Error('No tenant found in database. Seed required.');
    testTenantId = tenant.id;

    const user = await prisma.user.findFirst({
      where: { tenantId: testTenantId },
      select: { id: true },
    });
    if (!user) throw new Error('No user found in database. Seed required.');
    testUserId = user.id;
  }, 15_000);

  afterEach(async () => {
    // Clean up test actions
    for (const id of cleanupActionIds) {
      await prisma.actionQueue
        .delete({ where: { id } })
        .catch(() => {}); // Ignore if already deleted
    }
    cleanupActionIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a pending action with 1-hour expiry', async () => {
    const beforeCreate = Date.now();

    const action = await service.createPendingAction({
      tenantId: testTenantId,
      userId: testUserId,
      conversationId: 'test-conv-1',
      actionType: 'SEND_EMAIL',
      actionPayload: { to: 'a@b.com', subject: 'Test', body: 'Hello' },
      confidence: 0.85,
      reasoning: 'User requested email send',
    });
    cleanupActionIds.push(action.id);

    expect(action.id).toBeTruthy();
    expect(action.status).toBe(ActionStatus.PENDING_APPROVAL);
    expect(action.actionType).toBe(ActionType.SEND_EMAIL);
    expect(action.confidence).toBe(0.85);
    expect(action.reasoning).toBe('User requested email send');

    // Verify expiresAt is approximately 1 hour from now (+/- 5 seconds)
    const expiresMs = action.expiresAt!.getTime();
    const expectedMs = beforeCreate + 60 * 60 * 1000;
    expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(5000);
  }, 10_000);

  it('approveAction changes status and records approver', async () => {
    const action = await service.createPendingAction({
      tenantId: testTenantId,
      userId: testUserId,
      conversationId: 'test-conv-2',
      actionType: 'SEND_EMAIL',
      actionPayload: { to: 'a@b.com' },
      confidence: 0.9,
      reasoning: 'Approve test',
    });
    cleanupActionIds.push(action.id);

    const approved = await service.approveAction(
      action.id,
      testTenantId,
      testUserId,
    );

    expect(approved.status).toBe(ActionStatus.APPROVED);
    expect(approved.approvedBy).toBe(testUserId);
    expect(approved.approvedAt).toBeInstanceOf(Date);
  }, 10_000);

  it('rejectAction changes status and records reason', async () => {
    const action = await service.createPendingAction({
      tenantId: testTenantId,
      userId: testUserId,
      conversationId: 'test-conv-3',
      actionType: 'SEND_EMAIL',
      actionPayload: { to: 'x@y.com' },
      confidence: 0.7,
      reasoning: 'Reject test',
    });
    cleanupActionIds.push(action.id);

    const rejected = await service.rejectAction(
      action.id,
      testTenantId,
      testUserId,
      'Not needed',
    );

    expect(rejected.status).toBe(ActionStatus.REJECTED);
    expect(rejected.rejectedReason).toBe('Not needed');
  }, 10_000);

  it('approveAction with modifiedPayload updates the payload', async () => {
    const action = await service.createPendingAction({
      tenantId: testTenantId,
      userId: testUserId,
      conversationId: 'test-conv-4',
      actionType: 'SEND_EMAIL',
      actionPayload: { to: 'a@b.com', subject: 'Original' },
      confidence: 0.8,
      reasoning: 'Modify test',
    });
    cleanupActionIds.push(action.id);

    const modified = await service.approveAction(
      action.id,
      testTenantId,
      testUserId,
      { to: 'c@d.com', subject: 'Modified' },
    );

    expect(modified.status).toBe(ActionStatus.APPROVED);
    // The payload should be updated to the modified version
    const payload = modified.actionPayload as Record<string, unknown>;
    expect(payload.to).toBe('c@d.com');
    expect(payload.subject).toBe('Modified');
  }, 10_000);
});
