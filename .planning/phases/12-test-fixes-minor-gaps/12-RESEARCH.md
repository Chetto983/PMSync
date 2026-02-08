# Phase 12 Research: Test Fixes + Minor Gaps

**Date:** 2026-02-08
**Objective:** Close remaining tech debt from Phase 11 AI audit and prior gaps

---

## Research Summary

| Issue | Severity | Effort | Status |
|-------|----------|--------|--------|
| ActionExecutor tests (16/25 failing) | Medium | 2-3h | Incomplete Prisma mocks |
| emailType not displayed in FollowUpCard | Low | 30min | Field exists, UI missing |
| WCAG aria-input-field-name in ComposeDialog | Low | 1h | 3 inputs need aria-label |

---

## 1. ActionExecutor Test Failure Analysis

### Test File Location
`backend/src/modules/ai/voltagent/services/__tests__/action-executor.service.spec.ts`

### Current Mock Structure (Lines 18-41)
The test file has a `mockPrismaService` object with partial mocks:

```typescript
const mockPrismaService = {
  providerConfig: {
    findFirst: jest.fn().mockResolvedValue(defaultProvider),
  },
  email: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  contact: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  calendarEvent: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};
```

### Missing Mocks Analysis

**After reviewing `email-executor.ts` (lines 221-680)**, the following Prisma calls are made but not properly mocked:

1. **email.findUnique with compound key** (used in executeReplyEmail, executeForwardEmail):
   ```typescript
   prisma.email.findUnique({
     where: { id_tenantId: { id: emailId, tenantId: context.tenantId } },
   });
   ```
   - Compound keys require specific mock setup

2. **email.updateMany** (used in executeCategorizeEmail):
   ```typescript
   prisma.email.updateMany({
     where: { id: emailId, tenantId: context.tenantId },
     data: { labels: newLabels },
   });
   ```

3. **providerConfig.findFirst with email match** (used in executeSendEmail):
   ```typescript
   prisma.providerConfig.findFirst({
     where: { email: fromEmail, tenantId, isActive: true, supportsEmail: true },
     select: { id: true },
   });
   ```

### Test Cases to Fix

Based on test file analysis, these 25 tests exist in 10 describe blocks:
- Email Actions (4 tests): SEND_EMAIL, ARCHIVE_EMAIL, DELETE_EMAIL, MARK_READ
- Calendar Actions (4 tests): CREATE_EVENT, UPDATE_EVENT, DELETE_EVENT, CHECK_AVAILABILITY
- Contact Actions (3 tests): CREATE_CONTACT, UPDATE_CONTACT, DELETE_CONTACT
- Folder Actions (3 tests): CREATE_FOLDER, RENAME_FOLDER, DELETE_FOLDER
- Bulk Email Actions (3 tests): BULK_DELETE_EMAILS, BULK_ARCHIVE_EMAILS, BULK_MARK_READ
- Unknown Action Type (1 test)
- Executor Failure Handling (2 tests)
- Result Format Validation (3 tests)
- Idempotency Support (2 tests)

**Likely failing tests (16/25):**
- All email action tests that use `email.findFirst` or `email.findUnique` without default mock return
- Bulk email tests that call `email.findFirst` for provider lookup
- Any test where mock isn't set up in beforeEach

### Solution Pattern (from embedding-search.service.spec.ts)

```typescript
// In beforeEach, set default mock returns:
mockPrismaService.email.findFirst.mockResolvedValue(mockEmail);
mockPrismaService.email.findUnique.mockResolvedValue(mockEmail);
mockPrismaService.email.update.mockResolvedValue({ ...mockEmail, isRead: true });

// Per-test overrides when needed:
it('should handle delete', async () => {
  mockPrismaService.email.findFirst.mockResolvedValue(mockEmail);
  mockPrismaService.email.update.mockResolvedValue({ ...mockEmail, isDeleted: true });
  // ...
});
```

### Recommended Fixes

1. **Add default mock returns in beforeEach:**
   ```typescript
   beforeEach(async () => {
     jest.clearAllMocks();

     // Set default returns for commonly used mocks
     mockPrismaService.email.findFirst.mockResolvedValue(mockEmail);
     mockPrismaService.email.findUnique.mockResolvedValue(mockEmail);
     mockPrismaService.email.update.mockResolvedValue(mockEmail);
     mockPrismaService.email.updateMany.mockResolvedValue({ count: 1 });
     // ... existing TestingModule setup
   });
   ```

2. **Define mockEmail at test file level:**
   ```typescript
   const mockEmail = {
     id: 'email-123',
     subject: 'Test Subject',
     from: 'sender@example.com',
     to: ['recipient@example.com'],
     externalId: 'ext-123',
     providerId: 'provider-123',
     tenantId: 'tenant-123',
     folder: 'INBOX',
     labels: [],
     isRead: false,
     isStarred: false,
     isDeleted: false,
     bodyHtml: '<p>Test body</p>',
     snippet: 'Test body',
     messageId: 'msg-123',
     threadId: 'thread-123',
     receivedAt: new Date(),
   };
   ```

3. **Per-test mock customization:** Only override when test requires different behavior

---

## 2. emailType Display in FollowUpCard

### Current State

**FollowUpCard.tsx** (lines 1-436):
- Displays: status, followUpType (WAITING_FOR/TODO), overdue/due today badges
- Displays: commitments, waitingFor, actionItems, confidence
- **Missing:** emailType badge (field exists in data but not rendered)

**FollowUpRenderer.tsx** (lines 1-189):
- Used for AI chat tool results
- Shows: status, from, reason, dueDate
- **Missing:** emailType display

### Data Flow Verification

1. **Backend schema** (`prisma/schema.prisma` line 1058):
   ```prisma
   emailType        String?        // receipt|notification|request|conversation|newsletter|alert
   ```

2. **Frontend type** (`hooks/queries/use-follow-ups.ts` lines 43, 63):
   ```typescript
   export type EmailType = 'receipt' | 'notification' | 'request' | 'conversation' | 'newsletter' | 'alert';

   export interface EmailFollowUp {
     // ...
     emailType?: EmailType;
   }
   ```

3. **Translation keys exist** (`locales/en.ts` line 2675, `locales/it.ts` line 2656):
   ```typescript
   emailType: 'Email type',
   ```

### UI Placement Recommendation

**FollowUpCard.tsx** - Add after status/followUpType badges (line ~170):
```tsx
{/* Email type badge */}
{followUp.emailType && (
  <Chip
    size="small"
    label={t.ai.followUpTracker.emailTypes?.[followUp.emailType] ?? followUp.emailType}
    variant="outlined"
    sx={{
      height: 24,
      fontSize: '0.7rem',
      textTransform: 'capitalize',
    }}
  />
)}
```

**FollowUpRenderer.tsx** - Add after status badge (line ~102):
```tsx
{fu.emailType && (
  <Badge
    variant="outline"
    className="text-[10px] px-1.5 py-0 shrink-0"
  >
    {fu.emailType}
  </Badge>
)}
```

### Translation Keys to Add

```typescript
// en.ts - ai.followUpTracker.emailTypes
emailTypes: {
  receipt: 'Receipt',
  notification: 'Notification',
  request: 'Request',
  conversation: 'Conversation',
  newsletter: 'Newsletter',
  alert: 'Alert',
},

// it.ts - ai.followUpTracker.emailTypes
emailTypes: {
  receipt: 'Ricevuta',
  notification: 'Notifica',
  request: 'Richiesta',
  conversation: 'Conversazione',
  newsletter: 'Newsletter',
  alert: 'Avviso',
},
```

---

## 3. WCAG aria-input-field-name Fix for ComposeDialog

### Current WCAG Exclusion

From `frontend/e2e/accessibility.spec.ts` (lines 54-57):
```typescript
// Compose selects and TipTap editor missing accessible names
// Fix requires: aria-label on Select and TipTap editor components
// Components: ComposeDialog, TipTap toolbar selects
'aria-input-field-name',
```

### Audit of ComposeDialog.tsx

**Current aria-labels (2 found):**
1. Line 601: `<input aria-label={t.email.composer.attachFiles} ...>`
2. Line 619: `<IconButton aria-label={t.common.close} ...>`

**Missing aria-labels (3 elements need fixing):**

1. **Provider Select** (lines 701-728):
   ```tsx
   <Select
     value={providerId}
     onChange={(e) => setProviderId(e.target.value)}
     displayEmpty
     variant="standard"
     disableUnderline
   >
   ```
   **Fix:** Add `aria-label={t.email.composer.from}` or `aria-labelledby`

2. **Subject TextField** (lines 747-756):
   ```tsx
   <TextField
     fullWidth
     variant="standard"
     placeholder={t.email.composer.subjectPlaceholder}
     value={subject}
     onChange={handleSubjectChange}
   />
   ```
   **Fix:** Add `inputProps={{ 'aria-label': t.email.composer.subject }}`

3. **TipTap Editor** (via ComposeEditor.tsx):
   - The RichTextEditor from mui-tiptap needs aria-label
   - Located in `ComposeEditor.tsx` line 318+

### Fix Implementation

**ComposeDialog.tsx:**

1. Provider Select (line ~701):
   ```tsx
   <Select
     value={providerId}
     onChange={(e) => setProviderId(e.target.value)}
     displayEmpty
     variant="standard"
     disableUnderline
     aria-label={t.email.composer.from}
   >
   ```

2. Subject TextField (line ~747):
   ```tsx
   <TextField
     fullWidth
     variant="standard"
     placeholder={t.email.composer.subjectPlaceholder}
     value={subject}
     onChange={handleSubjectChange}
     inputProps={{
       'aria-label': t.email.composer.subject
     }}
     InputProps={{
       disableUnderline: true,
     }}
   />
   ```

**ComposeEditor.tsx (line ~318):**
```tsx
<RichTextEditor
  ref={rteRef}
  extensions={extensions}
  content={content}
  editable={editable}
  immediatelyRender={false}
  // Add aria-label for accessibility
  aria-label={composer.bodyPlaceholder}
  // ... rest of props
>
```

### ComposeRecipients.tsx ARIA

The Autocomplete fields in ComposeRecipients.tsx (line 162) also need aria-labels:
```tsx
<Autocomplete
  // ... existing props
  aria-label={label}
  // or use the label prop which may auto-associate
>
```

### Test Verification

After fixes, run:
```bash
cd frontend && npx playwright test accessibility.spec.ts
```

Remove 'aria-input-field-name' from EXCLUDED_RULES after verification passes.

---

## 4. Implementation Plan Recommendations

### Plan 12-01: ActionExecutor Tests + emailType Display
**Estimated effort:** 2-3 hours

1. Fix mockPrismaService in action-executor.service.spec.ts
   - Add comprehensive mock email object
   - Set default returns in beforeEach
   - Verify all 25 tests pass

2. Add emailType badge to FollowUpCard.tsx
   - Add translation keys for email types
   - Display badge next to status chip

3. Add emailType badge to FollowUpRenderer.tsx
   - Display in tool result UI

### Plan 12-02: WCAG aria-input-field-name Fix
**Estimated effort:** 1 hour

1. Add aria-label to Provider Select in ComposeDialog.tsx
2. Add aria-label to Subject TextField in ComposeDialog.tsx
3. Add aria-label to RichTextEditor in ComposeEditor.tsx
4. Add aria-label to Autocomplete fields in ComposeRecipients.tsx
5. Remove 'aria-input-field-name' from EXCLUDED_RULES
6. Run axe-core tests to verify

---

## 5. References

- ActionExecutor service: `backend/src/modules/ai/voltagent/services/action-executor.service.ts`
- Email executor: `backend/src/modules/ai/voltagent/services/executors/email-executor.ts`
- Test file: `backend/src/modules/ai/voltagent/services/__tests__/action-executor.service.spec.ts`
- FollowUpCard: `frontend/components/ai/FollowUpTracker/FollowUpCard.tsx`
- FollowUpRenderer: `frontend/src/components/ai-elements/tool-renderers/renderers/FollowUpRenderer.tsx`
- ComposeDialog: `frontend/components/email/compose/ComposeDialog.tsx`
- ComposeEditor: `frontend/components/email/compose/ComposeEditor.tsx`
- ComposeRecipients: `frontend/components/email/compose/ComposeRecipients.tsx`
- Accessibility tests: `frontend/e2e/accessibility.spec.ts`
- Follow-up types: `frontend/hooks/queries/use-follow-ups.ts`
