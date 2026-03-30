# Calendar & Contacts Audit — Findings

**Audit date:** 2026-03-30
**Auditor:** Phase 91 research + web research on provider best practices
**Baseline score:** TBD (to be scored after Phase 1-2 verification)

## Severity Levels

| Level | Code | Meaning |
|-------|------|---------|
| Critical | C | Data loss, security breach, or broken core workflow |
| High | H | Feature doesn't work as expected, user-visible bug |
| Medium | M | Suboptimal behavior, missing edge case handling |
| Low | L | Polish, UX improvement, nice-to-have |

---

## Calendar Findings

### Critical

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CAL-C1 | Webhook subscription expiration not auto-renewed | `google-calendar-webhook.service.ts`, `microsoft-calendar-webhook.service.ts` | Google webhooks expire (configurable TTL). No cron job to renew before expiry. Events missed after expiration. |
| CAL-C2 | Sync token expiration has no full-sync fallback | `abstract-calendar-sync.service.ts` | Google sync tokens can expire. If expired, API returns error but service may not gracefully fall back to full sync. |
| CAL-C3 | Microsoft delta token HTTP 410 not handled | `microsoft-calendar-sync.service.ts` | MS Graph returns 410 when delta token expired/invalidated. Requires full resync. Error handling TBD. |

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CAL-H1 | RSVP buttons not verified end-to-end | `RSVPButtons.tsx`, `email-calendar-invite.controller.ts` | RSVPButtons component exists but no E2E test confirms the full flow: click → API → ICS generation → email sent. |
| CAL-H2 | Calendar invite endpoints live in email module | `email-calendar-invite.controller.ts` | Invites at `/emails/:id/calendar-invite/*` instead of `/calendar/*`. May confuse developers and cause 404s. |
| CAL-H3 | DST/timezone edge cases in event creation | `calendar-events.service.ts` | Timezone-aware events across DST transitions may produce incorrect times. No specific tests for DST boundary. |
| CAL-H4 | Focus-time and meeting-prep not verified on production | `focus-time.service.ts`, `meeting-prep.service.ts` | AI-powered features exist but no production validation. May fail silently with no events or no AI provider. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CAL-M1 | No conflict detection for recurring events | `calendar-conflict.service.ts` | Conflict detection may not expand recurring event instances. Could miss overlapping recurrences. |
| CAL-M2 | ICS parser doesn't handle all VTIMEZONE variants | `ics-parser.service.ts` | iTIP VTIMEZONE definitions vary wildly. Edge cases with non-standard timezone IDs not tested. |
| CAL-M3 | Calendar sync queue lacks dead-letter queue monitoring | `calendar-sync-queue.service.ts` | Failed sync jobs may silently accumulate in DLQ without alerting. |
| CAL-M4 | Attachment download not size-limited | `calendar.controller.ts` | Event attachment endpoints may serve arbitrarily large files without streaming or size caps. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CAL-L1 | No calendar color preference sync from provider | `calendar-list.service.ts` | User colors set in Google/Microsoft calendars not imported. Only local color prefs. |
| CAL-L2 | Meeting-prep cache not tenant-isolated | `meeting-prep.service.ts` | AI meeting prep results may not be properly scoped per tenant in cache. |

---

## Contacts Findings

### Critical

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CON-C1 | Google People API sync token 7-day expiry not handled | `google-contacts-sync.service.ts` | Sync tokens expire after 7 days. If user doesn't sync for a week, EXPIRED_SYNC_TOKEN error may not trigger full resync gracefully. |
| CON-C2 | Contact etag not checked on updates | `contact-crud.service.ts`, `google-contacts-sync.service.ts` | Google People API requires etag for conflict-free updates. Missing etag can cause concurrent modification conflicts. |
| CON-C3 | Parallel contact mutations per user | `contacts.service.ts` | Google requires sequential writes per user. Parallel mutations (e.g., bulk import + sync) can cause failures. |

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CON-H1 | No vCard import UI | `ContactSidebar.tsx`, `ContactFormDialog.tsx` | Backend POST `/contacts/import/vcard` works. No frontend button or dialog exposes this. |
| CON-H2 | Contact history endpoint is a stub | `contacts.controller.ts` | GET `/contacts/:id/history` returns `[]` always. `ContactActivityFeed` shows perpetual empty state. |
| CON-H3 | No duplicate detection on import | `contacts-import.service.ts` | vCard import creates contacts without checking for duplicates. Can flood DB with duplicate entries. |
| CON-H4 | Microsoft contacts webhook reliability unknown | `microsoft-contacts-webhook.service.ts` | MS Graph webhook notifications for contacts have known reliability issues. No fallback polling verified. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CON-M1 | VCard encoding handling incomplete | `contacts-import.service.ts` | vCard 2.1 quoted-printable and Latin-1 encoding may corrupt non-Latin characters. Only UTF-8 fully tested. |
| CON-M2 | Relationship score not recalculated on email sync | `relationship-score.service.ts` | Scores may be stale if not triggered after new email interactions. Recalculation cadence unclear. |
| CON-M3 | Contact photo sync etag not compared | `contacts.service.ts` | Photos downloaded on every sync instead of comparing etag. Wastes bandwidth and API quota. |
| CON-M4 | Bulk delete lacks undo / soft-delete | `contacts.controller.ts` | DELETE `/contacts/bulk` appears to hard-delete. No undo window for accidental bulk deletes. |
| CON-M5 | Contact search doesn't use GIN trigram index efficiently | `contact-crud.service.ts` | Full-text search may not leverage the PostgreSQL GIN trigram index for fuzzy matching. |

### Low

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| CON-L1 | No contact merge UI | Frontend | Duplicates cannot be merged from the UI. Must be resolved manually in DB. |
| CON-L2 | Extract-from-emails doesn't deduplicate | `contacts-import.service.ts` | Extracting contacts from emails can create duplicates of existing contacts. |
| CON-L3 | Contact sidebar filter state not persisted | `ContactSidebar.tsx` | Filters reset on page navigation. No localStorage or URL param persistence. |

---

## Reminders Findings

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| REM-H1 | No Kanban board as specified in FE-14 | `RemindersBoard.tsx` | Component renders a flat filtered list, not a multi-column Kanban. Status chips provide filtering but not drag-drop reordering. |
| REM-H2 | Italian field names in API responses | `reminder.service.ts` | DTO uses Italian names (titolo, descrizione, priorita, etc.). Internationalization inconsistency. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| REM-M1 | No reminder controller unit tests | `reminder.controller.ts` | No dedicated test file found for the reminder controller. Only service-level tests. |
| REM-M2 | Soft-delete marks as "annullato" not "deleted" | `reminder.service.ts` | DELETE endpoint sets status to Italian "annullato". May confuse non-Italian developers. |

---

## Dashboard Widget Findings

### Critical

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| DASH-C1 | Widgets pull email data from 3 inconsistent sources | `UnreadEmailsWidget`, `PriorityInboxWidget`, `AiTriageWidget` | Unread: `isRead=false`; Priority: `isImportant=true`; Triage: `isAutoTriaged=true`. Same email can appear in all 3 with different priority signals. No single source of truth. |
| DASH-C2 | Dashboard counts don't match sidebar counts | `use-dashboard.ts` vs `useFolderManagement.ts` | Dashboard `useDashboardStats()` queries emails independently from sidebar `Folder.unreadCount`. Gmail label/folder mismatch causes count divergence. |

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| DASH-H1 | Briefing widget duplicates insight widget data | `BriefingWidget`, `PredictiveInsightsWidget` | Both show urgent email counts, deadlines, follow-ups. PredictiveInsightsWidget aggregates the same hooks BriefingWidget uses. Redundant API calls and contradictory numbers possible. |
| DASH-H2 | Deadlines widget has unverified AI fallback | `DeadlinesWidget` | Primary: `aiChatApi.getUpcomingDeadlines()`. Fallback: `calendarApi.listEvents()`. Calendar events are NOT deadlines — conflating two concepts. |
| DASH-H3 | Email triage not the source of truth for priority | `PriorityInboxWidget` vs `AiTriageWidget` | PriorityInboxWidget uses `isImportant=true` (starred/flagged = manual signal). AiTriageWidget uses `aiPriority` (AI signal). Two competing priority systems with no reconciliation. |
| DASH-H4 | Stale contacts widget has CRM/legacy dual path | `StaleContactsWidget` | Primary: `crmApi.getStaleContacts()`. Fallback: `contactsApi.listContacts()` + manual calculation. Two different scoring algorithms produce different results. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| DASH-M1 | Email trend analytics not consent-gated consistently | `TrendChartsWidget` | Requires `email_analytics` consent but other email widgets don't. Same email data, different consent requirements. |
| DASH-M2 | Triage concurrency semaphore is in-memory, not Redis | `email-triage.service.ts` | In-memory semaphore works for single instance but breaks with horizontal scaling. |
| DASH-M3 | Dashboard stats query duplicates folder count query | `useDashboardStats()` | Queries email counts separately from sidebar folder counts. Two queries for overlapping data. |

---

## Legacy Code Findings

### Critical

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| LEG-C1 | GraphExpansionService still used as fallback | `graph-expansion.service.ts`, `rag-tools.service.ts` | Marked @deprecated, replaced by EntityGraphService. But rag-tools.service.ts still has "Legacy fallback: use GraphExpansionService" at line 310. |
| LEG-C2 | ConversationMessage.content field deadline approaching | `frontend/lib/api/ai.ts:139` | @deprecated deadline: 2026-06-01. Must migrate to `parts` field before deadline. All consumers must switch. |

### High

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| LEG-H1 | Deprecated health/metrics endpoints still active | `health.service.ts`, `queue-health.service.ts` | @deprecated in favor of /metrics (prom-client, Phase 46). Old endpoints still responding, consuming resources. |
| LEG-H2 | Session.tenantId deprecated but still in schema | `tenant-scoped-models.ts:9` | better-auth uses cross-tenant sessions. Field nullable but still queried in places. |
| LEG-H3 | Header theme toggle props backward compat kept | `Header.tsx` | onThemeToggle, isDarkMode props @deprecated. ThemeToggle component is the replacement. Dead code path. |
| LEG-H4 | Deprecated dashboard hooks with confusing names | `use-dashboard.ts` | `importantEmailsOptions()` and `useImportantEmails()` both marked @deprecated, pointing at themselves. Circular deprecation notice. |
| LEG-H5 | AI DTO remnants from VoltAgent era | `ai.dto.ts:12-13` | ChatDto, ChatResponseDto removed but comments retained "for reference". Dead code. |
| LEG-H6 | multiAgentApi legacy shim still exists | `frontend/lib/api/` | Wraps aiChatApi. No code should use this anymore. |

### Medium

| ID | Finding | Component | Evidence |
|----|---------|-----------|----------|
| LEG-M1 | hmacForBlindIndex deprecated function | `field-encryption.utils.ts:69` | Old HMAC replaced with SHA256 version. Function still exported. |
| LEG-M2 | UsageTracking deprecated method | `usage-tracking.service.ts:303` | Should use CostProtectionService.canProceed() instead. |
| LEG-M3 | Chat thread list legacy adapter | `chat-thread-list-adapter.tsx:220` | "Legacy history adapter" comment. Entity graph system is the replacement. |

---

## Summary

| Module | Critical | High | Medium | Low | Total |
|--------|----------|------|--------|-----|-------|
| Calendar | 3 | 4 | 4 | 2 | 13 |
| Contacts | 3 | 4 | 5 | 3 | 15 |
| Reminders | 0 | 2 | 2 | 0 | 4 |
| Dashboard | 2 | 4 | 3 | 0 | 9 |
| Legacy | 2 | 6 | 3 | 0 | 11 |
| **Total** | **10** | **20** | **17** | **5** | **52** |
