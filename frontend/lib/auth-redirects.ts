const DEFAULT_AUTH_RETURN_TO = '/dashboard';

function normalizeCandidatePath(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  try {
    const parsed = new URL(value, 'http://pmsync.local');
    if (parsed.origin !== 'http://pmsync.local') {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function getSafeReturnToPath(
  rawValue: string | string[] | null | undefined,
  fallback = DEFAULT_AUTH_RETURN_TO,
): string {
  const candidate = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (!candidate) {
    return fallback;
  }

  return normalizeCandidatePath(candidate) ?? fallback;
}

export function hasCompletedOnboardingCookie(cookieString: string): boolean {
  return /(?:^|;\s*)pmsync:onboarding-complete=1(?:;|$)/.test(cookieString);
}

export function resolvePostLoginPath(
  rawValue: string | string[] | null | undefined,
  cookieString: string,
): string {
  const safeReturnTo = getSafeReturnToPath(rawValue);

  if (!hasCompletedOnboardingCookie(cookieString) && safeReturnTo.startsWith('/dashboard')) {
    return '/onboarding';
  }

  return safeReturnTo;
}
