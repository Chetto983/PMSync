# Calendar Module Refactoring Roadmap

## Executive Summary

This document outlines the comprehensive refactoring plan for the Calendar module to align with the patterns established in the Email module. The refactoring will reduce code duplication by ~1,200 lines, improve maintainability, and adopt 2025 best practices for Google and Microsoft Calendar APIs.

---

## Current State Analysis

### Module Statistics

| Metric | Current Value | Target |
|--------|---------------|--------|
| Total Lines | 8,448 | ~6,500 |
| Largest Service | 1,056 lines (CalendarService) | <500 lines |
| Code Duplication | ~40% | <10% |
| Services Count | 8 | 10 (more focused) |

### Current File Structure

```
calendar/
├── controllers/
│   ├── calendar.controller.ts          (232 lines)
│   └── calendar-webhook.controller.ts  (159 lines)
├── services/
│   ├── calendar.service.ts             (1,056 lines) ⚠️ TOO LARGE
│   ├── google-calendar-sync.service.ts (763 lines)  ⚠️ DUPLICATED
│   ├── microsoft-calendar-sync.service.ts (825 lines) ⚠️ DUPLICATED
│   ├── google-calendar-webhook.service.ts (524 lines) ⚠️ DUPLICATED
│   ├── microsoft-calendar-webhook.service.ts (566 lines) ⚠️ DUPLICATED
│   ├── calendar-sync-queue.service.ts  (393 lines)
│   ├── ics-parser.service.ts           (433 lines) ✓ GOOD
│   └── ics-generator.service.ts        (318 lines) ✓ GOOD
├── providers/
│   ├── base-calendar.provider.ts       (399 lines) ✓ GOOD
│   ├── google-calendar.provider.ts     (88 lines)  ✓ GOOD
│   └── microsoft-calendar.provider.ts  (226 lines) ✓ GOOD
├── workers/
│   └── calendar-sync.worker.ts
├── calendar-provider.factory.ts
└── calendar.module.ts
```

---

## Identified Issues

### 1. Massive Code Duplication in Sync Services (~600 lines)

**GoogleCalendarSyncService** and **MicrosoftCalendarSyncService** share 90% identical code:

| Method | Google Lines | Microsoft Lines | Identical % |
|--------|--------------|-----------------|-------------|
| `syncCalendar()` | 106 | 108 | 95% |
| `syncCalendarWithState()` | 65 | 66 | 95% |
| `runFullSync()` | 100 | 107 | 85% |
| `runIncrementalSync()` | 67 | 71 | 90% |
| `processEvents()` | 137 | 136 | 98% |
| `recordSyncError()` | 26 | 26 | 100% |
| `extractEventData()` | 62 | 139 | 70% (MS has extra logic) |
| `forceFullSync()` | 10 | 10 | 100% |
| `getSyncStates()` | 6 | 6 | 100% |

**Key Differences:**
- Google uses `syncToken`, Microsoft uses `deltaLink`
- Google uses `googleapis` SDK, Microsoft uses raw `axios`
- Different event property names

### 2. Webhook Service Duplication (~250 lines)

Both webhook services have ~80% identical code for:
- BullMQ queue initialization
- Job scheduling and handling
- Renewal logic
- Statistics gathering

### 3. Oversized CalendarService (1,056 lines)

Single service handles too many concerns:
- Calendar listing and aggregation
- Calendar CRUD operations
- Event CRUD operations
- Provider token management
- Google/Microsoft API calls

---

## 2025 Best Practices Research

### Recommended Libraries

#### Google Calendar API
- **Keep**: `googleapis` (official, well-maintained)
- **Alternative**: `@googleapis/calendar` for smaller bundle

**Source**: [Google Calendar Node.js Quickstart](https://developers.google.com/workspace/calendar/api/quickstart/nodejs)

#### Microsoft Graph API
- **Upgrade to**: `@microsoft/microsoft-graph-client` (official SDK)
- **Add**: `@microsoft/microsoft-graph-types` (TypeScript types)
- **Replace**: Raw `axios` calls

**Benefits**:
- Built-in auth handling
- Automatic retry with exponential backoff
- Proper TypeScript types
- Delta query support

**Source**: [Microsoft Graph SDK JavaScript](https://github.com/microsoftgraph/msgraph-sdk-javascript)

#### Third-Party Unified APIs (Considered but NOT recommended)
| Service | Pricing | Reason to Skip |
|---------|---------|----------------|
| Cronofy | €749+/mo | Cost, external dependency |
| Nylas | $0.90/account/mo | Cost at scale |
| Unipile | Fixed pricing | External dependency |

**Decision**: Continue with official SDKs for cost control and flexibility.

---

## Target Architecture

### New File Structure

```
calendar/
├── controllers/
│   ├── calendar.controller.ts
│   └── calendar-webhook.controller.ts
├── interfaces/
│   ├── calendar-sync.interface.ts      # NEW: Shared sync types
│   └── calendar-event.interface.ts     # NEW: Event DTOs
├── services/
│   ├── calendar-list.service.ts        # NEW: Calendar listing
│   ├── calendar-events.service.ts      # NEW: Event CRUD
│   ├── calendar-sync.service.ts        # NEW: Sync orchestration
│   ├── abstract-calendar-sync.service.ts  # NEW: Base sync logic
│   ├── google-calendar-sync.service.ts    # Refactored: extends abstract
│   ├── microsoft-calendar-sync.service.ts # Refactored: extends abstract
│   ├── abstract-calendar-webhook.service.ts # NEW: Base webhook logic
│   ├── google-calendar-webhook.service.ts   # Refactored: extends abstract
│   ├── microsoft-calendar-webhook.service.ts # Refactored: extends abstract
│   ├── calendar-sync-queue.service.ts
│   ├── ics-parser.service.ts
│   └── ics-generator.service.ts
├── providers/
│   ├── base-calendar.provider.ts
│   ├── google-calendar.provider.ts
│   └── microsoft-calendar.provider.ts
├── workers/
│   └── calendar-sync.worker.ts
├── calendar-provider.factory.ts
└── calendar.module.ts
```

---

## Implementation Phases

### Phase 1: Foundation (Day 1-2)

#### 1.1 Install Microsoft Graph SDK
```bash
npm install @microsoft/microsoft-graph-client @microsoft/microsoft-graph-types
```

#### 1.2 Create Shared Interfaces

**File**: `interfaces/calendar-sync.interface.ts`

```typescript
export interface CalendarSyncResult {
  success: boolean;
  providerId: string;
  eventsProcessed: number;
  newEvents: number;
  updatedEvents: number;
  deletedEvents: number;
  syncDuration: number;
  syncType: 'full' | 'incremental';
}

export interface CalendarSyncState {
  calendarId: string;
  syncToken?: string;  // Google
  deltaLink?: string;  // Microsoft
  lastSyncAt?: Date;
  consecutiveErrors: number;
}

export interface RawCalendarEvent {
  id: string;
  title?: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  timeZone: string;
  isCancelled: boolean;
  isDeleted: boolean;
  attendees?: any[];
  recurrence?: string[];
  metadata?: Record<string, any>;
}

export interface CalendarListItem {
  id: string;
  name: string;
  accessRole?: string;
  primary?: boolean;
}
```

#### 1.3 Create Abstract Sync Service

**File**: `services/abstract-calendar-sync.service.ts`

Template Method Pattern - shared logic with provider-specific hooks:

```typescript
export abstract class AbstractCalendarSyncService {
  // Shared methods (implemented once)
  async syncCalendar(providerId: string, forceFullSync = false): Promise<CalendarSyncResult>
  protected async processEvents(events: RawCalendarEvent[], ...): Promise<ProcessResult>
  protected async recordSyncError(providerId: string, calendarId: string, error: unknown): Promise<void>
  async forceFullSync(providerId: string): Promise<void>
  async getSyncStates(providerId: string): Promise<CalendarSyncState[]>

  // Abstract methods (provider-specific)
  protected abstract get providerType(): 'google' | 'microsoft';
  protected abstract get syncTokenField(): 'syncToken' | 'deltaLink';
  protected abstract fetchCalendarList(accessToken: string): Promise<CalendarListItem[]>;
  protected abstract fetchEvents(accessToken: string, calendarId: string, syncToken?: string): Promise<{
    events: RawCalendarEvent[];
    nextSyncToken?: string;
  }>;
  protected abstract extractEventData(rawEvent: any, calendarId: string, providerId: string, tenantId: string, calendarName: string): RawCalendarEvent;
}
```

### Phase 2: Sync Service Refactoring (Day 3-4)

#### 2.1 Refactor GoogleCalendarSyncService

- Extend `AbstractCalendarSyncService`
- Implement abstract methods for Google-specific API calls
- Keep `googleapis` client usage

**Estimated reduction**: 400+ lines

#### 2.2 Refactor MicrosoftCalendarSyncService

- Extend `AbstractCalendarSyncService`
- Replace `axios` with `@microsoft/microsoft-graph-client`
- Use `@microsoft/microsoft-graph-types` for type safety
- Implement abstract methods for Microsoft-specific API calls

**Benefits**:
- Built-in auth token management
- Automatic retry with exponential backoff
- Proper delta query support
- IntelliSense for Graph objects

**Example Microsoft Graph Client usage**:
```typescript
import { Client } from '@microsoft/microsoft-graph-client';
import { Event } from '@microsoft/microsoft-graph-types';

const client = Client.init({
  authProvider: (done) => done(null, accessToken),
});

// Delta query for incremental sync
const response = await client
  .api('/me/calendars/{id}/calendarView/delta')
  .query({ startDateTime, endDateTime })
  .get();

// Events are typed automatically
const events: Event[] = response.value;
const deltaLink: string = response['@odata.deltaLink'];
```

**Estimated reduction**: 200+ lines

### Phase 3: CalendarService Split (Day 5-6)

#### 3.1 Create CalendarListService

**Responsibility**: Calendar listing and management

```typescript
@Injectable()
export class CalendarListService {
  async listCalendars(tenantId: string): Promise<{ calendars: Calendar[]; total: number }>
  async createCalendar(tenantId: string, data: CreateCalendarDto): Promise<Calendar>
  async updateCalendarPreferences(tenantId: string, providerId: string, calendarId: string, data: UpdatePreferencesDto): Promise<void>
}
```

#### 3.2 Create CalendarEventsService

**Responsibility**: Event CRUD operations

```typescript
@Injectable()
export class CalendarEventsService {
  async listEvents(tenantId: string, filters: ListEventsFilters): Promise<{ events: CalendarEvent[]; total: number }>
  async getEvent(tenantId: string, eventId: string): Promise<CalendarEvent>
  async createEvent(tenantId: string, data: CreateEventDto): Promise<CalendarEvent>
  async updateEvent(tenantId: string, eventId: string, data: UpdateEventDto): Promise<CalendarEvent>
  async deleteEvent(tenantId: string, eventId: string): Promise<void>
  async cancelEvent(tenantId: string, eventId: string, reason?: string): Promise<void>
}
```

#### 3.3 Refactor CalendarService (Coordinator)

**Responsibility**: Orchestration and sync management

```typescript
@Injectable()
export class CalendarService {
  // Delegate to focused services
  constructor(
    private readonly listService: CalendarListService,
    private readonly eventsService: CalendarEventsService,
    private readonly googleSync: GoogleCalendarSyncService,
    private readonly microsoftSync: MicrosoftCalendarSyncService,
  ) {}

  async syncProvider(tenantId: string, providerId: string): Promise<SyncResult>
  async listEventAttachments(tenantId: string, eventId: string): Promise<Attachment[]>
  async getEventAttachment(tenantId: string, eventId: string, attachmentId: string): Promise<Attachment>
}
```

### Phase 4: Webhook Service Optimization (Day 7) - Optional

#### 4.1 Create AbstractCalendarWebhookService

Extract common BullMQ setup, job scheduling, and renewal logic.

**Estimated reduction**: 200+ lines

### Phase 5: Testing & Validation (Day 8)

1. Run existing tests
2. Fix any broken imports
3. Verify sync functionality
4. Test webhook notifications
5. Performance comparison

---

## Risk Mitigation

### Breaking Changes

| Risk | Mitigation |
|------|------------|
| Controller changes | Keep controller signatures unchanged |
| Service method changes | Maintain public API compatibility |
| Database schema | No schema changes required |
| Queue job format | Maintain backward compatibility |

### Rollback Plan

1. All changes in feature branch
2. Each phase is a separate commit
3. Can revert individual phases if needed
4. Existing sync jobs remain compatible

---

## Success Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Total Lines | 8,448 | ~6,500 | -23% |
| Duplication | ~40% | <10% | -75% |
| Max File Size | 1,056 | <500 | -53% |
| Services | 8 | 10 | +2 (focused) |
| Test Coverage | ~50% | ~70% | +20% |

---

## Dependencies

### NPM Packages to Add

```json
{
  "@microsoft/microsoft-graph-client": "^3.0.7",
  "@microsoft/microsoft-graph-types": "^2.40.0"
}
```

### NPM Packages to Keep

```json
{
  "googleapis": "^140.0.0",
  "@googleapis/calendar": "^14.1.0"
}
```

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: Foundation | 2 days | Interfaces, Abstract base class |
| Phase 2: Sync Refactor | 2 days | Google/Microsoft sync services |
| Phase 3: Service Split | 2 days | CalendarListService, CalendarEventsService |
| Phase 4: Webhook (Optional) | 1 day | AbstractWebhookService |
| Phase 5: Testing | 1 day | All tests passing |

**Total**: 7-8 days

---

## Sources

- [Google Calendar API Node.js Quickstart](https://developers.google.com/workspace/calendar/api/quickstart/nodejs)
- [Google APIs Node.js Client](https://github.com/googleapis/google-api-nodejs-client)
- [@googleapis/calendar NPM](https://www.npmjs.com/package/@googleapis/calendar)
- [Microsoft Graph SDK JavaScript](https://github.com/microsoftgraph/msgraph-sdk-javascript)
- [@microsoft/microsoft-graph-client NPM](https://www.npmjs.com/package/@microsoft/microsoft-graph-client)
- [Microsoft Graph Delta Query Events](https://learn.microsoft.com/en-us/graph/delta-query-events)
- [Best Calendar APIs 2025 - Cronofy](https://www.cronofy.com/blog/best-calendar-apis)
- [Nylas Calendar API](https://www.nylas.com/products/calendar-api/)

---

## Appendix: Email Module Patterns Reference

The Calendar module refactoring follows patterns established in the Email module:

### Service Separation Pattern

| Email Module | Calendar Module |
|-------------|-----------------|
| `EmailsService` (CRUD) | `CalendarEventsService` |
| `EmailSendService` | N/A (events created via provider) |
| `EmailFetchService` | `CalendarSyncService` |
| `EmailSyncBackService` | Bidirectional sync in Events service |

### Interface Pattern

All services define clear interfaces at the top of files for:
- Input DTOs
- Output types
- Filter options

### Bulk Operation Pattern

- Fetch all existing records in ONE query
- Prepare operations in memory
- Execute in single transaction
- Fire-and-forget for side effects (WebSocket, sync)

### Error Handling Pattern

- Transactional operations with timeout
- Continue-on-error for batch operations
- Record errors in sync state
- Exponential backoff for API calls
