/**
 * Shared vector validation utility.
 *
 * Validates and sanitizes embedding vectors before they are used in
 * Prisma.raw() SQL literals. Prevents SQL injection by ensuring all
 * values are finite numbers within dimensional bounds.
 *
 * Phase 59: Safety hardening
 */

/**
 * Validates an embedding vector for safe SQL usage.
 *
 * @param embedding - Array of numbers representing the embedding vector
 * @returns Validated copy of the embedding array
 * @throws Error if embedding is not an array, is empty, exceeds 4096 dimensions,
 *         or contains non-finite values
 */
export function validateEmbeddingVector(embedding: unknown): number[] {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array');
  }

  if (embedding.length === 0) {
    throw new Error('Embedding array cannot be empty');
  }

  if (embedding.length > 4096) {
    throw new Error('Embedding array exceeds maximum dimension (4096)');
  }

  const validated: number[] = [];
  for (let i = 0; i < embedding.length; i++) {
    const value = embedding[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `Invalid embedding value at index ${i}: expected finite number`,
      );
    }
    validated.push(value);
  }

  return validated;
}
