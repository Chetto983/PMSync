# UX & Mobile Design Audit Report

**Date:** 2026-03-23
**Scope:** All frontend pages
**Methodology:** UX Anti-Pattern Detection (13 categories) + Mobile Design Doctrine

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 14 |
| Medium | 32 |
| Low | 25 |
| **Total** | **72** |

**Top 3 systemic issues:**
1. **Destructive actions without confirmation** (8 findings across email, contacts, reminders, chat, admin)
2. **Touch targets below 44px minimum** (12+ findings across all pages)
3. **Hover-only controls inaccessible on touch/keyboard** (4 findings in chat and kanban)

---

## Critical (1)

| # | File:Line | Category | Issue | Fix |
|---|-----------|----------|-------|-----|
| 1 | `pages/dashboard/email/thread/[threadId].tsx:185` | Destructive Action | `handleDeleteThread` deletes entire thread (all emails) with zero confirmation. Calls `bulkDelete.mutateAsync(emailIds)` and immediately navigates away. Irreversible data loss. | Add confirmation dialog before bulk-deleting. |

---

## High (14)

### Destructive Actions (7)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 2 | `[threadId].tsx:202` | Archive thread with no confirmation/undo, navigates away immediately. | Add undo-snackbar or confirmation. |
| 3 | `ThreadViewOutlook.tsx:263` | Delete thread toolbar button fires `onDeleteThread` directly. | Same fix as #1 (parent handler). |
| 4 | `ThreadListItem.tsx:375` | Single email delete fires immediately, no confirmation or undo-snackbar. | Add confirmation or undo-snackbar. |
| 5 | `ChatThreadList.tsx:40` | `ThreadListItemPrimitive.Delete` deletes conversation immediately, no confirmation. | Wrap with confirmation dialog. |
| 6 | `ReminderCard.tsx:64` | Delete button fires `deleteMutation.mutate(id)` with no confirmation. | Add confirmation dialog. |
| 7 | `useContactsPageHandlers.ts:190` | `handleBulkDelete` deletes multiple contacts without confirmation. Single-delete has `DeleteContactDialog` but bulk path bypasses it. | Add confirmation dialog showing count. |
| 8 | `accept.tsx:34` | Auto-fires `acceptInvitation.mutate(id)` on mount with no user confirmation. User is enrolled in org without seeing details. | Show invitation details + confirm button first. |

### Admin / window.confirm (2)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 9 | `UserListTable.tsx:85` | Impersonation uses `window.confirm()` - blocks thread, untranslatable, inconsistent with MUI. | Replace with MUI Dialog. |
| 10 | `UserListTable.tsx:107` | Unban action has zero confirmation. | Add confirmation dialog. |

### Navigation / State (1)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 11 | `two-factor.tsx:41` | After 2FA, always redirects to `/dashboard`. `returnTo` target from login flow is lost. | Pass `returnTo` through query params. |

### Mobile Layout (2)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 12 | `OnboardingWizard.tsx:124` | `<Stepper alternativeLabel>` with 6 step labels overflows on mobile. | Use `<MobileStepper>` or hide labels on `xs`. |
| 13 | `CalendarHeader.tsx:82` | All controls in one row wrap to 25-30% of viewport on phones. | Collapse view toggle into dropdown on mobile. |

### Error Handling (1)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 14 | `OnboardingWizard.tsx:70` | If `POST /onboarding/complete` fails, catch block silently redirects to `/dashboard`. User thinks onboarding succeeded but flag didn't persist. | Show error alert + retry. |

### Accessibility (1)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 15 | `chat-thread.css:293` | `.chat-message-actions` has `opacity: 0`, only visible on `:hover`. Completely inaccessible to keyboard and touch users. | Add `:focus-within` trigger. On mobile, set `opacity: 1` by default. |

---

## Medium (32)

### Touch Targets < 44px (12)

| # | File:Line | Element | Size | Fix |
|---|-----------|---------|------|-----|
| 16 | `chat-thread.css:49` | Scroll-to-bottom button | 30x30 | Increase to 44x44 |
| 17 | `chat-sidebar.css:25` | New conversation button | 30x30 | Increase to 44x44 |
| 18 | `chat-sidebar.css:139` | Thread delete button | 26x26 | Increase to 44x44 |
| 19 | `chat-thread.css:150` | Send/cancel buttons | 32x32 | Increase to 44x44 |
| 20 | `ThreadListItem.tsx:401` | Quick action IconButtons | ~28px | Increase padding to `p: 1` |
| 21 | `ThreadListItem.tsx:192` | Checkbox | ~28px | Use `size="medium"` on touch |
| 22 | `ThreadListHeader.tsx:131` | Mobile refresh button | ~28px | Increase padding |
| 23 | `ThreadListHeader.tsx:156` | Bulk action buttons | ~28px | Conditional `p: 1` on mobile |
| 24 | `ThreadViewOutlook.tsx:214` | 8+ toolbar IconButtons | ~32px | Collapse into overflow menu on mobile |
| 25 | `CalendarHeader.tsx:128` | Prev/next navigation | ~32px | Use `size="medium"` on mobile |
| 26 | `ReminderCard.tsx:59` | Complete/delete buttons | ~34px | Use `size="medium"` |
| 27 | `OrgAdminPage.tsx:247` | Action IconButtons | ~34px | Add `minWidth: 44, minHeight: 44` |

### Hover-Only Controls (3)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 28 | `chat-sidebar.css:147` | Thread delete button hidden until hover. | Add `:focus-within` rule. |
| 29 | `FollowUpCard.tsx:85` | Card action buttons hidden on desktop until hover. Keyboard users can't see them. | Add `&:focus-within` to parent card. |
| 30 | `SnoozeDialog.tsx:131` | Snooze presets are `Box` with `onClick`, no keyboard accessibility. | Use `ButtonBase` with `role="button"`. |

### Mobile Layout / Overflow (5)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 31 | `register.tsx:152` | First/last name fields in horizontal flex, cramped on < 360px. | Add `flexDirection: { xs: 'column', sm: 'row' }`. |
| 32 | `Tasks.tsx:129` | Filter sidebar hidden on mobile, no alternative filter UI. | Add horizontal Chip toggles for mobile. |
| 33 | `Calendar.tsx:217` | `p: 3` padding leaves only 272px for 7-column grid on 320px screens. | Use `p: { xs: 1, md: 3 }`. |
| 34 | `email.tsx:578` | Compose FAB only rendered on desktop. Mobile users have no compose button. | Add mobile FAB. |
| 35 | `OrgAdminPage.tsx:208` | Organizations table has no mobile card layout (unlike UserListTable). | Add responsive card view. |

### 100vh Jitter (2)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 36 | `AuthLayout.tsx:20` | Uses `minHeight: '100vh'` instead of `100dvh`. Jitters on mobile Safari. | Use `minViewportHeightSx` utility. |
| 37 | `OnboardingWizard.tsx:99` | Same `100vh` issue. | Use `minViewportHeightSx` utility. |

### Error Handling (4)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 38 | `register.tsx:69` | Server errors show raw `res.error.message` which could be technical (e.g., P2002). | Map known error codes to translation keys. |
| 39 | `reset-password.tsx:34` | Missing token shows hardcoded English string, no recovery link. | Add link to `/auth/forgot-password`. |
| 40 | `[threadId].tsx:307` | Error state shows only `t.common.genericError`, no details. | Show error specifics (404, network, etc.). |
| 41 | `accept.tsx:30` | Translation access without optional chaining, no error boundary. | Add `?.` and wrap in error boundary. |

### Feedback / State (4)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 42 | `login.tsx:169` | Submit button disabled when `!email \|\| !password` with no explanation. | Add helperText after first submit attempt. |
| 43 | `follow-ups.tsx:16` | When `!isAuthenticated` after loading, shows skeleton forever. | Redirect to login or show auth message. |
| 44 | `reminders.tsx:16` | Same infinite skeleton when unauthenticated. | Same fix. |
| 45 | `KanbanBoard/index.tsx:77` | Search/filter state not synced to URL. Lost on refresh. | Sync to URL query params. |

### Timing / Race Conditions (2)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 46 | `reset-password.tsx:15` | `router.query.token` undefined before `router.isReady`. Form renders immediately. | Guard with `router.isReady` check. |
| 47 | `ComposeDialog.tsx:547` | Brief unguarded window between click and mutation start allows double-send. | Add synchronous `isSendingRef` guard. |

### Accessibility (2)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 48 | `ProfileSettings.tsx:63` | Email field `disabled` with no explanation why. | Add helperText or use `readOnly`. |
| 49 | `Calendar.tsx:268` | Events use color-only differentiation, no icons/text for color-blind users. | Add secondary indicator. |

### Other (2)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 50 | `OrgAdminPage.tsx:76` | Member removal uses native `confirm()` instead of MUI Dialog. | Replace with MUI Dialog. |
| 51 | `ComposeDialog.tsx:1025` | Template picker uses `window.confirm()`. | Replace with MUI Dialog. |

---

## Low (25)

<details>
<summary>Click to expand low-severity findings</summary>

### Hardcoded Strings / i18n (8)

| # | File:Line | Issue |
|---|-----------|-------|
| 52 | `register.tsx:77` | Catch block uses hardcoded English error message. |
| 53 | `forgot-password.tsx:35` | Hardcoded English error in catch block. |
| 54 | `reset-password.tsx:47` | Hardcoded English error in catch block. |
| 55 | `StepAvatar.tsx:31` | Hardcoded `'File must be under 5 MB'`. |
| 56 | `Tasks.tsx:269` | Hardcoded `'Untitled'` fallback. |
| 57 | `RemindersBoard.tsx:19` | Mixed Italian/English status labels hardcoded. |
| 58 | `AnalyticsChart.tsx:108` | Hardcoded English empty state strings. |
| 59 | `Settings.tsx:71` | Hardcoded English error `'Failed to connect provider'`. |

### Touch Targets (borderline) (4)

| # | File:Line | Issue |
|---|-----------|-------|
| 60 | `PasswordField.tsx:21` | Password toggle `size="small"` at 34px. |
| 61 | `register.tsx:207` | Checkbox `size="small"` at ~24px. |
| 62 | `Header.tsx:183` | Avatar IconButton at ~44px (borderline). |
| 63 | `chat-thread.css:344` | Branch button at 18px. |

### Minor UX (8)

| # | File:Line | Issue |
|---|-----------|-------|
| 64 | `verify-email.tsx:53` | Auto-redirect timeout not cleaned up on unmount. |
| 65 | `verify-email.tsx:59` | useEffect depends on unstable `router.query` object. |
| 66 | `StepEmailProvider.tsx:81` | Timeout not cleaned up on unmount. |
| 67 | `SocialLoginButtons.tsx:67` | Loading state stuck if redirect blocked. |
| 68 | `StepMfaSetup.tsx:289` | Backup codes `bgcolor: 'grey.100'` poor contrast in dark mode. |
| 69 | `forgot-password.tsx:97` | "Back to login" link uses wrong translation key (submit label). |
| 70 | `ThreadViewOutlook.tsx:218` | Disabled reply buttons have no tooltip explaining why. |
| 71 | `KanbanBoard/index.tsx:147` | Keyboard shortcuts fire while typing in search field. |

### Missing Page Titles (3)

| # | File:Line | Issue |
|---|-----------|-------|
| 72 | `pages/dashboard/tasks.tsx` | No `<Head><title>`. |
| 73 | `pages/dashboard/ai.tsx` | No `<Head><title>`. |
| 74 | `pages/dashboard/analytics.tsx` | No `<Head><title>`. |

### Other (2)

| # | File:Line | Issue |
|---|-----------|-------|
| 75 | `ThreadListHeader.tsx:275` | Duplicate `@keyframes spin` global injection. |
| 76 | `compose.tsx:72` | `window.history.length` unreliable for back navigation. |

</details>

---

## Priority Fix Order

### Wave 1: Safety (destructive actions)
Fix findings #1-10. Add confirmation dialogs for all delete/archive/impersonate/unban actions. Estimated: 8 files, ~200 lines.

### Wave 2: Mobile accessibility
Fix findings #15, #28-29 (hover-only controls), #31-35 (mobile layout/overflow), #36-37 (100vh). Estimated: 12 files, ~150 lines.

### Wave 3: Touch targets
Fix findings #16-27. Increase all interactive elements to minimum 44x44px. Estimated: 10 files, ~80 lines.

### Wave 4: Error handling + feedback
Fix findings #38-48. Better error messages, auth redirects, state persistence. Estimated: 10 files, ~120 lines.

### Wave 5: Polish (low severity)
Fix remaining low findings as time permits. Estimated: 15 files, ~100 lines.
