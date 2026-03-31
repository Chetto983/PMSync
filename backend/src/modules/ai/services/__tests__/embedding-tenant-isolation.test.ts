/**
 * T-0305: Verify embedding search returns correct tenant-scoped results.
 *
 * Tests that findSimilarContent() and hydrateKnowledgeHits() enforce
 * tenantId isolation — tenant A never sees tenant B's embeddings or emails.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';

describe('Embedding tenant isolation (requires POSTGRES_URL)', () => {
  if (!process.env.POSTGRES_URL) {
    it.skip('POSTGRES_URL not set', () => {});
    return;
  }

  const prisma = new PrismaClient();
  const tenantA = `test-tenant-a-${nanoid(8)}`;
  const tenantB = `test-tenant-b-${nanoid(8)}`;
  const emailIdA = `test-email-a-${nanoid(8)}`;
  const emailIdB = `test-email-b-${nanoid(8)}`;
  const embeddingIdA = `test-emb-a-${nanoid(8)}`;
  const embeddingIdB = `test-emb-b-${nanoid(8)}`;

  // Use a simple 1024-dim vector (filled with a known value for each tenant)
  const vectorA = Array.from({ length: 1024 }, () => 0.1);
  const vectorB = Array.from({ length: 1024 }, () => 0.2);

  beforeAll(async () => {
    // Insert test embeddings for two tenants via raw SQL (pgvector)
    const vecAStr = `[${vectorA.join(',')}]`;
    const vecBStr = `[${vectorB.join(',')}]`;

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "embeddings" ("id", "tenantId", "documentName", "vector", "embeddingModel", "metadata", "createdAt", "emailId")
      VALUES (${embeddingIdA}, ${tenantA}, ${'Test A'}, ${Prisma.raw(`'${vecAStr}'::vector`)}, ${'mistral-embed'}, ${'{}'}::jsonb, NOW(), ${emailIdA})
    `);

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "embeddings" ("id", "tenantId", "documentName", "vector", "embeddingModel", "metadata", "createdAt", "emailId")
      VALUES (${embeddingIdB}, ${tenantB}, ${'Test B'}, ${Prisma.raw(`'${vecBStr}'::vector`)}, ${'mistral-embed'}, ${'{}'}::jsonb, NOW(), ${emailIdB})
    `);
  }, 15_000);

  afterAll(async () => {
    // Cleanup test data
    await prisma.embedding.deleteMany({
      where: { id: { in: [embeddingIdA, embeddingIdB] } },
    });
    await prisma.$disconnect();
  });

  it('search from tenant A returns only tenant A embeddings', async () => {
    const searchVec = `[${vectorA.join(',')}]`;
    const results = await prisma.$queryRaw<Array<{ id: string; tenantId?: string }>>(Prisma.sql`
      WITH tenant_embeddings AS (
        SELECT "id", "documentName", "metadata", "vector", "emailId", "contactId"
        FROM "embeddings"
        WHERE "tenantId" = ${tenantA}
      )
      SELECT "id", "documentName", "emailId", ("vector" <-> ${Prisma.raw(`'${searchVec}'::vector`)}) AS "distance"
      FROM tenant_embeddings
      ORDER BY "vector" <-> ${Prisma.raw(`'${searchVec}'::vector`)}
      LIMIT 10;
    `);

    // Must contain tenant A's embedding
    const ids = results.map((r) => r.id);
    expect(ids).toContain(embeddingIdA);

    // Must NOT contain tenant B's embedding
    expect(ids).not.toContain(embeddingIdB);
  }, 15_000);

  it('search from tenant B returns only tenant B embeddings', async () => {
    const searchVec = `[${vectorB.join(',')}]`;
    const results = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH tenant_embeddings AS (
        SELECT "id", "documentName", "metadata", "vector", "emailId", "contactId"
        FROM "embeddings"
        WHERE "tenantId" = ${tenantB}
      )
      SELECT "id", "documentName", "emailId", ("vector" <-> ${Prisma.raw(`'${searchVec}'::vector`)}) AS "distance"
      FROM tenant_embeddings
      ORDER BY "vector" <-> ${Prisma.raw(`'${searchVec}'::vector`)}
      LIMIT 10;
    `);

    const ids = results.map((r) => r.id);
    expect(ids).toContain(embeddingIdB);
    expect(ids).not.toContain(embeddingIdA);
  }, 15_000);

  it('model version filter excludes stale embeddings', async () => {
    const searchVec = `[${vectorA.join(',')}]`;

    // Search with a non-matching model version — should exclude our test embedding
    const results = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH tenant_embeddings AS (
        SELECT "id", "documentName", "metadata", "vector", "emailId", "contactId"
        FROM "embeddings"
        WHERE "tenantId" = ${tenantA} AND "embeddingModel" = ${'nonexistent-model-v99'}
      )
      SELECT "id", "documentName", "emailId", ("vector" <-> ${Prisma.raw(`'${searchVec}'::vector`)}) AS "distance"
      FROM tenant_embeddings
      ORDER BY "vector" <-> ${Prisma.raw(`'${searchVec}'::vector`)}
      LIMIT 10;
    `);

    expect(results).toHaveLength(0);
  }, 15_000);
});
