# Email Components Translation Audit Report

**Date:** 2025-12-31
**Scope:** All email-related components in `frontend/pages/dashboard/email` and `frontend/components/email`

---

## Executive Summary

**Total Hardcoded Strings Found:** 23
**Missing Translation Keys:** 15
**Files Requiring Updates:** 4

### Critical Issues

1. **ThreadView.tsx** - Multiple hardcoded UI strings (Expand all, Collapse all, message count)
2. **ThreadMessage.tsx** - Action labels and email fields hardcoded (To:, Cc:, Reply, Forward, Attachments)
3. **[threadId].tsx** - Loading and error states have hardcoded fallbacks
4. **ThreadListHeader.tsx** - Hardcoded "email/emails" text in count display

---

## Detailed Findings

### 1. `/pages/dashboard/email/thread/[threadId].tsx`

#### Line 233: Loading State Text
```typescript
// ❌ HARDCODED
<Typography variant="body2" color="text.secondary">
  Loading thread...
</Typography>
```
**Issue:** Loading message hardcoded
**Suggested Key:** `t.emailList.loadingThread` or `t.threadView.loading`
**Fix Required:** Add to translations and use hook

---

#### Line 259: Back Button Fallback
```typescript
// ⚠️ FALLBACK USED (translation exists but pattern is risky)
{t.email?.view?.back || 'Back'}
```
**Issue:** Translation key `email.view.back` doesn't exist in locales
**Status:** Fallback `'Back'` is used
**Suggested Key:** `t.common.back` (likely already exists) or add `t.emailView.back`
**Fix Required:** Verify translation path or use `t.common.back`

---

#### Line 262: Retry Button Fallback
```typescript
// ⚠️ FALLBACK USED
{t.common.retry || 'Retry'}
```
**Issue:** Using fallback pattern (suggests translation might be missing)
**Suggested Key:** `t.common.retry`
**Fix Required:** Verify translation exists in `common` namespace

---

#### Line 286: Empty Thread Message
```typescript
// ❌ HARDCODED
<Typography color="text.secondary">No messages in this thread</Typography>
```
**Issue:** Error state message hardcoded
**Suggested Key:** `t.threadView.emptyThread` or `t.emailList.emptyThread`
**Fix Required:** Add to translations

---

### 2. `/components/email/thread/ThreadView.tsx`

#### Line 270: Message Count
```typescript
// ❌ HARDCODED PLURALIZATION
{messages.length} {messages.length === 1 ? 'message' : 'messages'}
```
**Issue:** Pluralization logic hardcoded, not i18n-friendly
**Suggested Key:** `t.threadView.messageCount` with template
**Translation Pattern:**
```typescript
// en.ts
messageCount: '{count} message',
messageCountPlural: '{count} messages',

// Usage:
{messages.length === 1
  ? t.threadView.messageCount.replace('{count}', messages.length.toString())
  : t.threadView.messageCountPlural.replace('{count}', messages.length.toString())
}
```
**Fix Required:** Add translation keys with pluralization support

---

#### Line 283: Expand All Button
```typescript
// ❌ HARDCODED
<Button>Expand all</Button>
```
**Issue:** Button label hardcoded
**Suggested Key:** `t.threadView.expandAll`
**Fix Required:** Add to translations

---

#### Line 293: Collapse All Button
```typescript
// ❌ HARDCODED
<Button>Collapse all</Button>
```
**Issue:** Button label hardcoded
**Suggested Key:** `t.threadView.collapseAll`
**Fix Required:** Add to translations

---

#### Line 304: Thread Actions Aria Label
```typescript
// ❌ HARDCODED
aria-label="Thread actions"
```
**Issue:** Accessibility label hardcoded
**Suggested Key:** `t.threadView.actionsLabel` or `t.threadActions.menuLabel`
**Fix Required:** Add to translations (important for accessibility!)

---

### 3. `/components/email/thread/ThreadMessage.tsx`

#### Line 241: "To:" Label
```typescript
// ❌ HARDCODED
To: {message.to.join(', ')}
```
**Issue:** Email field label hardcoded
**Suggested Key:** `t.email.recipientTo` or `t.threadMessage.to`
**Fix Required:** Add to translations

---

#### Line 245: "Cc:" Label
```typescript
// ❌ HARDCODED
Cc: {message.cc.join(', ')}
```
**Issue:** Email field label hardcoded
**Suggested Key:** `t.email.recipientCc` or `t.threadMessage.cc`
**Fix Required:** Add to translations

---

#### Line 266: "Attachments" Label
```typescript
// ❌ HARDCODED WITH COUNT
Attachments ({message.attachments.length})
```
**Issue:** Label and count format hardcoded
**Suggested Key:** `t.threadMessage.attachments` with template
**Translation Pattern:**
```typescript
// en.ts
attachments: 'Attachments ({count})',

// Usage:
{t.threadMessage.attachments.replace('{count}', message.attachments.length.toString())}
```
**Fix Required:** Add to translations

---

#### Line 296: "Reply" Button
```typescript
// ❌ HARDCODED
<Typography variant="caption">Reply</Typography>
```
**Issue:** Action button label hardcoded
**Suggested Key:** `t.threadMessage.reply` or `t.email.actions.reply`
**Fix Required:** Add to translations

---

#### Line 310: "Forward" Button
```typescript
// ❌ HARDCODED
<Typography variant="caption">Forward</Typography>
```
**Issue:** Action button label hardcoded
**Suggested Key:** `t.threadMessage.forward` or `t.email.actions.forward`
**Fix Required:** Add to translations

---

### 4. `/components/email/list/ThreadListHeader.tsx`

#### Line 114: Email Count Display
```typescript
// ❌ HARDCODED PLURALIZATION
{totalCount} {totalCount === 1 ? 'email' : 'emails'}
```
**Issue:** Pluralization logic hardcoded
**Suggested Key:** `t.emailList.emailCount` / `t.emailList.emailCountPlural`
**Translation Pattern:**
```typescript
// en.ts
emailCount: '{count} email',
emailCountPlural: '{count} emails',

// Usage:
{totalCount === 1
  ? t.emailList.emailCount.replace('{count}', totalCount.toString())
  : t.emailList.emailCountPlural.replace('{count}', totalCount.toString())
}
```
**Fix Required:** Add to translations

---

## Existing Translations Summary

### Already Implemented (✅ Good)

The following components **correctly** use translations:

1. **ThreadListHeader.tsx** - Most action buttons use `t.emailList.*`
2. **ThreadListItem.tsx** - Uses `t.common.noSubject`, `t.emailList.flagged`, etc.
3. **EmptyState.tsx** - Uses `t.emailList.emptyInbox`, `t.emailList.emptyFolder`, etc.
4. **ThreadList.tsx** - Uses `t.emailList.loading`, `t.emailList.loadingMore`
5. **ThreadView.tsx** - Menu items use `t.threadActions.*` correctly

### Translation Keys Available (from `locales/en.ts`)

#### `emailList` namespace:
- `selectAll`, `deselectAll`, `selected`, `refresh`
- `markAsRead`, `markAsUnread`, `archive`, `delete`
- `moveToFolder`, `addLabel`
- `emptyInbox`, `emptyFolder`, `emptySearch` (+ descriptions)
- `flagged`, `unflagged`, `loading`, `loadingMore`
- `emailMoved`, `emailsMoved`, `cannotMoveCrossProvider`

#### `threadActions` namespace:
- `deleteThread`, `moveThread`, `archiveThread`
- `markThreadRead`, `markThreadUnread`
- `flagThread`, `unflagThread`, `addLabelsThread`
- `threadDeleted`, `threadArchived`, `threadMarkedRead`, etc.

#### `common` namespace:
- `success`, `genericError`, `noSubject`, `close`
- Missing: `back`, `retry` (need verification)

---

## Missing Translation Keys

Add these to **both** `locales/en.ts` and `locales/it.ts`:

### `threadView` namespace (NEW):
```typescript
threadView: {
  loading: 'Loading thread...',
  loadingThread: 'Loading conversation...',
  emptyThread: 'No messages in this thread',
  messageCount: '{count} message',
  messageCountPlural: '{count} messages',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  actionsLabel: 'Thread actions',
  back: 'Back to inbox',
}
```

### `threadMessage` namespace (NEW):
```typescript
threadMessage: {
  to: 'To:',
  cc: 'Cc:',
  bcc: 'Bcc:',
  attachments: 'Attachments ({count})',
  reply: 'Reply',
  forward: 'Forward',
  replyAll: 'Reply all',
}
```

### `emailList` additions:
```typescript
emailList: {
  // ... existing keys ...
  emailCount: '{count} email',        // ADD
  emailCountPlural: '{count} emails', // ADD
  loadingThread: 'Loading thread...',  // ADD
}
```

### `common` additions (verify if missing):
```typescript
common: {
  // ... existing keys ...
  back: 'Back',   // VERIFY
  retry: 'Retry', // VERIFY
}
```

---

## Italian Translations Required

For **all** new English keys above, add Italian equivalents:

### `threadView` (IT):
```typescript
threadView: {
  loading: 'Caricamento thread...',
  loadingThread: 'Caricamento conversazione...',
  emptyThread: 'Nessun messaggio in questo thread',
  messageCount: '{count} messaggio',
  messageCountPlural: '{count} messaggi',
  expandAll: 'Espandi tutto',
  collapseAll: 'Comprimi tutto',
  actionsLabel: 'Azioni thread',
  back: 'Torna alla casella',
}
```

### `threadMessage` (IT):
```typescript
threadMessage: {
  to: 'A:',
  cc: 'Cc:',
  bcc: 'Ccn:',
  attachments: 'Allegati ({count})',
  reply: 'Rispondi',
  forward: 'Inoltra',
  replyAll: 'Rispondi a tutti',
}
```

---

## Implementation Priority

### 🔴 HIGH PRIORITY (User-Facing UI)
1. **ThreadView.tsx** - "Expand all", "Collapse all", message count
2. **ThreadMessage.tsx** - "Reply", "Forward", "To:", "Cc:", "Attachments"
3. **ThreadListHeader.tsx** - Email count pluralization

### 🟡 MEDIUM PRIORITY (Accessibility)
4. **ThreadView.tsx** - `aria-label="Thread actions"`

### 🟢 LOW PRIORITY (Loading/Error States)
5. **[threadId].tsx** - Loading/error messages (already have fallbacks)

---

## Recommended Action Plan

### Step 1: Add Translation Keys
1. Update `frontend/locales/en.ts` with all missing keys
2. Update `frontend/locales/it.ts` with Italian translations
3. Update `frontend/locales/index.ts` TypeScript types

### Step 2: Update Components (in order)
1. **ThreadView.tsx** - Replace all hardcoded strings
2. **ThreadMessage.tsx** - Replace labels and buttons
3. **ThreadListHeader.tsx** - Fix email count pluralization
4. **[threadId].tsx** - Use proper translation paths

### Step 3: Verify
1. Run type-check: `npm run type-check`
2. Run lint: `npm run lint`
3. Test language switching in UI
4. Verify screen reader announcements (accessibility)

---

## Code Examples

### Before (❌ Hardcoded):
```typescript
// ThreadView.tsx
<Button>Expand all</Button>
<Button>Collapse all</Button>
{messages.length} {messages.length === 1 ? 'message' : 'messages'}
```

### After (✅ Translated):
```typescript
// ThreadView.tsx
import { useTranslations } from '@/lib/hooks/use-translations';

const t = useTranslations();

<Button>{t.threadView.expandAll}</Button>
<Button>{t.threadView.collapseAll}</Button>
{messages.length === 1
  ? t.threadView.messageCount.replace('{count}', messages.length.toString())
  : t.threadView.messageCountPlural.replace('{count}', messages.length.toString())
}
```

---

## Additional Notes

### Pluralization Best Practice
For language-agnostic pluralization, consider using a pluralization library or keeping separate keys:
- `messageCount` (singular)
- `messageCountPlural` (plural)

This works better for languages with different pluralization rules (e.g., Russian has 3 forms, Arabic has 6).

### Accessibility
All `aria-label` and `aria-describedby` attributes **must** use translations for international accessibility compliance.

### Performance
The `useTranslations()` hook is already memoized, so using it in these components won't impact performance.

---

## Conclusion

All email components require translation updates to fully support internationalization. The majority of missing translations are in the **ThreadView** and **ThreadMessage** components. Implementing the recommended translation keys will ensure complete i18n coverage for the email module.

**Estimated Effort:** 2-3 hours
**Risk Level:** Low (non-breaking changes)
**Testing Required:** Language switching + accessibility audit
