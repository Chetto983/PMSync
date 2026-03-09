import { createAuthClient } from "better-auth/react";

/**
 * better-auth React client for use in auth pages (sign-in, sign-up, etc.).
 *
 * No baseURL needed -- auth API is on the same Next.js origin (port 3001).
 * createAuthClient defaults to current origin for all requests.
 * Setting a baseURL would break same-origin cookie handling.
 *
 * Type inference from server auth config (`typeof auth`) fails because
 * PrismaClient types are server-only. Session user additionalFields
 * (firstName, lastName, role, tenantId, isActive) are still available
 * at runtime -- they just won't be typed until better-auth exposes a
 * shared type export. Consumers can use InferSessionFromClient if needed.
 */
export const authClient = createAuthClient();

// Convenience re-exports for consumers
export const { useSession, signIn, signUp, signOut } = authClient;
