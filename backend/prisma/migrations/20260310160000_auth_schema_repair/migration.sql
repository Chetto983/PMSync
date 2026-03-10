-- Repair Better Auth schema drift on long-lived production databases.
-- This migration is intentionally idempotent so it can safely run against
-- partially-upgraded Railway instances.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banReason" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMP(3);

ALTER TABLE "users" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'passwordHash'
  ) THEN
    ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;
  END IF;
END $$;

UPDATE "users"
SET "name" = COALESCE(
  NULLIF(TRIM(CONCAT(COALESCE("firstName", ''), ' ', COALESCE("lastName", ''))), ''),
  SPLIT_PART("email", '@', 1),
  ''
)
WHERE COALESCE("name", '') = '';

UPDATE "users"
SET "image" = "avatarUrl"
WHERE "image" IS NULL
  AND "avatarUrl" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'isMfaEnabled'
  ) THEN
    EXECUTE '
      UPDATE "users"
      SET "twoFactorEnabled" = COALESCE("isMfaEnabled", false)
      WHERE "twoFactorEnabled" = false
    ';
  END IF;
END $$;

UPDATE "users"
SET "role" = 'member'
WHERE "role" = 'user';

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "activeOrganizationId" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;

ALTER TABLE "sessions" ALTER COLUMN "tenantId" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "idToken" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "verifications" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "member" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'admin',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "invitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'admin',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "inviterId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "accounts_userId_idx" ON "accounts"("userId");
CREATE INDEX IF NOT EXISTS "accounts_userId_providerId_idx" ON "accounts"("userId", "providerId");
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications"("identifier");
CREATE INDEX IF NOT EXISTS "verifications_expiresAt_idx" ON "verifications"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "member_organizationId_userId_key" ON "member"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "member_userId_idx" ON "member"("userId");
CREATE INDEX IF NOT EXISTS "invitation_organizationId_idx" ON "invitation"("organizationId");
CREATE INDEX IF NOT EXISTS "invitation_email_idx" ON "invitation"("email");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_userId_fkey'
  ) THEN
    ALTER TABLE "accounts"
      ADD CONSTRAINT "accounts_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_organizationId_fkey'
  ) THEN
    ALTER TABLE "member"
      ADD CONSTRAINT "member_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_userId_fkey'
  ) THEN
    ALTER TABLE "member"
      ADD CONSTRAINT "member_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invitation_organizationId_fkey'
  ) THEN
    ALTER TABLE "invitation"
      ADD CONSTRAINT "invitation_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invitation_inviterId_fkey'
  ) THEN
    ALTER TABLE "invitation"
      ADD CONSTRAINT "invitation_inviterId_fkey"
      FOREIGN KEY ("inviterId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
