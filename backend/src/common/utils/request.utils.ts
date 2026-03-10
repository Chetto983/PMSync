/**
 * Utilities for extracting information from Request objects.
 * Kept in common/utils to avoid circular imports between auth modules.
 */

export function getRequestHeader(
  request: Request | undefined,
  headerName: string,
): string | undefined {
  return request?.headers.get(headerName) ?? undefined;
}

export function getRequestIp(
  request: Request | undefined,
): string | undefined {
  const forwardedFor = getRequestHeader(request, 'x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || undefined;
  }

  return getRequestHeader(request, 'x-real-ip');
}
