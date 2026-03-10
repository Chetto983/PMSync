import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields, twoFactorClient, organizationClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';

/**
 * better-auth React client.
 *
 * All auth requests go through the Next.js API proxy (/api/auth/*) which
 * forwards to the backend. This ensures cookies (session, OAuth state) are
 * set on the frontend origin, avoiding third-party cookie blocking when
 * frontend (Vercel) and backend (Railway) are on different domains.
 *
 * Type inference from server auth config fails because PrismaClient types
 * are server-only. We declare additionalFields manually below.
 */
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'),
  plugins: [
    inferAdditionalFields({
      user: {
        tenantId: { type: 'string', required: false, input: false },
        firstName: { type: 'string', required: false },
        lastName: { type: 'string', required: false },
        role: { type: 'string', required: false, input: false },
        isActive: { type: 'boolean', required: false, input: false },
        twoFactorEnabled: { type: 'boolean', required: false, input: false },
        onboardingComplete: { type: 'boolean', required: false, input: false },
      },
    }),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = '/auth/two-factor';
      },
    }),
    passkeyClient(),
    organizationClient(),
  ],
});

/**
 * Session user type including additionalFields from server config.
 * These fields exist at runtime via better-auth's user.additionalFields
 * but aren't reflected in the default client types.
 */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  // additionalFields from server auth config:
  firstName: string | null;
  lastName: string | null;
  role: string;
  tenantId: string | null;
  isActive: boolean;
  twoFactorEnabled: boolean;
  onboardingComplete: boolean;
}

// Convenience re-exports for consumers
export const { useSession, signIn, signUp, signOut } = authClient;
