/**
 * Mock for better-auth/node ESM module.
 * Jest cannot transform ESM from better-auth/node, so we provide
 * a CJS-compatible mock of the only function we use: fromNodeHeaders.
 */
export function fromNodeHeaders(headers: Record<string, string | string[] | undefined>) {
  // Convert Node.js IncomingHttpHeaders to a Headers-like object
  // In tests, the mock auth.api.getSession doesn't actually inspect headers,
  // so this is a passthrough.
  return new Headers(
    Object.entries(headers).reduce(
      (acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = Array.isArray(value) ? value.join(', ') : value;
        }
        return acc;
      },
      {} as Record<string, string>,
    ),
  );
}
