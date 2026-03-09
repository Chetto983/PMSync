import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields, twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';

/**
 * better-auth React client.
 *
 * Requests go directly to the backend Better Auth instance.
 * Cookies remain host-scoped on localhost, so they are still sent on the
 * frontend origin and can be forwarded by Next.js API routes when needed.
 *
 * Type inference from server auth config fails because PrismaClient types
 * are server-only. We declare additionalFields manually below.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
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
