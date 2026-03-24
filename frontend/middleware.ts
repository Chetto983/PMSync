import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Server-side route protection using better-auth session cookie.
 *
 * This is an optimistic cookie-existence check, not full session validation.
 * Real validation still happens in useSession on the client and NestJS guards
 * on the backend.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);
  const onboardingCookie = request.cookies.get("pmsync:onboarding-complete");

  // Authenticated user on landing page → redirect to dashboard
  if (pathname === "/" && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protected routes: require session
  if (pathname.startsWith("/dashboard") || pathname === "/onboarding") {
    if (!sessionCookie) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("returnTo", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }

    if (
      pathname.startsWith("/dashboard") &&
      !onboardingCookie &&
      !pathname.startsWith("/dashboard/invitations/accept")
    ) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  // Authenticated user on auth pages → redirect to dashboard
  if (pathname.startsWith("/auth/") && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/auth/:path*", "/onboarding"],
};
