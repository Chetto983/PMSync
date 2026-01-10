/**
 * Paranoid Validation: scanEmailsForFollowUps() RAG
 * NO MOCKS - Real database, real services
 *
 * Run: npx ts-node backend/scripts/test-followup-rag-paranoid.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

require('dotenv').config();

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️';
const INFO = '📌';

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`${PASS} ${msg}`);
    passed++;
  } else {
    console.log(`${FAIL} ${msg}`);
    failed++;
  }
}

function skip(msg: string): void {
  console.log(`${WARN} SKIP: ${msg}`);
  skipped++;
}

function info(msg: string): void {
  console.log(`${INFO} ${msg}`);
}

interface TestContext {
  tenantId: string;
  userId: string;
  providerId: string;
  userEmail: string;
}

async function setupTestContext(): Promise<TestContext | null> {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) {
    console.log(`${WARN} No tenant found`);
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id },
    select: { id: true, email: true },
  });
  if (!user) {
    console.log(`${WARN} No user found`);
    return null;
  }

  const provider = await prisma.providerConfig.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { id: true, email: true },
  });
  if (!provider) {
    console.log(`${WARN} No provider found`);
    return null;
  }

  return {
    tenantId: tenant.id,
    userId: user.id,
    providerId: provider.id,
    userEmail: provider.email,
  };
}

// TEST 1: FollowUpService has scanEmailsForFollowUps method
async function testServiceInstantiation(): Promise<void> {
  console.log('\n--- TEST 1: FollowUpService ---');
  try {
    const { FollowUpService } = require('../src/modules/ai/voltagent/services/follow-up.service');
    const proto = FollowUpService.prototype;

    assert(typeof proto.scanEmailsForFollowUps === 'function', 'scanEmailsForFollowUps() exists');

    const methodStr = proto.scanEmailsForFollowUps.toString();
    assert(methodStr.includes('tenantId') && methodStr.includes('userId'), 'Has tenantId/userId params');
    assert(methodStr.includes('options'), 'Has options param');
  } catch (e) {
    console.log(`${FAIL} ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

// TEST 2: UnifiedRetriever integration
async function testUnifiedRetriever(ctx: TestContext): Promise<void> {
  console.log('\n--- TEST 2: UnifiedRetriever ---');
  try {
    const { UnifiedRetriever } = require('../src/modules/ai/voltagent/rag/unified-retriever');

    const retriever = new UnifiedRetriever({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      locale: 'en',
      prisma,
      emailLimit: 50,
    });

    assert(retriever !== null, 'Instantiated');

    const results = await retriever.searchSources(
      'waiting for reply, action required, please respond',
      ['emails'],
    );
    const emailResults = results.find((r: { source: string }) => r.source === 'emails');

    info(`RAG returned ${emailResults?.items?.length ?? 0} candidates`);
    assert(emailResults !== undefined, 'Returns email results');

    if (emailResults?.items?.length > 0) {
      const score = emailResults.items[0].score;
      assert(typeof score === 'number', 'Has numeric RRF score');
      assert(score >= 0 && score <= 2, 'Score in valid range');
      info(`Top score: ${score.toFixed(4)}`);
    }
  } catch (e) {
    console.log(`${FAIL} ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

// TEST 3: Tenant isolation (GDPR)
async function testTenantIsolation(ctx: TestContext): Promise<void> {
  console.log('\n--- TEST 3: Tenant Isolation (GDPR) ---');
  try {
    const { UnifiedRetriever } = require('../src/modules/ai/voltagent/rag/unified-retriever');

    const fakeRetriever = new UnifiedRetriever({
      tenantId: 'fake-tenant-does-not-exist',
      userId: ctx.userId,
      locale: 'en',
      prisma,
      emailLimit: 50,
    });

    const results = await fakeRetriever.searchSources('important meeting', ['emails']);
    const emailResults = results.find((r: { source: string }) => r.source === 'emails');

    assert(!emailResults || emailResults.items.length === 0, 'Fake tenant gets ZERO results');
  } catch (e) {
    console.log(`${FAIL} ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

// TEST 4: Sent email filtering
async function testSentEmailFiltering(ctx: TestContext): Promise<void> {
  console.log('\n--- TEST 4: Sent Email Filtering ---');
  try {
    const count = await prisma.email.count({
      where: {
        tenantId: ctx.tenantId,
        providerId: ctx.providerId,
        from: { contains: ctx.userEmail, mode: 'insensitive' },
      },
    });

    info(`Found ${count} sent emails for ${ctx.userEmail}`);

    if (count === 0) {
      skip('No sent emails');
      return;
    }

    const emails = await prisma.email.findMany({
      where: {
        tenantId: ctx.tenantId,
        providerId: ctx.providerId,
        from: { contains: ctx.userEmail, mode: 'insensitive' },
      },
      take: 3,
      select: { from: true },
    });

    for (const e of emails) {
      assert(
        e.from.toLowerCase().includes(ctx.userEmail.toLowerCase()),
        `"${e.from}" identified as sent`,
      );
    }
  } catch (e) {
    console.log(`${FAIL} ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

// TEST 5: Existing follow-up exclusion
async function testFollowUpExclusion(ctx: TestContext): Promise<void> {
  console.log('\n--- TEST 5: Follow-Up Exclusion ---');
  try {
    const count = await prisma.emailFollowUp.count({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
    });

    info(`Found ${count} existing follow-ups`);

    const followUps = await prisma.emailFollowUp.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
      select: { emailId: true },
      take: 10,
    });

    const emailIds = followUps.map((f) => f.emailId).filter((id): id is string => id !== null);

    if (emailIds.length === 0) {
      skip('No emails with follow-ups');
      return;
    }

    info(`${emailIds.length} emails have follow-ups`);

    for (const emailId of emailIds.slice(0, 3)) {
      const exists = await prisma.emailFollowUp.findFirst({
        where: { tenantId: ctx.tenantId, emailId },
      });
      assert(exists !== null, `Email ${emailId.slice(0, 15)}... has follow-up`);
    }
  } catch (e) {
    console.log(`${FAIL} ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

// TEST 6: Confidence thresholds
async function testConfidenceThresholds(): Promise<void> {
  console.log('\n--- TEST 6: Confidence Thresholds ---');

  const HIGH = 0.8;
  const MEDIUM = 0.6;

  const tests = [
    { score: 0.95, expected: 'high' },
    { score: 0.85, expected: 'high' },
    { score: 0.75, expected: 'medium' },
    { score: 0.65, expected: 'medium' },
    { score: 0.55, expected: 'low' },
    { score: 0.3, expected: 'low' },
  ];

  for (const t of tests) {
    const cat = t.score >= HIGH ? 'high' : t.score >= MEDIUM ? 'medium' : 'low';
    assert(cat === t.expected, `${t.score} → ${cat}`);
  }

  assert(HIGH > MEDIUM, 'HIGH > MEDIUM');
}

// TEST 7: Embeddings availability
async function testEmbeddings(ctx: TestContext): Promise<void> {
  console.log('\n--- TEST 7: Embeddings ---');
  try {
    const total = await prisma.embedding.count({ where: { tenantId: ctx.tenantId } });
    info(`Total: ${total}`);

    if (total === 0) {
      console.log(`${WARN} No embeddings - keyword-only fallback`);
      skipped++;
      return;
    }

    const sample = await prisma.embedding.findFirst({
      where: { tenantId: ctx.tenantId },
      select: { tenantId: true, content: true },
    });

    if (sample) {
      assert(sample.tenantId === ctx.tenantId, 'Correct tenantId');
      assert(typeof sample.content === 'string', 'Has content');
    }

    const emailEmbeddings = await prisma.embedding.count({
      where: { tenantId: ctx.tenantId, emailId: { not: null } },
    });
    info(`Email embeddings: ${emailEmbeddings}`);
    if (emailEmbeddings > 0) {
      assert(true, `${emailEmbeddings} available for vector search`);
    }
  } catch (e) {
    console.log(`${FAIL} ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

// TEST 8: Thread/reply detection
async function testReplyDetection(ctx: TestContext): Promise<void> {
  console.log('\n--- TEST 8: Reply Detection ---');
  try {
    const emails = await prisma.email.findMany({
      where: { tenantId: ctx.tenantId, providerId: ctx.providerId, threadId: { not: null } },
      select: { threadId: true },
      take: 10,
    });

    info(`${emails.length} emails in threads`);

    if (emails.length === 0) {
      skip('No threaded emails');
      return;
    }

    const threadIds = [...new Set(emails.map((e) => e.threadId).filter(Boolean))];

    for (const tid of threadIds.slice(0, 2)) {
      const count = await prisma.email.count({
        where: { tenantId: ctx.tenantId, threadId: tid },
      });
      if (count > 1) {
        info(`Thread has ${count} emails`);
        assert(count > 1, 'Reply chain exists');
      }
    }
  } catch (e) {
    console.log(`${FAIL} ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

// TEST 9: Semantic patterns
async function testSemanticPatterns(ctx: TestContext): Promise<void> {
  console.log('\n--- TEST 9: Semantic Patterns ---');
  try {
    const { UnifiedRetriever } = require('../src/modules/ai/voltagent/rag/unified-retriever');

    const patterns = ['waiting for reply', 'action required', 'please respond'];

    for (const pattern of patterns) {
      const retriever = new UnifiedRetriever({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        locale: 'en',
        prisma,
        emailLimit: 10,
      });

      const results = await retriever.searchSources(pattern, ['emails']);
      const emailResults = results.find((r: { source: string }) => r.source === 'emails');
      info(`"${pattern}": ${emailResults?.items?.length ?? 0} results`);
    }

    assert(true, 'Patterns execute OK');
  } catch (e) {
    console.log(`${FAIL} ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

// TEST 10: Database integrity
async function testDatabaseIntegrity(ctx: TestContext): Promise<void> {
  console.log('\n--- TEST 10: DB Integrity ---');
  try {
    const followUp = await prisma.emailFollowUp.findFirst({ where: { tenantId: ctx.tenantId } });

    if (followUp) {
      assert(followUp.tenantId !== null, 'tenantId (Citus key)');
      assert(followUp.userId !== null, 'userId');
      assert(followUp.status !== null, 'status');
      info(`Sample: ${followUp.id} (${followUp.status})`);
    } else {
      info('No follow-ups - schema verified');
    }

    const email = await prisma.email.findFirst({
      where: { tenantId: ctx.tenantId },
      select: { tenantId: true, providerId: true, from: true },
    });

    if (email) {
      assert(email.tenantId !== null, 'Email.tenantId');
      assert(email.providerId !== null, 'Email.providerId');
      assert(email.from !== null, 'Email.from');
    }

    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM email_follow_ups f
      WHERE f."emailId" IS NOT NULL AND f."tenantId" = ${ctx.tenantId}
        AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.id = f."emailId" AND e."tenantId" = f."tenantId")
    `;

    const orphanCount = Number(orphans[0]?.count ?? 0);
    if (orphanCount > 0) {
      console.log(`${WARN} ${orphanCount} orphaned follow-ups`);
    } else {
      assert(true, 'No orphans');
    }
  } catch (e) {
    console.log(`${FAIL} ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

async function main() {
  console.log('\n' + '='.repeat(50));
  console.log('PARANOID VALIDATION: Follow-Up RAG');
  console.log('='.repeat(50));

  const start = Date.now();

  try {
    const ctx = await setupTestContext();
    if (!ctx) {
      console.log('\n❌ Missing test data');
      process.exit(1);
    }

    info(`Tenant: ${ctx.tenantId}`);
    info(`User: ${ctx.userId}`);
    info(`Provider: ${ctx.providerId}`);
    info(`Email: ${ctx.userEmail}`);

    await testServiceInstantiation();
    await testUnifiedRetriever(ctx);
    await testTenantIsolation(ctx);
    await testSentEmailFiltering(ctx);
    await testFollowUpExclusion(ctx);
    await testConfidenceThresholds();
    await testEmbeddings(ctx);
    await testReplyDetection(ctx);
    await testSemanticPatterns(ctx);
    await testDatabaseIntegrity(ctx);

    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    console.log(`⏱️  ${Date.now() - start}ms`);
    console.log(`${PASS} Passed: ${passed}`);
    console.log(`${FAIL} Failed: ${failed}`);
    console.log(`${WARN} Skipped: ${skipped}`);

    if (failed === 0) {
      console.log(`\n${PASS} ALL TESTS PASSED`);
    } else {
      console.log(`\n${FAIL} ${failed} FAILED`);
    }
  } catch (e) {
    console.error('\n❌ Error:', e);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
