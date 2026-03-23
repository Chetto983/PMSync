-- Add missing indexes for cleanup/retention queries to prevent full table scans at scale.

-- Session: daily expired session cleanup
CREATE INDEX IF NOT EXISTS "sessions_expiresAt_idx" ON "sessions" ("expiresAt");

-- Invitation: daily expired invitation cleanup
CREATE INDEX IF NOT EXISTS "invitation_expiresAt_idx" ON "invitation" ("expiresAt");

-- AIMemory: daily expired memory cleanup
CREATE INDEX IF NOT EXISTS "ai_memories_expiresAt_idx" ON "ai_memories" ("expiresAt");

-- AiDraftFeedback: 90-day retention cleanup
CREATE INDEX IF NOT EXISTS "ai_draft_feedback_createdAt_idx" ON "ai_draft_feedback" ("createdAt");

-- Email: trash purge (soft-deleted emails older than 24h)
CREATE INDEX IF NOT EXISTS "emails_tenantId_isDeleted_updatedAt_idx" ON "emails" ("tenantId", "isDeleted", "updatedAt");

-- Reminder: completed/cancelled retention cleanup
CREATE INDEX IF NOT EXISTS "reminders_status_updatedAt_idx" ON "reminders" ("status", "updatedAt");

-- CalendarEvent: deleted/cancelled event retention cleanup
CREATE INDEX IF NOT EXISTS "calendar_events_isDeleted_updatedAt_idx" ON "calendar_events" ("isDeleted", "updatedAt");
CREATE INDEX IF NOT EXISTS "calendar_events_isCancelled_updatedAt_idx" ON "calendar_events" ("isCancelled", "updatedAt");
