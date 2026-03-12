export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
  maxRetries = 1,
): boolean {
  const status =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error as any)?.response?.status ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error as any)?.status;

  if (status === 401 || status === 403 || status === 429) {
    return false;
  }

  return failureCount < maxRetries;
}
