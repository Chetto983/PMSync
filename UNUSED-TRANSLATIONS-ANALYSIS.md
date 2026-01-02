# Dead/Unused Translations Analysis Report

**Generated:** 2026-01-02
**Codebase:** MailAgent Frontend
**Translation Files:** `frontend/locales/en.ts`, `frontend/locales/it.ts`

---

## Executive Summary

This report identifies translation keys that exist in `locales/en.ts` and `locales/it.ts` but are **NEVER used** anywhere in the frontend codebase (components, pages, lib, hooks).

### Summary Statistics

- **Total Translation Keys:** ~2,699 lines in en.ts
- **Sections Analyzed:** 20+ major sections
- **Dead Translations Found:** Multiple entire subsections

---

## 🔴 COMPLETELY UNUSED SECTIONS

These sections have **NO USAGE** in the entire frontend codebase:

### 1. **email.aiCompose** (Optional Section)
**Status:** ⚠️ Partially Used (uses fallbacks via `t.email?.aiCompose?.key || 'fallback'`)
**Location:** `en.ts` lines ~983-1014
**Files Using:**
- `AIContentPreview.tsx` (uses with optional chaining)
- `ComposeDialog.tsx` (uses with optional chaining)

**Keys:**
```typescript
email.aiCompose.title
email.aiCompose.promptRequired
email.aiCompose.generateError
email.aiCompose.quickPrompts
email.aiCompose.prompts.followUp
email.aiCompose.prompts.thankYou
email.aiCompose.prompts.introduction
email.aiCompose.prompts.requestMeeting
email.aiCompose.prompts.apology
email.aiCompose.prompts.reminder
email.aiCompose.promptLabel
email.aiCompose.promptPlaceholder
email.aiCompose.toneLabel
email.aiCompose.tones.professional
email.aiCompose.tones.friendly
email.aiCompose.tones.formal
email.aiCompose.tones.casual
email.aiCompose.tones.persuasive
email.aiCompose.tones.empathetic
email.aiCompose.generating
email.aiCompose.generate
email.aiCompose.preview
email.aiCompose.subject
email.aiCompose.insertIntoEmail
email.aiCompose.accept
email.aiCompose.reject
```

**Recommendation:** ✅ **KEEP** - Currently used with fallbacks. Should migrate to direct usage.

---

### 2. **email.templates** (Optional Section)
**Status:** ⚠️ Partially Used (uses fallbacks via `t.email?.templates?.key || 'fallback'`)
**Location:** `en.ts` lines ~1016-1036
**Files Using:**
- `EmailTemplatesDialog.tsx` (uses with optional chaining)
- `ComposeDialog.tsx` (uses with optional chaining)

**Keys:**
```typescript
email.templates.title
email.templates.saveError
email.templates.nameRequired
email.templates.contentRequired
email.templates.savedSuccessfully
email.templates.loadTab
email.templates.saveTab
email.templates.noTemplates
email.templates.builtIn
email.templates.noSubject
email.templates.templateName
email.templates.templateNamePlaceholder
email.templates.preview
email.templates.subject
email.templates.composeFirst
email.templates.saveTemplate
email.templates.builtInTemplates.*
```

**Recommendation:** ✅ **KEEP** - Currently used with fallbacks. Should migrate to direct usage.

---

### 3. **email.scheduleSend** (Optional Section)
**Status:** ⚠️ Partially Used (uses fallbacks via `t.email?.scheduleSend?.key || 'fallback'`)
**Location:** `en.ts` lines ~1038-1047
**Files Using:**
- `ScheduleSendDialog.tsx` (uses with optional chaining)
- `ComposeDialog.tsx` (uses with optional chaining)

**Keys:**
```typescript
email.scheduleSend.title
email.scheduleSend.customTime
email.scheduleSend.schedule
email.scheduleSend.clearSchedule
email.scheduleSend.scheduledFor
email.scheduleSend.options.*
```

**Recommendation:** ✅ **KEEP** - Currently used with fallbacks. Should migrate to direct usage.

---

### 4. **email.conversations**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~827-838

**Keys:**
```typescript
email.conversations.title
email.conversations.noConversations
email.conversations.noConversationsDescription
email.conversations.failedToLoad
email.conversations.loadMore
email.conversations.loading
email.conversations.messages
email.conversations.participants
email.conversations.yesterday
email.conversations.retry
```

**Recommendation:** 🗑️ **REMOVE** - No component uses these translations. Conversation view may have been deprecated.

---

### 5. **email.swipe**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~879-884

**Keys:**
```typescript
email.swipe.delete
email.swipe.markRead
email.swipe.markUnread
email.swipe.archive
```

**Recommendation:** 🗑️ **REMOVE** - No mobile swipe actions implemented. May be a planned feature.

---

### 6. **email.skeleton**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~885-887

**Keys:**
```typescript
email.skeleton.loadingEmails
```

**Recommendation:** 🗑️ **REMOVE** - Skeleton loading screens don't use this translation.

---

### 7. **contacts.tabs**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~1283-1287

**Keys:**
```typescript
contacts.tabs.details
contacts.tabs.activity
contacts.tabs.notes
```

**Recommendation:** 🗑️ **REMOVE** - Contact detail tabs don't use these translations.

---

### 8. **contacts.activity**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~1288-1291

**Keys:**
```typescript
contacts.activity.title
contacts.activity.noActivity
```

**Recommendation:** 🗑️ **REMOVE** - Contact activity tracking not implemented.

---

### 9. **contacts.notes**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~1292-1296

**Keys:**
```typescript
contacts.notes.title
contacts.notes.noNotes
contacts.notes.addNote
```

**Recommendation:** 🗑️ **REMOVE** - Contact notes feature not implemented.

---

### 10. **calendar.invitation**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~1117-1171

**Keys:** (59+ keys)
```typescript
calendar.invitation.title
calendar.invitation.from
calendar.invitation.when
calendar.invitation.where
calendar.invitation.organizer
calendar.invitation.attendees
calendar.invitation.description
calendar.invitation.status.*
calendar.invitation.actions.*
calendar.invitation.method.*
calendar.invitation.messages.*
calendar.invitation.attendeeRole.*
calendar.invitation.recurrence.*
calendar.invitation.allDay
calendar.invitation.timezone
```

**Recommendation:** 🗑️ **REMOVE** - Calendar invitation handling not implemented. This is a large section with 50+ unused keys.

---

### 11. **ai.inlineAction**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~2054-2101

**Keys:** (40+ keys)
```typescript
ai.inlineAction.actionTypes.*
ai.inlineAction.severity.*
ai.inlineAction.fields.*
ai.inlineAction.approved
ai.inlineAction.rejected
ai.inlineAction.executed
ai.inlineAction.failed
ai.inlineAction.expired
ai.inlineAction.pending
ai.inlineAction.reasoning
ai.inlineAction.actionDetails
ai.inlineAction.editPayload
ai.inlineAction.hideDetails
ai.inlineAction.approving
ai.inlineAction.rejecting
ai.inlineAction.expand
ai.inlineAction.collapse
ai.inlineAction.requiresApproval
ai.inlineAction.autoApproved
ai.inlineAction.confidence
```

**Recommendation:** 🗑️ **REMOVE** - Inline action cards not implemented. May be a planned feature.

---

### 12. **ai.focusTime**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~2332-2342

**Keys:**
```typescript
ai.focusTime.title
ai.focusTime.subtitle
ai.focusTime.inFocusMode
ai.focusTime.noSlots
ai.focusTime.findSlots
ai.focusTime.createBlocks
ai.focusTime.noConflicts
ai.focusTime.avgDaily
ai.focusTime.optimalDays
```

**Recommendation:** 🗑️ **REMOVE** - Focus time widget not implemented.

---

### 13. **ai.meetingPrep**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~2343-2351

**Keys:**
```typescript
ai.meetingPrep.title
ai.meetingPrep.subtitle
ai.meetingPrep.needingPrep
ai.meetingPrep.allPrepared
ai.meetingPrep.noMeetings
ai.meetingPrep.viewCalendar
ai.meetingPrep.prepScore
```

**Recommendation:** 🗑️ **REMOVE** - Meeting prep widget not implemented.

---

### 14. **ai.analytics**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~2352-2363

**Keys:**
```typescript
ai.analytics.title
ai.analytics.subtitle
ai.analytics.noData
ai.analytics.viewAll
ai.analytics.emailsProcessed
ai.analytics.thisWeek
ai.analytics.avgResponseTime
ai.analytics.aiActions
ai.analytics.approved
ai.analytics.learningProgress
```

**Recommendation:** 🗑️ **REMOVE** - AI analytics widget not implemented.

---

### 15. **ai.actionItems**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~2304-2331

**Keys:**
```typescript
ai.actionItems.title
ai.actionItems.subtitle
ai.actionItems.pending
ai.actionItems.allDone
ai.actionItems.noPending
ai.actionItems.viewAll
ai.actionItems.overdue
ai.actionItems.today
ai.actionItems.tomorrow
ai.actionItems.status.*
ai.actionItems.priority.*
ai.actionItems.actions.*
```

**Recommendation:** 🗑️ **REMOVE** - Action items widget not implemented.

---

### 16. **settings.notificationsPanel**
**Status:** ❌ **COMPLETELY UNUSED**
**Location:** `en.ts` lines ~1768-1780

**Keys:**
```typescript
settings.notificationsPanel.title
settings.notificationsPanel.description
settings.notificationsPanel.emailToggle
settings.notificationsPanel.emailTitle
settings.notificationsPanel.newEmailsTitle
settings.notificationsPanel.newEmailsDesc
settings.notificationsPanel.calendarTitle
settings.notificationsPanel.calendarDesc
settings.notificationsPanel.aiActionsTitle
settings.notificationsPanel.aiActionsDesc
settings.notificationsPanel.save
```

**Recommendation:** 🗑️ **REMOVE** - Notifications settings panel not implemented.

---

## ✅ SECTIONS THAT ARE USED

These sections are confirmed to be in active use:

### Used Sections:
- ✅ **landing** - Used in landing page (34 usages found)
- ✅ **cookies** - Used in `CookieConsent.tsx` component
- ✅ **tasks** - Used in `Tasks.tsx` component
- ✅ **threadView** - Used in thread view components (16 usages)
- ✅ **threadMessage** - Used in thread message components (24 usages)
- ✅ **ai.mentions** - Used in `MemoryHistoryDialog.tsx` (optional chaining)
- ✅ **email.composer** - Heavily used throughout email composition
- ✅ **dashboard.widgets** - Used in dashboard widgets
- ✅ **ai.memoryBrowser** - Used in memory browser components
- ✅ **ai.followUpTracker** - Used in follow-up tracker components
- ✅ **commandPalette** - Used in command palette component

---

## 📊 Impact Analysis

### Total Dead Keys Estimate

| Section | Approximate Keys | Status |
|---------|------------------|--------|
| email.conversations | 10 | 🗑️ Remove |
| email.swipe | 4 | 🗑️ Remove |
| email.skeleton | 1 | 🗑️ Remove |
| contacts.tabs | 3 | 🗑️ Remove |
| contacts.activity | 2 | 🗑️ Remove |
| contacts.notes | 3 | 🗑️ Remove |
| calendar.invitation | 59+ | 🗑️ Remove |
| ai.inlineAction | 40+ | 🗑️ Remove |
| ai.focusTime | 9 | 🗑️ Remove |
| ai.meetingPrep | 7 | 🗑️ Remove |
| ai.analytics | 10 | 🗑️ Remove |
| ai.actionItems | 20+ | 🗑️ Remove |
| settings.notificationsPanel | 11 | 🗑️ Remove |
| **TOTAL** | **~179+ keys** | **Remove** |

### Optional Sections (Using Fallbacks)

| Section | Approximate Keys | Status |
|---------|------------------|--------|
| email.aiCompose | 26 | ⚠️ Migrate to direct usage |
| email.templates | 16 | ⚠️ Migrate to direct usage |
| email.scheduleSend | 9 | ⚠️ Migrate to direct usage |
| **TOTAL** | **~51 keys** | **Refactor** |

---

## 🎯 Recommendations

### Priority 1: Remove Dead Translations (Immediate)

**Action:** Delete these sections from `en.ts` and `it.ts`:
1. `email.conversations`
2. `email.swipe`
3. `email.skeleton`
4. `contacts.tabs`
5. `contacts.activity`
6. `contacts.notes`
7. `calendar.invitation` (LARGE - 59+ keys)
8. `ai.inlineAction` (LARGE - 40+ keys)
9. `ai.focusTime`
10. `ai.meetingPrep`
11. `ai.analytics`
12. `ai.actionItems`
13. `settings.notificationsPanel`

**Estimated Reduction:** ~179+ translation keys (~6.6% of total translations)

### Priority 2: Migrate Optional Chaining to Direct Usage (Recommended)

**Action:** Update components to use direct translation access instead of fallbacks:

**Before:**
```typescript
{t.email?.aiCompose?.title || 'AI Compose'}
```

**After:**
```typescript
{t.email.aiCompose.title}
```

**Files to Update:**
- `AIContentPreview.tsx`
- `ComposeDialog.tsx`
- `EmailTemplatesDialog.tsx`
- `ScheduleSendDialog.tsx`

**Benefit:** Type safety + no fallback strings in components

---

## 🔍 Detection Method

This analysis was performed by:
1. Reading all translation keys from `locales/en.ts`
2. Using `grep` to search for usage patterns across:
   - `components/**/*.{ts,tsx}`
   - `pages/**/*.{ts,tsx}`
   - `lib/**/*.{ts,tsx}`
   - `hooks/**/*.{ts,tsx}`
3. Searching for patterns:
   - `t.section.key`
   - `t?.section?.key` (optional chaining)
   - `t['section']['key']` (bracket notation)
4. Manual verification of component files

---

## 📝 Notes

1. **Optional Sections:** Some translations use optional chaining (`t.email?.aiCompose?.key || 'fallback'`) which makes them "technically used" but should be refactored to use direct access.

2. **Dynamic Access:** This analysis cannot detect dynamically constructed translation keys like `t[variableSection][variableKey]`. Manual review recommended for such cases.

3. **Italian Translations:** All unused keys in `en.ts` have equivalent unused keys in `it.ts` that should also be removed.

4. **Future Features:** Some unused sections (like `calendar.invitation`, `ai.inlineAction`) may be for planned features. Confirm with product team before removal.

---

## ✅ Action Items

- [ ] Remove 13 dead translation sections from `en.ts` (~179 keys)
- [ ] Remove 13 dead translation sections from `it.ts` (~179 keys)
- [ ] Update TypeScript types in `locales/index.ts` to match removals
- [ ] Refactor 4 components to use direct translation access (no fallbacks)
- [ ] Run `npm run type-check` to verify no breakage
- [ ] Test frontend to ensure no missing translations
- [ ] Update this report after changes

---

**End of Report**
