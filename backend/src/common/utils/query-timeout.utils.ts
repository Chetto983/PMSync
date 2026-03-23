/**
 * Query timeout guard for expensive Prisma operations.
 *
 * Wraps a query promise with a timeout to prevent unbounded execution
 * (e.g., groupBy on large tables, pgvector similarity search).
 */

export class QueryTimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    super(`Query "${operationName}" timed out after ${timeoutMs}ms`);
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Execute a Prisma query with a timeout guard.
 *
 * @param operationName  Human-readable label for logging
 * @param query          The query promise
 * @param timeoutMs      Max execution time (default 10_000ms)
 * @returns              Query result or throws QueryTimeoutError
 */
export async function withQueryTimeout<T>(
  operationName: string,
  query: Promise<T>,
  timeoutMs: number = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new QueryTimeoutError(operationName, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
