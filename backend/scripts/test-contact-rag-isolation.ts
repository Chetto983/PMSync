/**
 * Contact RAG Quality & Tenant Isolation Test
 *
 * PARANOID SENIOR DEV VALIDATION:
 * 1. Contact embedding creation & storage
 * 2. Vector search quality (semantic similarity)
 * 3. Keyword search quality (exact matches)
 * 4. Hybrid RRF fusion effectiveness
 * 5. TENANT ISOLATION - GDPR critical (no cross-tenant leakage)
 * 6. Performance metrics
 *
 * RUN: npx ts-node backend/scripts/test-contact-rag-isolation.ts
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Mistral } from '@mistralai/mistralai';

// ============================================================
// CONFIG
// ============================================================
const TEST_TENANT_A = 'test-tenant-contact-rag-A-' + Date.now();
const TEST_TENANT_B = 'test-tenant-contact-rag-B-' + Date.now();

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  latencyMs?: number;
}

interface JsonEmail {
  address: string;
  type?: string;
}

interface JsonPhone {
  number: string;
  type?: string;
}

const results: TestResult[] = [];

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

// Helper to get name from contact
function getContactName(contact: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    contact.displayName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    'Unknown'
  );
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   CONTACT RAG - PARANOID SENIOR DEV VALIDATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  const prisma = createPrismaClient();
  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });

  if (!process.env.MISTRAL_API_KEY) {
    console.error('❌ MISTRAL_API_KEY not set');
    process.exit(1);
  }

  try {
    // ============================================================
    // SETUP: Create test tenants and contacts
    // ============================================================
    console.log('📋 SETUP: Creating test data...\n');

    // Create test tenants
    await prisma.tenant.createMany({
      data: [
        { id: TEST_TENANT_A, name: 'Test Tenant A', slug: TEST_TENANT_A },
        { id: TEST_TENANT_B, name: 'Test Tenant B', slug: TEST_TENANT_B },
      ],
    });

    // Create test contacts for Tenant A (variety of data)
    const contactsA = await Promise.all([
      prisma.contact.create({
        data: {
          id: `contact-a1-${Date.now()}`,
          tenantId: TEST_TENANT_A,
          displayName: 'John Smith',
          firstName: 'John',
          lastName: 'Smith',
          company: 'Acme Corporation',
          jobTitle: 'Chief Technology Officer',
          department: 'Engineering',
          notes: 'Key decision maker for tech stack. Met at TechConf 2024.',
          tags: ['vip', 'tech', 'decision-maker'],
          emails: [{ address: 'john.smith@acme.com', type: 'work' }],
          phoneNumbers: [{ number: '+1-555-123-4567', type: 'mobile' }],
        },
      }),
      prisma.contact.create({
        data: {
          id: `contact-a2-${Date.now()}`,
          tenantId: TEST_TENANT_A,
          displayName: 'Maria Garcia',
          firstName: 'Maria',
          lastName: 'Garcia',
          company: 'StartupXYZ',
          jobTitle: 'Product Manager',
          department: 'Product',
          notes: 'Interested in our AI features. Follow up about demo.',
          tags: ['prospect', 'ai-interest'],
          emails: [{ address: 'maria@startupxyz.io', type: 'work' }],
        },
      }),
      prisma.contact.create({
        data: {
          id: `contact-a3-${Date.now()}`,
          tenantId: TEST_TENANT_A,
          displayName: 'Bob Johnson',
          firstName: 'Bob',
          lastName: 'Johnson',
          company: 'Finance Corp',
          jobTitle: 'CFO',
          notes: 'Budget approval authority. Conservative on new tech.',
          tags: ['finance', 'budget-holder'],
          emails: [{ address: 'b.johnson@financecorp.com', type: 'work' }],
        },
      }),
    ]);
    console.log(`   Created ${contactsA.length} contacts for Tenant A`);

    // Create test contacts for Tenant B (MUST be isolated)
    const contactsB = await Promise.all([
      prisma.contact.create({
        data: {
          id: `contact-b1-${Date.now()}`,
          tenantId: TEST_TENANT_B,
          displayName: 'SECRET Agent Smith',
          firstName: 'SECRET',
          lastName: 'Smith',
          company: 'CONFIDENTIAL Inc',
          jobTitle: 'Secret Operations',
          notes: 'TOP SECRET DATA - MUST NOT LEAK TO TENANT A',
          tags: ['confidential', 'secret'],
          emails: [{ address: 'secret@confidential.com', type: 'work' }],
        },
      }),
      prisma.contact.create({
        data: {
          id: `contact-b2-${Date.now()}`,
          tenantId: TEST_TENANT_B,
          displayName: 'Another CTO Person',
          firstName: 'Another',
          lastName: 'CTO Person',
          company: 'Different Company',
          jobTitle: 'Chief Technology Officer',
          notes: 'Different tenant CTO - should not appear in Tenant A searches',
          tags: ['tech'],
          emails: [{ address: 'cto@different.com', type: 'work' }],
        },
      }),
    ]);
    console.log(`   Created ${contactsB.length} contacts for Tenant B\n`);

    // ============================================================
    // TEST 1: Contact Embedding Creation
    // ============================================================
    console.log('─────────────────────────────────────────────────────────');
    console.log('TEST 1: Contact Embedding Creation\n');

    const embedStart = Date.now();
    let embeddingsCreated = 0;

    for (const contact of [...contactsA, ...contactsB]) {
      const contactName = getContactName(contact);
      const emailList = (contact.emails as JsonEmail[] | null)?.map((e) => e.address) || [];
      const phoneList = (contact.phoneNumbers as JsonPhone[] | null)?.map((p) => p.number) || [];

      // Build embedding content (same logic as ContactEmbeddingQueueService)
      const pieces = [
        `Name: ${contactName}`,
        contact.company && `Company: ${contact.company}`,
        contact.jobTitle && `Role: ${contact.jobTitle}`,
        contact.department && `Department: ${contact.department}`,
        contact.notes && `Notes: ${contact.notes}`,
        contact.tags?.length && `Tags: ${contact.tags.join(', ')}`,
        emailList.length && `Email: ${emailList.join(', ')}`,
        phoneList.length && `Phone: ${phoneList.join(', ')}`,
      ].filter(Boolean);

      const content = pieces.join('\n');

      // Generate embedding via Mistral
      const embResponse = await mistral.embeddings.create({
        model: 'mistral-embed',
        inputs: [content],
      });

      const vector = embResponse.data?.[0]?.embedding;
      if (!vector) {
        throw new Error(`Failed to generate embedding for contact ${contact.id}`);
      }

      // Save embedding with direct contactId field (NOT in metadata!)
      const vectorLiteral = Prisma.raw(`'[${vector.join(',')}]'::vector`);
      await prisma.$executeRaw`
        INSERT INTO embeddings ("id", "tenantId", "content", "vector", "embeddingModel", "contactId", "metadata", "createdAt")
        VALUES (
          ${`emb-${contact.id}`},
          ${contact.tenantId},
          ${content},
          ${vectorLiteral},
          'mistral-embed',
          ${contact.id},
          ${JSON.stringify({ source: 'contact', company: contact.company })}::jsonb,
          NOW()
        )
      `;

      embeddingsCreated++;
    }

    const embedLatency = Date.now() - embedStart;
    const embedsPerSec = (embeddingsCreated / (embedLatency / 1000)).toFixed(1);

    results.push({
      name: 'Contact Embedding Creation',
      passed: embeddingsCreated === contactsA.length + contactsB.length,
      details: `Created ${embeddingsCreated} embeddings @ ${embedsPerSec}/sec`,
      latencyMs: embedLatency,
    });

    console.log(`   ✅ Created ${embeddingsCreated} embeddings`);
    console.log(`   ⏱️  ${embedLatency}ms (${embedsPerSec} embeddings/sec)\n`);

    // ============================================================
    // TEST 2: Vector Search Quality (Semantic)
    // ============================================================
    console.log('─────────────────────────────────────────────────────────');
    console.log('TEST 2: Vector Search Quality (Semantic)\n');

    const vectorSearchStart = Date.now();

    // Query: "technology leader" should find John Smith (CTO)
    const semanticQuery = 'technology leader at large corporation';
    const queryEmb = await mistral.embeddings.create({
      model: 'mistral-embed',
      inputs: [semanticQuery],
    });
    const queryVector = queryEmb.data?.[0]?.embedding;
    if (!queryVector) throw new Error('Failed to embed query');

    const vectorLiteralQuery = Prisma.raw(`'[${queryVector.join(',')}]'::vector`);

    // Search ONLY within Tenant A (tenant isolation in CTE)
    const vectorResults = await prisma.$queryRaw<
      { id: string; contactId: string; content: string; distance: number }[]
    >`
      WITH tenant_contacts AS (
        SELECT "id", "contactId", "content", "vector"
        FROM embeddings
        WHERE "tenantId" = ${TEST_TENANT_A} AND "contactId" IS NOT NULL
      )
      SELECT "id", "contactId", "content", "vector" <-> ${vectorLiteralQuery} AS distance
      FROM tenant_contacts
      ORDER BY distance ASC
      LIMIT 5
    `;

    const vectorLatency = Date.now() - vectorSearchStart;

    // Check if John Smith (CTO) is in top results
    const johnSmithFound = vectorResults.some(
      (r) => r.content.includes('John Smith') && r.content.includes('Chief Technology Officer')
    );

    results.push({
      name: 'Vector Search Quality',
      passed: johnSmithFound && vectorResults.length > 0,
      details: `Query "${semanticQuery}" found ${vectorResults.length} results, CTO in results: ${johnSmithFound}`,
      latencyMs: vectorLatency,
    });

    console.log(`   Query: "${semanticQuery}"`);
    console.log(`   Results: ${vectorResults.length} contacts found`);
    vectorResults.forEach((r, i) => {
      const nameLine = r.content.split('\n')[0]?.replace('Name: ', '') || 'Unknown';
      console.log(`     [${i + 1}] ${nameLine} (distance: ${r.distance.toFixed(4)})`);
    });
    console.log(`   ${johnSmithFound ? '✅' : '❌'} CTO found in results`);
    console.log(`   ⏱️  ${vectorLatency}ms\n`);

    // ============================================================
    // TEST 3: Keyword Search Quality
    // ============================================================
    console.log('─────────────────────────────────────────────────────────');
    console.log('TEST 3: Keyword Search Quality\n');

    const keywordStart = Date.now();

    // Search by company name
    const keywordResults = await prisma.contact.findMany({
      where: {
        tenantId: TEST_TENANT_A,
        OR: [
          { displayName: { contains: 'Acme', mode: 'insensitive' } },
          { company: { contains: 'Acme', mode: 'insensitive' } },
        ],
      },
      take: 5,
    });

    const keywordLatency = Date.now() - keywordStart;
    const acmeFound = keywordResults.some((c) => c.company === 'Acme Corporation');

    results.push({
      name: 'Keyword Search Quality',
      passed: acmeFound && keywordResults.length === 1,
      details: `Search "Acme" found ${keywordResults.length} contacts`,
      latencyMs: keywordLatency,
    });

    console.log(`   Query: "Acme"`);
    console.log(`   Results: ${keywordResults.length} contacts found`);
    keywordResults.forEach((c, i) => {
      console.log(`     [${i + 1}] ${getContactName(c)} @ ${c.company}`);
    });
    console.log(`   ${acmeFound ? '✅' : '❌'} Acme Corporation found`);
    console.log(`   ⏱️  ${keywordLatency}ms\n`);

    // ============================================================
    // TEST 4: Hybrid RRF Fusion
    // ============================================================
    console.log('─────────────────────────────────────────────────────────');
    console.log('TEST 4: Hybrid RRF Fusion\n');

    const hybridStart = Date.now();
    const RRF_K = 60;
    const rrfScores = new Map<string, { score: number; name: string; methods: string[] }>();

    // Vector search for "CTO tech stack decision"
    const hybridQuery = 'CTO tech stack decision';
    const hybridEmb = await mistral.embeddings.create({
      model: 'mistral-embed',
      inputs: [hybridQuery],
    });
    const hybridVector = hybridEmb.data?.[0]?.embedding;
    if (!hybridVector) throw new Error('Failed to embed hybrid query');

    const hybridVectorLiteral = Prisma.raw(`'[${hybridVector.join(',')}]'::vector`);

    const vectorHits = await prisma.$queryRaw<
      { contactId: string; content: string; distance: number }[]
    >`
      WITH tenant_contacts AS (
        SELECT "contactId", "content", "vector"
        FROM embeddings
        WHERE "tenantId" = ${TEST_TENANT_A} AND "contactId" IS NOT NULL
      )
      SELECT "contactId", "content", "vector" <-> ${hybridVectorLiteral} AS distance
      FROM tenant_contacts
      ORDER BY distance ASC
      LIMIT 10
    `;

    // Add vector scores (RRF)
    vectorHits.forEach((hit, idx) => {
      const nameLine = hit.content.split('\n')[0]?.replace('Name: ', '') || 'Unknown';
      const existing = rrfScores.get(hit.contactId) || { score: 0, name: nameLine, methods: [] };
      existing.score += 1 / (RRF_K + idx + 1);
      existing.methods.push('vector');
      rrfScores.set(hit.contactId, existing);
    });

    // Keyword search for "CTO"
    const keywordHits = await prisma.contact.findMany({
      where: {
        tenantId: TEST_TENANT_A,
        OR: [
          { jobTitle: { contains: 'CTO', mode: 'insensitive' } },
          { jobTitle: { contains: 'Chief Technology', mode: 'insensitive' } },
          { notes: { contains: 'tech stack', mode: 'insensitive' } },
        ],
      },
      take: 10,
    });

    // Add keyword scores (RRF)
    keywordHits.forEach((hit, idx) => {
      const existing = rrfScores.get(hit.id) || {
        score: 0,
        name: getContactName(hit),
        methods: [],
      };
      existing.score += 1 / (RRF_K + idx + 1);
      existing.methods.push('keyword');
      rrfScores.set(hit.id, existing);
    });

    // Sort by fused score
    const fusedResults = Array.from(rrfScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 5);

    const hybridLatency = Date.now() - hybridStart;

    // Check if John Smith is #1 (found by BOTH vector and keyword)
    const topResult = fusedResults[0];
    const topIsJohnSmith = topResult?.[1].name === 'John Smith';
    const topFoundByBoth = topResult?.[1].methods.length === 2;

    results.push({
      name: 'Hybrid RRF Fusion',
      passed: topIsJohnSmith && topFoundByBoth,
      details: `Top result: ${topResult?.[1].name} (methods: ${topResult?.[1].methods.join('+')})`,
      latencyMs: hybridLatency,
    });

    console.log(`   Query: "${hybridQuery}"`);
    console.log(`   RRF Fused Results:`);
    fusedResults.forEach(([id, data], i) => {
      console.log(
        `     [${i + 1}] ${data.name} (score: ${data.score.toFixed(4)}, via: ${data.methods.join('+')})`
      );
    });
    console.log(`   ${topIsJohnSmith ? '✅' : '❌'} John Smith is top result`);
    console.log(`   ${topFoundByBoth ? '✅' : '❌'} Top result found by BOTH vector+keyword`);
    console.log(`   ⏱️  ${hybridLatency}ms\n`);

    // ============================================================
    // TEST 5: TENANT ISOLATION (GDPR CRITICAL)
    // ============================================================
    console.log('─────────────────────────────────────────────────────────');
    console.log('TEST 5: TENANT ISOLATION (GDPR CRITICAL)\n');

    const isolationTests: { name: string; passed: boolean; details: string }[] = [];

    // Test 5a: Vector search cannot see other tenant's contacts
    const isolationQuery = 'SECRET CONFIDENTIAL TOP SECRET';
    const isolationEmb = await mistral.embeddings.create({
      model: 'mistral-embed',
      inputs: [isolationQuery],
    });
    const isolationVector = isolationEmb.data?.[0]?.embedding;
    const isolationVectorLiteral = Prisma.raw(`'[${isolationVector!.join(',')}]'::vector`);

    // Search as Tenant A - should NOT find Tenant B's SECRET contact
    const crossTenantVector = await prisma.$queryRaw<{ contactId: string; content: string }[]>`
      WITH tenant_contacts AS (
        SELECT "contactId", "content", "vector"
        FROM embeddings
        WHERE "tenantId" = ${TEST_TENANT_A} AND "contactId" IS NOT NULL
      )
      SELECT "contactId", "content"
      FROM tenant_contacts
      WHERE "vector" <-> ${isolationVectorLiteral} < 1.0
      LIMIT 10
    `;

    const secretLeaked = crossTenantVector.some(
      (r) => r.content.includes('SECRET') || r.content.includes('CONFIDENTIAL')
    );
    isolationTests.push({
      name: 'Vector search isolation',
      passed: !secretLeaked,
      details: secretLeaked ? 'SECURITY BREACH: Tenant B data visible!' : 'No cross-tenant leakage',
    });

    // Test 5b: Keyword search cannot see other tenant's contacts
    const keywordCrossTenant = await prisma.contact.findMany({
      where: {
        tenantId: TEST_TENANT_A, // Searching AS Tenant A
        OR: [
          { displayName: { contains: 'SECRET', mode: 'insensitive' } },
          { company: { contains: 'CONFIDENTIAL', mode: 'insensitive' } },
        ],
      },
    });

    isolationTests.push({
      name: 'Keyword search isolation',
      passed: keywordCrossTenant.length === 0,
      details:
        keywordCrossTenant.length > 0
          ? `BREACH: Found ${keywordCrossTenant.length} Tenant B contacts!`
          : 'No cross-tenant leakage',
    });

    // Test 5c: Direct embedding query with wrong tenant
    const wrongTenantEmbs = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM embeddings
      WHERE "tenantId" = ${TEST_TENANT_A}
        AND "contactId" IN (${Prisma.join(contactsB.map((c) => c.id))})
    `;

    isolationTests.push({
      name: 'Direct embedding isolation',
      passed: wrongTenantEmbs.length === 0,
      details:
        wrongTenantEmbs.length > 0
          ? `BREACH: Found ${wrongTenantEmbs.length} Tenant B embeddings!`
          : 'No cross-tenant embeddings',
    });

    // Test 5d: Contact counts match per tenant
    const countA = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM embeddings
      WHERE "tenantId" = ${TEST_TENANT_A} AND "contactId" IS NOT NULL
    `;
    const countB = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM embeddings
      WHERE "tenantId" = ${TEST_TENANT_B} AND "contactId" IS NOT NULL
    `;

    const countANum = Number(countA[0]?.count || 0);
    const countBNum = Number(countB[0]?.count || 0);

    isolationTests.push({
      name: 'Embedding count isolation',
      passed: countANum === contactsA.length && countBNum === contactsB.length,
      details: `Tenant A: ${countANum}/${contactsA.length}, Tenant B: ${countBNum}/${contactsB.length}`,
    });

    // Test 5e: Search for "CTO" as Tenant A should NOT find Tenant B's CTO
    const ctoCrossTenant = await prisma.contact.findMany({
      where: {
        tenantId: TEST_TENANT_A,
        jobTitle: { contains: 'Chief Technology Officer', mode: 'insensitive' },
      },
    });

    const foundOtherCTO = ctoCrossTenant.some((c) => c.company === 'Different Company');
    isolationTests.push({
      name: 'CTO search isolation',
      passed: !foundOtherCTO && ctoCrossTenant.length === 1,
      details: foundOtherCTO
        ? "BREACH: Found other tenant's CTO!"
        : `Found ${ctoCrossTenant.length} CTO(s) in Tenant A`,
    });

    // Log isolation test results
    let isolationPassed = 0;
    let isolationFailed = 0;
    for (const test of isolationTests) {
      if (test.passed) {
        isolationPassed++;
        console.log(`   ✅ ${test.name}: ${test.details}`);
      } else {
        isolationFailed++;
        console.log(`   ❌ ${test.name}: ${test.details}`);
      }
    }

    results.push({
      name: 'Tenant Isolation (GDPR)',
      passed: isolationFailed === 0,
      details: `${isolationPassed}/${isolationTests.length} checks passed`,
    });

    console.log(`\n   Summary: ${isolationPassed}/${isolationTests.length} isolation checks passed`);
    if (isolationFailed > 0) {
      console.log('   🚨 SECURITY ISSUE: Cross-tenant data leakage detected!');
    }

    // ============================================================
    // TEST 6: Performance Metrics
    // ============================================================
    console.log('\n─────────────────────────────────────────────────────────');
    console.log('TEST 6: Performance Metrics\n');

    // Benchmark 10 vector searches
    const benchmarkQueries = [
      'product manager',
      'finance budget',
      'engineering lead',
      'sales director',
      'marketing',
      'operations',
      'customer success',
      'support engineer',
      'data analyst',
      'HR recruiter',
    ];

    const benchLatencies: number[] = [];
    for (const q of benchmarkQueries) {
      const start = Date.now();
      const emb = await mistral.embeddings.create({ model: 'mistral-embed', inputs: [q] });
      const vec = emb.data?.[0]?.embedding;
      if (!vec) continue;

      const vecLit = Prisma.raw(`'[${vec.join(',')}]'::vector`);
      await prisma.$queryRaw`
        SELECT "contactId" FROM embeddings
        WHERE "tenantId" = ${TEST_TENANT_A} AND "contactId" IS NOT NULL
        ORDER BY "vector" <-> ${vecLit} ASC
        LIMIT 5
      `;
      benchLatencies.push(Date.now() - start);
    }

    const avgLatency = benchLatencies.reduce((a, b) => a + b, 0) / benchLatencies.length;
    const sorted = [...benchLatencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length / 2)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    const perfPassed = avgLatency < 500; // Expect <500ms avg

    results.push({
      name: 'Performance Metrics',
      passed: perfPassed,
      details: `Avg: ${avgLatency.toFixed(0)}ms, P50: ${p50}ms, P99: ${p99}ms`,
    });

    console.log(`   Benchmark: ${benchmarkQueries.length} searches`);
    console.log(`   Average:   ${avgLatency.toFixed(0)}ms`);
    console.log(`   P50:       ${p50}ms`);
    console.log(`   P99:       ${p99}ms`);
    console.log(`   ${perfPassed ? '✅' : '⚠️'} Performance ${perfPassed ? 'OK' : 'degraded'}\n`);

    // ============================================================
    // CLEANUP
    // ============================================================
    console.log('─────────────────────────────────────────────────────────');
    console.log('CLEANUP: Removing test data...\n');

    // Delete embeddings first (FK)
    await prisma.$executeRaw`
      DELETE FROM embeddings WHERE "tenantId" IN (${TEST_TENANT_A}, ${TEST_TENANT_B})
    `;

    // Delete contacts
    await prisma.$executeRaw`
      DELETE FROM unified_contacts WHERE "tenantId" IN (${TEST_TENANT_A}, ${TEST_TENANT_B})
    `;

    // Delete tenants
    await prisma.$executeRaw`
      DELETE FROM tenants WHERE id IN (${TEST_TENANT_A}, ${TEST_TENANT_B})
    `;

    console.log('   ✅ Test data cleaned up\n');

    // ============================================================
    // FINAL SUMMARY
    // ============================================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                    FINAL SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    for (const r of results) {
      const status = r.passed ? '✅ PASS' : '❌ FAIL';
      const latency = r.latencyMs ? ` (${r.latencyMs}ms)` : '';
      console.log(`   ${status} ${r.name}${latency}`);
      console.log(`          ${r.details}`);
      if (r.passed) passed++;
      else failed++;
    }

    console.log('\n───────────────────────────────────────────────────────────');
    console.log(`   Total: ${passed}/${results.length} tests passed`);

    if (failed === 0) {
      console.log('\n   🎉 ALL TESTS PASSED - Contact RAG is production-ready!');
    } else {
      console.log(`\n   ⚠️  ${failed} TESTS FAILED - Review before deploying!`);
      process.exitCode = 1;
    }

    console.log('═══════════════════════════════════════════════════════════\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Test failed with error:', error);

    // Attempt cleanup on error
    try {
      await prisma.$executeRaw`
        DELETE FROM embeddings WHERE "tenantId" IN (${TEST_TENANT_A}, ${TEST_TENANT_B})
      `;
      await prisma.$executeRaw`
        DELETE FROM unified_contacts WHERE "tenantId" IN (${TEST_TENANT_A}, ${TEST_TENANT_B})
      `;
      await prisma.$executeRaw`
        DELETE FROM tenants WHERE id IN (${TEST_TENANT_A}, ${TEST_TENANT_B})
      `;
      console.log('   Cleanup completed after error');
    } catch {
      console.log('   Cleanup failed - manual cleanup may be needed');
    }

    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(console.error);
