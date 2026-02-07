-- AlterTable
ALTER TABLE "email_follow_ups" ADD COLUMN "detectedDeadline" TIMESTAMP(3),
ADD COLUMN "deadlineSource" TEXT;
