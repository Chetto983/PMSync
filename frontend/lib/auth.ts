import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { PrismaClient } from "@prisma/client";
import { checkHIBP } from "./hibp";
import { sendTransactionalEmail } from "./mail";

// Singleton PrismaClient to avoid creating new clients per request in dev
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      void sendTransactionalEmail(
        user.email,
        "Reset your password",
        `<p>Click the link to reset your password:</p><a href="${url}">${url}</a>`,
      );
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      void sendTransactionalEmail(
        user.email,
        "Verify your email address",
        `<p>Click the link to verify your email:</p><a href="${url}">${url}</a>`,
      );
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 min
      strategy: "compact",
    },
  },

  user: {
    additionalFields: {
      tenantId: { type: "string", required: false, input: false },
      firstName: { type: "string", required: false },
      lastName: { type: "string", required: false },
      role: { type: "string", required: false, defaultValue: "member" },
      isActive: { type: "boolean", required: false, defaultValue: true },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Intercept sign-up and password-reset to check HIBP
      if (ctx.path === "/sign-up/email" || ctx.path === "/reset-password") {
        const password = (ctx.body?.password ?? ctx.body?.newPassword) as
          | string
          | undefined;
        if (password) {
          const { breached } = await checkHIBP(password);
          if (breached) {
            throw new APIError("BAD_REQUEST", {
              message:
                "This password has appeared in data breaches and cannot be used",
            });
          }
        }
      }
    }),
  },
});
