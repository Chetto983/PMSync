---
phase: 0141-contact-360-hover-cards
plan: 01
subsystem: ui, api
tags: [contacts, timeline, tanstack-query, nestjs, prisma, mui]

# Dependency graph
requires:
  - phase: 0137-unified-task-model
    provides: ManualTask model with contactId FK
provides:
  - "GET /contacts/:id/timeline endpoint aggregating emails, CRM activities, tasks, tickets, meetings"
  - "useContactTimeline infinite query hook with cursor pagination"
  - "Upgraded ContactActivityFeed with unified multi-source timeline"
  - "Related Emails and Upcoming Tasks sections in ContactCrmTab"
affects: [contact-detail, crm-context, hover-cards]

# Tech tracking
tech-stack:
  added: []
  patterns: [parallel-prisma-aggregation, cursor-pagination-timeline, infinite-query-hook]

key-files:
  created:
    - backend/src/modules/contacts/dto/contact-timeline.dto.ts
    - backend/src/modules/contacts/services/contact-timeline.service.ts
  modified:
    - backend/src/modules/contacts/controllers/contacts.controller.ts
    - backend/src/modules/contacts/contacts.module.ts
    - frontend/lib/api/contacts.ts
    - frontend/hooks/queries/contacts-keys.ts
    - frontend/hooks/queries/use-contacts.ts
    - frontend/components/contacts/contact-detail/ContactActivityFeed.tsx
    - frontend/components/contacts/contact-detail/ContactCrmTab.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts

key-decisions:
  - "Return total=-1 for timeline to avoid expensive count query; cursor pagination does not need total"
  - "Exclude CRM EMAIL type from timeline to prevent duplicate entries with actual email records"
  - "Over-fetch calendar events (3x limit) then filter in-app by attendee email match"
  - "Reuse unified timeline data for Related Emails and Upcoming Tasks in CrmTab instead of separate API calls"

patterns-established:
  - "Parallel Prisma aggregation: Promise.all over 6 sources, merge in-memory, sort, paginate"
  - "Timeline entry ID prefixing (timeline-email-sent-*, timeline-task-*) for cross-source dedup"

requirements-completed: [CTX-03, CTX-04]

# Metrics
duration: 6min
completed: 2026-04-02
---

# Phase 141 Plan 01: Contact Timeline & CRM Sections Summary

**Unified contact timeline endpoint aggregating 6 data sources with cursor pagination, plus Related Emails and Upcoming Tasks sections in CRM tab**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-02T12:03:25Z
- **Completed:** 2026-04-02T12:09:25Z
- **Tasks:** 2/2
- **Files modified:** 11

## Accomplishments

### Task 1: Backend unified timeline endpoint
- Created `TimelineEntryDto`, `TimelineResponseDto`, `TimelineQueryDto` DTOs with class-validator
- Created `ContactTimelineService` with 6 parallel query methods (sent emails, received emails, CRM activities, tasks, tickets, calendar meetings)
- Added `GET /contacts/:id/timeline` endpoint with cursor-based pagination
- All queries include `tenantId` for multi-tenant isolation
- CRM EMAIL activity type excluded to prevent duplication with real email records
- Calendar events filtered in-app by attendee email match (1-year lookback)
- **Commit:** `8eaa5bbe`

### Task 2: Frontend timeline upgrade and related entities sections
- Added 18 i18n keys across en.ts and it.ts for timeline, related emails, upcoming tasks
- Added `TimelineEntry`, `TimelineResponse` types and `getContactTimeline` API method
- Added `contactsKeys.timeline` query key and `useContactTimeline` infinite query hook
- Rewrote `ContactActivityFeed` to use unified timeline with `ActivityTimeline` component
- Added "Related Emails" section (5 most recent) to `ContactCrmTab` above deals
- Added "Upcoming Tasks" section (open/in-progress tasks) to `ContactCrmTab` above deals
- All sections handle loading, error, and empty states with translated messages
- **Commit:** `0d389575`

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all sections are wired to live data sources via the unified timeline endpoint.

## Self-Check: PASSED
