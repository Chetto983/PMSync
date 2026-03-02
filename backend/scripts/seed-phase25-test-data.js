/**
 * Seed Phase 25 test data:
 *   A. 10 email embeddings (real Mistral vectors)
 *   B. 5 contact embeddings (real Mistral vectors)
 *   C. 1 AI memory + its embedding
 *   D. Verification counts
 *
 * Idempotent: skips emails/contacts that already have embeddings.
 * Uses raw SQL for pgvector INSERT (Prisma Unsupported column).
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { createMistral } = require('@ai-sdk/mistral');
const { embed } = require('ai');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
if (!MISTRAL_API_KEY) {
  console.error('MISTRAL_API_KEY is not set. Aborting.');
  process.exit(1);
}

const mistral = createMistral({ apiKey: MISTRAL_API_KEY });
const embeddingModel = mistral.textEmbeddingModel('mistral-embed');

const EMAIL_COUNT = 10;
const CONTACT_COUNT = 5;
const RATE_LIMIT_MS = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple cuid-like ID (good enough for seed scripts). */
function seedId() {
  return 'seed_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/** Sleep helper for rate-limiting Mistral calls. */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Call Mistral embed with rate-limit pause. */
async function getEmbedding(text) {
  const result = await embed({ model: embeddingModel, value: text });
  await sleep(RATE_LIMIT_MS);
  return result.embedding;
}

/** Format a float array as Postgres vector literal: '[0.1,0.2,...]' */
function toVectorLiteral(arr) {
  return '[' + arr.join(',') + ']';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    // ---- Resolve tenant + user ----
    const tenant = await prisma.tenant.findFirst({ where: { isActive: true } });
    if (!tenant) throw new Error('No active tenant found');
    const tenantId = tenant.id;

    const user = await prisma.user.findFirst({ where: { tenantId, isActive: true } });
    if (!user) throw new Error('No active user found for tenant ' + tenantId);
    const userId = user.id;

    console.log(`Tenant: ${tenant.name} (${tenantId})`);
    console.log(`User:   ${user.email} (${userId})\n`);

    // ==================================================================
    // A. Seed email embeddings
    // ==================================================================
    console.log('--- A. Email Embeddings ---');

    // Check if we already have enough email embeddings
    const [emailEmbCheck] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT "emailId")::int AS count FROM embeddings WHERE "tenantId" = $1 AND "emailId" IS NOT NULL`,
      tenantId,
    );
    const existingEmailEmbCount = emailEmbCheck.count;

    if (existingEmailEmbCount >= EMAIL_COUNT) {
      console.log(`  Already have ${existingEmailEmbCount} email embeddings (>= ${EMAIL_COUNT}). Skipping.\n`);
    } else {
      const needed = EMAIL_COUNT - existingEmailEmbCount;
      // Find emails that do NOT yet have an embedding row
      const emailsWithEmbedding = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT "emailId" FROM embeddings WHERE "tenantId" = $1 AND "emailId" IS NOT NULL`,
        tenantId,
      );
      const alreadyEmbeddedEmailIds = new Set(emailsWithEmbedding.map((r) => r.emailId));
      const candidateEmails = await prisma.email.findMany({
        where: { tenantId },
        orderBy: { receivedAt: 'desc' },
        take: needed + alreadyEmbeddedEmailIds.size,
        select: { id: true, tenantId: true, subject: true, snippet: true },
      });
      const emailsToSeed = candidateEmails
        .filter((e) => !alreadyEmbeddedEmailIds.has(e.id))
        .slice(0, needed);

      console.log(`  Generating embeddings for ${emailsToSeed.length} emails (have ${existingEmailEmbCount}, need ${EMAIL_COUNT})...`);
      for (const email of emailsToSeed) {
        const text = `${email.subject || ''} ${email.snippet || ''}`.trim();
        if (!text) {
          console.log(`  [skip] email ${email.id} has no subject/snippet`);
          continue;
        }
        const vector = await getEmbedding(text);
        const id = seedId();
        const vectorStr = toVectorLiteral(vector);

        await prisma.$queryRawUnsafe(
          `INSERT INTO embeddings ("id", "tenantId", "documentName", "vector", "embeddingModel", "createdAt", "emailId")
           VALUES ($1, $2, $3, $4::vector, $5, NOW(), $6)`,
          id,
          tenantId,
          `email:${email.id}`,
          vectorStr,
          'mistral-embed',
          email.id,
        );
        console.log(`  [ok] email ${email.id} -> embedding ${id}`);
      }
      console.log();
    }

    // ==================================================================
    // B. Seed contact embeddings
    // ==================================================================
    console.log('--- B. Contact Embeddings ---');

    const contactsWithEmbedding = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT "contactId" FROM embeddings WHERE "tenantId" = $1 AND "contactId" IS NOT NULL`,
      tenantId,
    );
    const alreadyEmbeddedContactIds = new Set(contactsWithEmbedding.map((r) => r.contactId));

    const candidateContacts = await prisma.contact.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      take: CONTACT_COUNT + alreadyEmbeddedContactIds.size,
      select: {
        id: true,
        tenantId: true,
        displayName: true,
        company: true,
        jobTitle: true,
        department: true,
        notes: true,
        tags: true,
        emails: true,
        phoneNumbers: true,
      },
    });

    const contactsToSeed = candidateContacts
      .filter((c) => !alreadyEmbeddedContactIds.has(c.id))
      .slice(0, CONTACT_COUNT);

    if (contactsToSeed.length === 0) {
      console.log('  All candidate contacts already have embeddings. Skipping.\n');
    } else {
      console.log(`  Generating embeddings for ${contactsToSeed.length} contacts...`);
      for (const contact of contactsToSeed) {
        const parts = [
          contact.displayName && `Name: ${contact.displayName}`,
          contact.company && `Company: ${contact.company}`,
          contact.jobTitle && `Role: ${contact.jobTitle}`,
          contact.department && `Department: ${contact.department}`,
          contact.notes && `Notes: ${contact.notes}`,
          contact.tags && `Tags: ${contact.tags}`,
          Array.isArray(contact.emails) && contact.emails.length > 0
            && `Email: ${contact.emails.map((e) => (typeof e === 'string' ? e : e.value || e.email || '')).join(', ')}`,
          Array.isArray(contact.phoneNumbers) && contact.phoneNumbers.length > 0
            && `Phone: ${contact.phoneNumbers.map((p) => (typeof p === 'string' ? p : p.value || p.number || '')).join(', ')}`,
        ].filter(Boolean);

        const text = parts.join('\n');
        if (!text) {
          console.log(`  [skip] contact ${contact.id} has no embeddable content`);
          continue;
        }

        const vector = await getEmbedding(text);
        const id = seedId();
        const vectorStr = toVectorLiteral(vector);

        await prisma.$queryRawUnsafe(
          `INSERT INTO embeddings ("id", "tenantId", "documentName", "vector", "embeddingModel", "createdAt", "contactId")
           VALUES ($1, $2, $3, $4::vector, $5, NOW(), $6)`,
          id,
          tenantId,
          `contact:${contact.id}`,
          vectorStr,
          'mistral-embed',
          contact.id,
        );
        console.log(`  [ok] contact ${contact.id} -> embedding ${id}`);
      }
      console.log();
    }

    // ==================================================================
    // C. Seed 1 AI Memory + embedding
    // ==================================================================
    console.log('--- C. AI Memory ---');

    const memoryContent =
      'User works at TechCorp and prefers responses in Italian. They manage the sales team.';

    // Check if we already seeded this exact memory
    const existingMemory = await prisma.aIMemory.findFirst({
      where: { tenantId, userId, content: memoryContent, source: 'seed' },
    });

    // Fix ai_memories.vector index issues:
    // 1. Drop broken btree index if it exists (btree can't handle 1024-dim vectors)
    // 2. Alter column to vector(1024) if un-dimensioned (HNSW needs fixed dimensions)
    // 3. Recreate as proper HNSW cosine index
    const idxRows = await prisma.$queryRawUnsafe(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'ai_memories_vector_hnsw_idx'`,
    );
    const hasBrokenBtree = idxRows.length > 0 && idxRows[0].indexdef && idxRows[0].indexdef.includes('btree');
    const hasNoIndex = idxRows.length === 0;

    if (hasBrokenBtree) {
      console.log('  [fix] Dropping broken btree index on ai_memories.vector...');
      await prisma.$queryRawUnsafe(`DROP INDEX IF EXISTS ai_memories_vector_hnsw_idx`);
    }

    if (hasBrokenBtree || hasNoIndex) {
      // Ensure column has dimension constraint (required for HNSW)
      console.log('  [fix] Altering ai_memories.vector to vector(1024)...');
      await prisma.$queryRawUnsafe(
        `ALTER TABLE ai_memories ALTER COLUMN vector TYPE vector(1024)`,
      );
      console.log('  [fix] Creating HNSW cosine index...');
      await prisma.$queryRawUnsafe(
        `CREATE INDEX ai_memories_vector_hnsw_idx ON ai_memories USING hnsw (vector vector_cosine_ops)`,
      );
      console.log('  [fix] HNSW index created successfully.');
    }

    let memoryId;
    if (existingMemory) {
      memoryId = existingMemory.id;
      console.log(`  Memory row already exists (${memoryId}).`);
    } else {
      // Create the memory via Prisma (no vector column involved here, we set it via raw SQL after)
      const memory = await prisma.aIMemory.create({
        data: {
          tenantId,
          userId,
          content: memoryContent,
          memoryType: 'FACT',
          category: 'preference',
          tags: 'work,language',
          confidence: 1.0,
          source: 'seed',
        },
      });
      memoryId = memory.id;
      console.log(`  Created AI memory: ${memoryId}`);
    }

    // Check if vector is already set on this memory
    const [vecCheck] = await prisma.$queryRawUnsafe(
      `SELECT (vector IS NOT NULL)::boolean AS has_vector FROM ai_memories WHERE id = $1`,
      memoryId,
    );

    if (vecCheck && vecCheck.has_vector) {
      console.log(`  Vector already set on memory ${memoryId}. Skipping vector generation.`);
    } else {
      // Generate embedding for the memory and store in ai_memories.vector
      const memVector = await getEmbedding(memoryContent);
      const memVectorStr = toVectorLiteral(memVector);
      await prisma.$queryRawUnsafe(
        `UPDATE ai_memories SET vector = $1::vector WHERE id = $2`,
        memVectorStr,
        memoryId,
      );
      console.log(`  Set vector on ai_memories row ${memoryId}`);
    }

    // Check if we already have an embedding row for this memory
    const existingMemEmb = await prisma.$queryRawUnsafe(
      `SELECT id FROM embeddings WHERE "documentName" = $1 AND "tenantId" = $2 LIMIT 1`,
      `memory:${memoryId}`,
      tenantId,
    );

    if (existingMemEmb.length > 0) {
      console.log(`  Embedding row for memory already exists (${existingMemEmb[0].id}). Skipping.\n`);
    } else {
      // Need vector for the embedding row. Re-generate if we don't have it in scope.
      const memVector2 = await getEmbedding(memoryContent);
      const memVectorStr2 = toVectorLiteral(memVector2);
      const embId = seedId();
      const metadataJson = JSON.stringify({ memoryId });
      await prisma.$queryRawUnsafe(
        `INSERT INTO embeddings ("id", "tenantId", "documentName", "vector", "embeddingModel", "metadata", "createdAt")
         VALUES ($1, $2, $3, $4::vector, $5, $6::jsonb, NOW())`,
        embId,
        tenantId,
        `memory:${memoryId}`,
        memVectorStr2,
        'mistral-embed',
        metadataJson,
      );
      console.log(`  Created embedding ${embId} for memory ${memoryId}\n`);
    }

    // ==================================================================
    // D. Verification
    // ==================================================================
    console.log('--- D. Verification ---');

    const [embeddingCount] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM embeddings WHERE "tenantId" = $1`,
      tenantId,
    );
    const [emailEmbCount] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM embeddings WHERE "tenantId" = $1 AND "emailId" IS NOT NULL`,
      tenantId,
    );
    const [contactEmbCount] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM embeddings WHERE "tenantId" = $1 AND "contactId" IS NOT NULL`,
      tenantId,
    );
    const [memoryEmbCount] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM embeddings WHERE "tenantId" = $1 AND "documentName" LIKE 'memory:%'`,
      tenantId,
    );
    const memoryCount = await prisma.aIMemory.count({ where: { tenantId, userId } });
    const [memoryWithVectorCount] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM ai_memories WHERE "tenantId" = $1 AND vector IS NOT NULL`,
      tenantId,
    );

    console.log(`  Total embeddings for tenant:     ${embeddingCount.count}`);
    console.log(`  Email embeddings:                ${emailEmbCount.count}`);
    console.log(`  Contact embeddings:              ${contactEmbCount.count}`);
    console.log(`  Memory embeddings (in embeds):   ${memoryEmbCount.count}`);
    console.log(`  AI memories (total):             ${memoryCount}`);
    console.log(`  AI memories with vector:         ${memoryWithVectorCount.count}`);

    console.log('\nPhase 25 seed data complete.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
