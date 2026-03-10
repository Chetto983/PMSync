# Phase 63: Email Invitation Accept Page - Research

**Researched:** 2026-03-10
**Domain:** Next.js Pages Router page + middleware query param preservation
**Confidence:** HIGH

## Summary

This phase closes a known integration gap: the backend sends invitation emails with a link to `/dashboard/invitations/accept?id=...` (better-auth.instance.ts line 360), but no frontend page exists at that route. The `PendingInvitationBanner` component already demonstrates the working pattern -- `authClient.organization.acceptInvitation({ invitationId })` -- so the accept page is a straightforward composition of existing hooks and patterns.

The critical secondary fix is in `proxy.ts` (the middleware): line 19 sets `returnTo` to `pathname` only, stripping query parameters. When an unauthenticated user clicks the email link, `?id=abc123` is lost during the redirect to `/auth/login`. The fix is to include the full path + search string in the `returnTo` parameter.

**Primary recommendation:** Create a single page at `frontend/pages/dashboard/invitations/accept.tsx` that reads `router.query.id`, calls the existing `useAcceptInvitation` hook, and displays success/error states. Fix `proxy.ts` to preserve query params in `returnTo`. Add i18n strings for the accept page states.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ORG-02 | Organization owner can invite members by email | Existing `useAcceptInvitation` hook (use-organizations.ts:179-193) calls `authClient.organization.acceptInvitation`. Backend email (better-auth.instance.ts:360) generates URL with `?id=` param. Missing piece is the page + middleware fix. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.x | Pages Router page at `/dashboard/invitations/accept` | Project uses Pages Router exclusively |
| @mui/material | existing | UI components (Alert, Button, CircularProgress, Box, Typography) | Project MUI-only policy |
| better-auth/react | existing | `authClient.organization.acceptInvitation` | Already wired in auth-client.ts with organizationClient plugin |
| @tanstack/react-query | existing | `useAcceptInvitation` mutation hook | Already implemented in use-organizations.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next/router | built-in | Read `?id=` query param via `useRouter().query.id` | Page component |
| better-auth/cookies | existing | `getSessionCookie` in proxy.ts middleware | Already imported |

### Alternatives Considered
None -- all libraries are already in use. No new dependencies needed.

## Architecture Patterns

### Page Location
```
frontend/
  pages/
    dashboard/
      invitations/
        accept.tsx    # NEW - invitation accept page
  proxy.ts            # MODIFY - preserve query params in returnTo
  locales/
    en.ts             # MODIFY - add invitationAccept i18n strings
    it.ts             # MODIFY - add invitationAccept i18n strings
    index.ts          # MODIFY - add types for new strings
```

### Pattern 1: Accept Page Flow
**What:** Page reads `?id=` from query params, auto-accepts on mount (or on button click), shows result.
**When to use:** This is the only page in this phase.

The page should follow one of two approaches:
- **Auto-accept on mount:** Call `acceptInvitation.mutate(id)` in a `useEffect` on mount. Simpler UX -- user clicks email link and sees result immediately.
- **Confirm-then-accept:** Show invitation details first, let user click "Accept". More deliberate but requires fetching invitation details first (which better-auth may not expose as a standalone endpoint).

**Recommendation:** Auto-accept on mount. The user clicked "Accept Invitation" in the email -- that IS the confirmation. Show a loading spinner, then success or error. This matches the email link CTA text ("Accept Invitation").

```typescript
// Pattern from existing PendingInvitationBanner.tsx
const acceptInvitation = useAcceptInvitation();

useEffect(() => {
  if (id && !acceptInvitation.isPending && !hasAttempted) {
    setHasAttempted(true);
    acceptInvitation.mutate(id as string);
  }
}, [id]);
```

### Pattern 2: Middleware Query Param Preservation
**What:** Fix `proxy.ts` to include search params in `returnTo`.
**Current (broken):**
```typescript
loginUrl.searchParams.set("returnTo", pathname);
// /dashboard/invitations/accept?id=abc → returnTo=/dashboard/invitations/accept (id LOST)
```
**Fixed:**
```typescript
const returnPath = pathname + request.nextUrl.search;
loginUrl.searchParams.set("returnTo", returnPath);
// /dashboard/invitations/accept?id=abc → returnTo=/dashboard/invitations/accept?id=abc
```

### Pattern 3: Login Page returnTo Handling
**What:** The login page already reads `returnTo` from query and redirects after login (login.tsx line 46, 87). It uses `router.push(returnTo)`. Since `returnTo` will now contain query params (e.g., `/dashboard/invitations/accept?id=abc`), `router.push()` handles this correctly -- Next.js router accepts full path strings with query params.

**No changes needed to login.tsx** -- the existing `returnTo` handling works with full paths.

### Anti-Patterns to Avoid
- **Fetching invitation details before accepting:** better-auth organization plugin does not expose a "get invitation by ID" endpoint for the invitee. The `getInvitations()` method requires an authenticated session. The accept page should just attempt the accept and handle errors.
- **Creating a new mutation hook:** `useAcceptInvitation` already exists in `use-organizations.ts`. Reuse it.
- **Hardcoding strings:** All UI text must go through i18n (en.ts, it.ts, index.ts types).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Invitation acceptance | Custom API call to backend | `useAcceptInvitation()` hook | Already calls `authClient.organization.acceptInvitation` with proper cache invalidation |
| Auth redirect | Custom redirect logic | `proxy.ts` middleware (fix it) | Already handles all dashboard routes |
| Session check | Manual cookie/session logic | `useSession()` from auth-client | Standard pattern across all dashboard pages |

## Common Pitfalls

### Pitfall 1: Query Param Lost in Redirect Chain
**What goes wrong:** Unauthenticated user clicks email link, middleware redirects to `/auth/login?returnTo=/dashboard/invitations/accept` (missing `?id=`), user logs in, lands on accept page without the invitation ID.
**Why it happens:** `proxy.ts` line 19 uses `pathname` which excludes search params.
**How to avoid:** Fix to `pathname + request.nextUrl.search`.
**Warning signs:** Accept page shows "missing invitation ID" error after login redirect.

### Pitfall 2: Double Accept Attempt
**What goes wrong:** React strict mode or re-render causes `useEffect` to fire twice, triggering two accept calls.
**Why it happens:** React 18+ strict mode double-invokes effects in development.
**How to avoid:** Use a `useRef` flag (`hasAttempted`) to prevent duplicate calls.
**Warning signs:** Console shows two accept API calls, second one may error with "already a member".

### Pitfall 3: Onboarding Redirect Intercept
**What goes wrong:** New user signs up via invitation link, gets redirected to `/onboarding` instead of the accept page, losing the invitation context.
**Why it happens:** `proxy.ts` line 23 redirects to `/onboarding` if the onboarding cookie is missing, even for `/dashboard/invitations/accept`.
**How to avoid:** Either: (a) exempt `/dashboard/invitations/accept` from the onboarding redirect, or (b) accept that the user completes onboarding first, then manually navigate to the accept page. Option (b) is acceptable if `returnTo` is preserved through onboarding. However, the current onboarding redirect does NOT preserve returnTo -- it just redirects to `/onboarding` with no params. So option (a) is safer.
**Warning signs:** New users invited by email never reach the accept page.

### Pitfall 4: Error State Ambiguity
**What goes wrong:** Accept fails but user doesn't know why (expired, already member, invalid ID).
**Why it happens:** better-auth returns different error codes/messages for different failure modes.
**How to avoid:** Map known error codes to user-friendly i18n strings. Common errors: `INVITATION_NOT_FOUND`, `INVITATION_EXPIRED`, `USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION`.

## Code Examples

### Accept Page Structure
```typescript
// Source: Modeled on existing PendingInvitationBanner.tsx pattern
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, CircularProgress, Typography, Button } from '@mui/material';
import { useAcceptInvitation } from '@/hooks/queries';
import { useSession } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function AcceptInvitationPage() {
  const router = useRouter();
  const { id } = router.query;
  const t = useTranslations();
  const { data: session } = useSession();
  const acceptInvitation = useAcceptInvitation();
  const attempted = useRef(false);

  useEffect(() => {
    if (id && typeof id === 'string' && !attempted.current) {
      attempted.current = true;
      acceptInvitation.mutate(id);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render states: loading → success → error → missing ID
}
```

### Middleware Fix
```typescript
// Source: proxy.ts - preserve query params
if (!sessionCookie) {
  const loginUrl = new URL("/auth/login", request.url);
  const returnPath = pathname + request.nextUrl.search;
  loginUrl.searchParams.set("returnTo", returnPath);
  return NextResponse.redirect(loginUrl);
}
```

### i18n Strings Needed
```typescript
// organizations.invitationAccept section
invitationAccept: {
  title: 'Accept Invitation',
  accepting: 'Accepting invitation...',
  success: 'Invitation accepted! Redirecting...',
  error: 'Failed to accept invitation',
  expired: 'This invitation has expired',
  notFound: 'Invitation not found',
  alreadyMember: 'You are already a member of this organization',
  missingId: 'No invitation ID provided',
  goToDashboard: 'Go to Dashboard',
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A (page didn't exist) | Auto-accept page with error handling | Phase 63 | Closes ORG-02 gap |
| returnTo = pathname only | returnTo = pathname + search | Phase 63 | All redirect flows preserve query params |

## Open Questions

1. **Onboarding redirect for new invited users**
   - What we know: `proxy.ts` redirects to `/onboarding` if the cookie is missing, losing the accept page context.
   - What's unclear: Whether the invitation accept path should be exempt from onboarding.
   - Recommendation: Exempt `/dashboard/invitations/accept` from the onboarding redirect in `proxy.ts`. The user can complete onboarding after accepting. Alternatively, preserve returnTo through onboarding flow -- but that is a larger change.

2. **Error codes from better-auth**
   - What we know: better-auth returns error objects with `code` and `message` fields.
   - What's unclear: Exact error codes for all failure modes (expired, not found, already member).
   - Recommendation: Handle by checking `error.code` string matching and fallback to generic error message. The existing `PendingInvitationBanner` does not do error-specific handling, so this is new ground.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + @testing-library/react |
| Config file | `frontend/jest.config.js` |
| Quick run command | `cd frontend && npx jest __tests__/pages/dashboard/invitations/accept.test.tsx -x` |
| Full suite command | `cd frontend && npx jest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORG-02a | Accept page reads `?id=` and calls acceptInvitation | unit | `cd frontend && npx jest __tests__/pages/dashboard/invitations/accept.test.tsx -x` | Wave 0 |
| ORG-02b | Missing ID shows error state | unit | same file | Wave 0 |
| ORG-02c | Error states (expired, not found, already member) rendered | unit | same file | Wave 0 |
| ORG-02d | Success state shows confirmation and redirect | unit | same file | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx jest __tests__/pages/dashboard/invitations/accept.test.tsx -x`
- **Per wave merge:** `cd frontend && npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/__tests__/pages/dashboard/invitations/accept.test.tsx` -- covers ORG-02 accept page behavior
- Pattern: follows existing `frontend/__tests__/pages/auth/login.test.tsx` structure (mock router, mock auth-client, mock translations)

## Sources

### Primary (HIGH confidence)
- `backend/src/common/auth/better-auth.instance.ts` lines 359-376 -- invitation email URL generation
- `frontend/hooks/queries/use-organizations.ts` lines 179-193 -- existing `useAcceptInvitation` hook
- `frontend/components/organizations/PendingInvitationBanner.tsx` -- working accept/decline pattern
- `frontend/proxy.ts` -- middleware with query param bug
- `frontend/pages/auth/login.tsx` -- returnTo handling
- `.planning/v5.0-MILESTONE-AUDIT.md` -- gap identification

### Secondary (MEDIUM confidence)
- better-auth organization plugin error codes inferred from code patterns and naming conventions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new deps
- Architecture: HIGH - follows existing page patterns exactly
- Pitfalls: HIGH - middleware bug confirmed by source code reading
- Error codes: MEDIUM - exact better-auth error strings need runtime verification

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- no moving parts)
