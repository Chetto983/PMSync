-- Phase 59-03: Grandfather existing users for email verification
-- Run ONCE before enabling requireEmailVerification: true
-- Prevents lockout of users who signed up before verification was required
--
-- Usage: psql -d pmsync -f migrate-verify-existing-users.sql

UPDATE "users"
SET "emailVerified" = true
WHERE "emailVerified" = false OR "emailVerified" IS NULL;

-- Report how many users were updated
SELECT COUNT(*) AS users_verified
FROM "users"
WHERE "emailVerified" = true;
