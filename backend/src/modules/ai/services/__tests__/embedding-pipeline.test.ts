import { describe, it, expect } from 'vitest';
import { embed } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
import { PrismaClient } from '@prisma/client';

const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY! });

describe('Embedding pipeline (real API)', () => {
  it('produces pgvector-compatible embeddings from email content', async () => {
    const emailContent = 'Subject: Q4 Budget Review\nFrom: john@example.com\nPlease review the attached Q4 budget proposal.';
    const { embedding } = await embed({
      model: mistral.embedding('mistral-embed'),
      value: emailContent,
      abortSignal: AbortSignal.timeout(15_000),
    });
    // Verify pgvector compatibility
    expect(embedding).toHaveLength(1024);
    expect(embedding.every(v => typeof v === 'number')).toBe(true);
    // Verify embedding is not zero-vector (actual semantic content)
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeGreaterThan(0.1);
  }, 30_000);

  it('produces distinct embeddings for different content', async () => {
    const { embedding: e1 } = await embed({
      model: mistral.embedding('mistral-embed'),
      value: 'Meeting about Q4 budget review with finance team',
      abortSignal: AbortSignal.timeout(15_000),
    });
    const { embedding: e2 } = await embed({
      model: mistral.embedding('mistral-embed'),
      value: 'Recipe for chocolate cake with vanilla frosting',
      abortSignal: AbortSignal.timeout(15_000),
    });
    // Cosine similarity should be low for unrelated content
    const dotProduct = e1.reduce((sum, v, i) => sum + v * e2[i], 0);
    const mag1 = Math.sqrt(e1.reduce((sum, v) => sum + v * v, 0));
    const mag2 = Math.sqrt(e2.reduce((sum, v) => sum + v * v, 0));
    const cosineSim = dotProduct / (mag1 * mag2);
    expect(cosineSim).toBeLessThan(0.8); // Unrelated content should have low similarity
  }, 45_000);

  // pgvector store + retrieve test -- requires POSTGRES_URL
  it('stores and retrieves embedding via pgvector cosine similarity', async () => {
    if (!process.env.POSTGRES_URL) {
      console.log('SKIP: POSTGRES_URL not set');
      return;
    }
    const prisma = new PrismaClient();
    try {
      const testContent = 'E2E test: quarterly financial review meeting notes';
      const { embedding } = await embed({
        model: mistral.embedding('mistral-embed'),
        value: testContent,
        abortSignal: AbortSignal.timeout(15_000),
      });

      // Store via raw SQL (same pattern as codebase)
      const vectorStr = `[${embedding.join(',')}]`;
      const testId = `e2e-test-${Date.now()}`;
      await prisma.$executeRaw`
        INSERT INTO "Embedding" (id, content, embedding, "sourceType", "createdAt", "updatedAt")
        VALUES (${testId}, ${testContent}, ${vectorStr}::vector, 'email', NOW(), NOW())
      `;

      // Retrieve via cosine similarity
      const results = await prisma.$queryRaw<Array<{ id: string; content: string; similarity: number }>>`
        SELECT id, content, 1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM "Embedding"
        WHERE id = ${testId}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT 1
      `;

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(testId);
      expect(results[0].similarity).toBeGreaterThan(0.99); // Self-similarity ~1.0

      // Cleanup
      await prisma.$executeRaw`DELETE FROM "Embedding" WHERE id = ${testId}`;
    } finally {
      await prisma.$disconnect();
    }
  }, 45_000);
});
