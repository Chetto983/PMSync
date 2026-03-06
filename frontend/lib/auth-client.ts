import { createAuthClient } from "better-auth/react";

/**
 * better-auth React client for use in auth pages (sign-in, sign-up, etc.).
 *
 * No baseURL needed -- auth API is on the same Next.js origin (port 3001).
 * createAuthClient defaults to current origin for all requests.
 * Setting a baseURL would break same-origin cookie handling.
 */
export const authClient = createAuthClient();
