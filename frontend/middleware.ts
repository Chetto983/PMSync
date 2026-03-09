import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Pages Router middleware.
 *
 * Runs at the Edge -- no DB calls.  Uses lightweight cookie checks:
 *  1. Redirect unauthenticated visitors to /auth/login
 *  2. Redirect authenticated-but-not-onboarded users to /onboarding
 *
 * The actual `onboardingComplete` field is validated inside the
 * onboarding page via `useSession()`.  The cookie is a fast hint
 * so that the middleware can short-circuit without a network call.
 */
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('better-auth.session_token');
  const pathname = request.nextUrl.pathname;

  // Paths that never need auth/onboarding checks
  const skipPaths = [
    '/auth',
    '/_next',
    '/api',
    '/onboarding',
    '/favicon',
    '/terms',
    '/privacy',
  ];
  if (skipPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // No session -> login
  if (!sessionCookie) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Onboarding gate: cookie set by wizard on completion
  const onboardingCookie = request.cookies.get('pmsync:onboarding-complete');
  if (!onboardingCookie && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding'],
};
