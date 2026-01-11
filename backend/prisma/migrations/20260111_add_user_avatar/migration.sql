-- Add avatarUrl field to users table for profile pictures
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
