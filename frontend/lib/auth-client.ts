import { createAuthClient } from "better-auth/react";

/**
 * better-auth React client.
 *
 * No baseURL needed -- auth API is on the same Next.js origin (port 3001).
 * createAuthClient defaults to current origin for all requests.
 * Setting a baseURL would break same-origin cookie handling.
 *
 * Type inference from server auth config fails because PrismaClient types
 * are server-only. We declare additionalFields manually below.
 */
export const authClient = createAuthClient({
  plugins: [],
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
}

// Convenience re-exports for consumers
export const { useSession, signIn, signUp, signOut } = authClient;
