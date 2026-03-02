/**
 * ConversationService -- Real Prisma integration tests.
 *
 * Requires: POSTGRES_URL (DATABASE_URL) environment variable pointing to a running database.
 * These tests create real records and clean up after themselves.
 *
 * Phase 24 Plan 03: E2E Validation Gate
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../../prisma/prisma-client.factory';
import { ConversationService } from '../services/conversation.service';

describe('ConversationService (real Prisma)', () => {
  let prisma: PrismaClient;
  let service: ConversationService;
  let testTenantId: string;
  let testUserId: string;
  const cleanupConversationIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();

    // Cast to the expected PrismaService shape -- TestPrismaService has all the same Prisma methods
    service = new ConversationService(prisma as any);

    // Find or create test tenant and user
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
    // Clean up test conversations
    for (const id of cleanupConversationIds) {
      await prisma.aiConversation
        .delete({ where: { id } })
        .catch(() => {}); // Ignore if already deleted
    }
    cleanupConversationIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates and retrieves a conversation', async () => {
    const conversation = await service.createConversation(testTenantId, testUserId);
    cleanupConversationIds.push(conversation.id);

    expect(conversation.id).toBeTruthy();
    expect(conversation.tenantId).toBe(testTenantId);
    expect(conversation.userId).toBe(testUserId);

    // Retrieve with matching tenant
    const retrieved = await service.getConversation(conversation.id, testTenantId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(conversation.id);

    // Retrieve with wrong tenant -- should return null (tenant isolation)
    const wrongTenant = await service.getConversation(conversation.id, 'nonexistent-tenant');
    expect(wrongTenant).toBeNull();
  }, 10_000);

  it('saves and loads messages in correct order', async () => {
    const conversation = await service.createConversation(testTenantId, testUserId);
    cleanupConversationIds.push(conversation.id);

    // Save alternating user/assistant messages
    await service.saveUserMessage(conversation.id, 'Hello');
    await service.saveAssistantMessage(conversation.id, { type: 'text', text: 'Hi there!' });
    await service.saveUserMessage(conversation.id, 'How are you?');
    await service.saveAssistantMessage(conversation.id, { type: 'text', text: 'Doing well!' });
    await service.saveUserMessage(conversation.id, 'Great');
    await service.saveAssistantMessage(conversation.id, { type: 'text', text: 'Anything else?' });

    const messages = await service.getMessagesForContext(conversation.id);

    // Should have 6 messages in chronological order
    expect(messages.length).toBe(6);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].role).toBe('assistant');
    expect(messages[5].role).toBe('assistant');
  }, 10_000);

  it('getMessagesForContext returns last N messages when >N exist', async () => {
    const conversation = await service.createConversation(testTenantId, testUserId);
    cleanupConversationIds.push(conversation.id);

    // Save 15 messages
    for (let i = 0; i < 15; i++) {
      if (i % 2 === 0) {
        await service.saveUserMessage(conversation.id, `User message ${i}`);
      } else {
        await service.saveAssistantMessage(conversation.id, {
          type: 'text',
          text: `Assistant message ${i}`,
        });
      }
    }

    // Request only last 10
    const messages = await service.getMessagesForContext(conversation.id, 10);
    // Should return 10 messages (the most recent)
    expect(messages.length).toBe(10);

    // Verify summary prepend when summary exists
    await service.updateConversationSummary(conversation.id, 'Test summary of earlier messages');
    const messagesWithSummary = await service.getMessagesForContext(conversation.id, 10);
    // Should have summary as first system message + 10 recent messages
    expect(messagesWithSummary.length).toBe(11);
    expect(messagesWithSummary[0].role).toBe('system');
    expect(String(messagesWithSummary[0].content)).toContain('Test summary');
  }, 15_000);

  it('deleteConversation cascades to messages', async () => {
    const conversation = await service.createConversation(testTenantId, testUserId);
    // Don't add to cleanup -- we're deleting it manually

    await service.saveUserMessage(conversation.id, 'Will be deleted');
    await service.saveAssistantMessage(conversation.id, { type: 'text', text: 'Me too' });

    // Verify messages exist
    const count = await service.getMessageCount(conversation.id);
    expect(count).toBe(2);

    // Delete conversation
    await service.deleteConversation(conversation.id, testTenantId);

    // Verify conversation is gone
    const deleted = await service.getConversation(conversation.id, testTenantId);
    expect(deleted).toBeNull();

    // Verify messages are cascade-deleted
    const remainingMessages = await prisma.aiMessage.count({
      where: { conversationId: conversation.id },
    });
    expect(remainingMessages).toBe(0);
  }, 10_000);
});
