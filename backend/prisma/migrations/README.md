# Database Migrations

This project currently uses `npx prisma db push` for development schema sync.

## For Production Deployment

When deploying to production, use proper migrations:

```bash
# Create migration from current schema
npx prisma migrate dev --name <migration_name>

# Apply migrations in production
npx prisma migrate deploy
```

## Manual Migration: CalendarSyncState (2025-12-12)

If you need to manually apply the `CalendarSyncState` table:

```sql
-- Create calendar_sync_states table for incremental sync support
CREATE TABLE IF NOT EXISTS "calendar_sync_states" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "calendarName" TEXT,
    "syncToken" TEXT,
    "deltaLink" TEXT,
    "lastFullSyncAt" TIMESTAMP(3),
    "lastIncrementalAt" TIMESTAMP(3),
    "fullSyncRequired" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sync_states_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on provider + calendar
CREATE UNIQUE INDEX "calendar_sync_states_providerId_calendarId_key"
ON "calendar_sync_states"("providerId", "calendarId");

-- Create indexes for common queries
CREATE INDEX "calendar_sync_states_providerId_idx" ON "calendar_sync_states"("providerId");
CREATE INDEX "calendar_sync_states_fullSyncRequired_idx" ON "calendar_sync_states"("fullSyncRequired");

-- Add foreign key constraint
ALTER TABLE "calendar_sync_states"
ADD CONSTRAINT "calendar_sync_states_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

## Purpose

The `CalendarSyncState` table stores per-calendar sync tokens for incremental sync:
- **Google Calendar**: Uses `syncToken` for delta sync
- **Microsoft Calendar**: Uses `deltaLink` for Graph API delta queries

This reduces API calls by ~95% after the initial full sync.
