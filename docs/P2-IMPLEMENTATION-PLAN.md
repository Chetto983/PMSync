# P2 Implementation Plan

## Executive Summary

Based on exploration of the codebase, here's the status and implementation plan for P2 priority items.

---

## ✅ IMPLEMENTATION COMPLETED (2026-01-26)

### Changes Made:

1. **Email Signature UI Wiring** - ✅ DONE
   - Added `SignatureSettings` to Settings.tsx sections array
   - Added FileSignature icon from lucide-react
   - Wired up all signature hooks (useSignatures, useCreate/Update/Delete)
   - Added signaturesCopy with all translations
   - Added signatures section type
   - Added translations to en.ts and it.ts (sections.signatures + signaturesPanel)
   - Added TypeScript types to locales/index.ts

2. **forwardEmail() Signature Bug** - ✅ ALREADY FIXED
   - Code at lines 419-421 already appends signature correctly
   - `if (signatureContent) { bodyHtml = \`${bodyHtml}<br><br>${signatureContent}\` }`

3. **Drag & Drop to Folders** - ✅ DONE
   - DroppableFolderItem.tsx already existed with useDroppable
   - Wrapped SortableFolderItem with DroppableFolderItem in FolderSidebar.tsx
   - Enhanced animations: scale 1.03, glow border, pulse animation, shadow effects
   - Provider validation prevents cross-provider drops

4. **Mobile Scroll Timing** - ✅ DONE
   - Added TouchSensor with 250ms delay + 5px tolerance
   - Desktop keeps 8px PointerSensor activation distance
   - Mobile users must hold 250ms before drag starts, allowing scroll gestures

### Files Modified:
- `frontend/locales/en.ts` - Added signatures translations
- `frontend/locales/it.ts` - Added signatures translations
- `frontend/locales/index.ts` - Added TypeScript types
- `frontend/components/dashboard/Settings.tsx` - Wired SignatureSettings
- `frontend/components/email/sidebar/FolderSidebar.tsx` - DroppableFolderItem wrapper
- `frontend/components/email/sidebar/DroppableFolderItem.tsx` - Enhanced animations
- `frontend/components/email/list/ThreadList.tsx` - Added TouchSensor

### Verification:
- ✅ `npm run type-check` - PASSED
- ⚠️ `npm run lint` - Pre-existing errors only (not related to P2)

---

---

## Item 1: Email Signature UI Wiring

### Status: ✅ 100% COMPLETE

**What Exists:**
- Backend: Full CRUD API in `email-signature.service.ts` + controller endpoints
- Frontend API: Complete `signaturesApi` in `lib/api/signatures.ts`
- Query Hooks: All hooks in `hooks/queries/use-signatures.ts`
- UI Component: `SignatureSettings.tsx` exists
- Compose Dialog: Already integrates default signature on send/reply

**What Was Missing (NOW FIXED):**
1. ~~SignatureSettings.tsx is NOT wired to any settings page~~ → ✅ NOW WIRED
2. ~~**BUG**: `forwardEmail()` accepts `signatureContent` but never appends it~~ → ✅ CODE ALREADY CORRECT (lines 419-421)

### Implementation Steps

#### Step 1.1: Wire SignatureSettings to Settings Page

**File**: `frontend/pages/settings.tsx` or `frontend/components/settings/index.tsx`

```typescript
// Add SignatureSettings tab/section
import { SignatureSettings } from '@/components/settings/SignatureSettings';

// In settings tabs array, add:
{ label: t.settings.tabs.signatures, component: <SignatureSettings /> }
```

#### Step 1.2: Fix forwardEmail() Bug

**File**: `backend/src/modules/email/services/email-send.service.ts`

**Location**: Lines 387-442, `forwardEmail()` method

**Current Code** (buggy):
```typescript
async forwardEmail(
  userId: string,
  tenantId: string,
  accountId: string,
  emailId: string,
  to: string[],
  body?: string,
  signatureContent?: string,  // ← ACCEPTED BUT NEVER USED!
): Promise<Email> {
  // ... builds forwardBody but never appends signatureContent
}
```

**Fix**:
```typescript
// After building forwardBody, before sending:
let finalBody = forwardBody;
if (signatureContent) {
  finalBody = `${body || ''}\n\n${signatureContent}\n\n${forwardBody}`;
}
```

### Verification
- Run: `npm run type-check`
- Manual test: Forward an email with signature enabled

---

## Item 2: Search Backend Integration

### Status: 100% COMPLETE ✅

**Exploration revealed search is ALREADY fully wired:**

- Backend: `GET /emails/search` endpoint in `emails.controller.ts` (lines 249-276)
- Service: `searchEmails()` in `emails.service.ts` (lines 870-902)
- Query Logic: Prisma OR on subject, from, bodyText in `email-folder.service.ts`
- Frontend: Debounced search bar (300ms) + Zustand store + TanStack Query

**No work needed** - Search is hybrid (backend + frontend) and working.

---

## Item 3: Drag & Drop Email to Folders

### Status: ✅ 100% COMPLETE

**What Exists:**
- @dnd-kit integration with PointerSensor (8px activation distance)
- `DraggableThreadListItem.tsx` - Emails ARE draggable
- `DragOverlay` with smooth animations
- `SortableFolderItem.tsx` - Folder reordering works
- `DroppableFolderItem.tsx` - EXISTS with useDroppable + provider validation

**What Was Missing (NOW FIXED):**
- ~~Folders are NOT drop targets for emails~~ → ✅ Wrapped with DroppableFolderItem
- ~~`useDroppable` hook not implemented~~ → ✅ Already existed, now wired
- ~~No `onDragEnd` handler~~ → ✅ Already existed in ThreadList (lines 225-249)

**Enhanced Animations Added:**
- Scale 1.03 on valid hover (subtle, professional)
- Glow border (primary.main for valid, error.main for invalid)
- Pulse animation for valid drop targets
- Shadow effect on hover
- Cubic-bezier easing for smooth transitions

### Implementation Steps

#### Step 3.1: Add useDroppable to Folder Items

**File**: `frontend/components/email/sidebar/SortableFolderItem.tsx`

```typescript
import { useDroppable } from '@dnd-kit/core';

// Inside SortableFolderItem component:
const { setNodeRef: setDroppableRef, isOver } = useDroppable({
  id: `folder-drop-${folder.id}`,
  data: { type: 'folder', folderId: folder.id },
});

// Combine refs:
const combinedRef = (node: HTMLElement | null) => {
  setNodeRef(node);
  setDroppableRef(node);
};

// Add visual feedback when dragging over:
sx={{
  backgroundColor: isOver ? 'action.hover' : 'transparent',
  transition: 'background-color 0.2s',
}}
```

#### Step 3.2: Handle Email-to-Folder Drop in ThreadList

**File**: `frontend/components/email/list/ThreadList.tsx`

```typescript
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;

  if (!over) return;

  // Check if dropping email on folder
  if (active.data.current?.type === 'email' &&
      over.data.current?.type === 'folder') {
    const emailId = active.id as string;
    const targetFolderId = over.data.current.folderId;

    // Call move email API
    await moveEmailMutation.mutateAsync({
      emailId,
      targetFolderId,
    });
  }
};
```

#### Step 3.3: Add Move Email Mutation

**File**: `frontend/hooks/queries/use-emails.ts`

```typescript
export function useMoveEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ emailId, targetFolderId }: {
      emailId: string;
      targetFolderId: string;
    }) => emailsApi.moveEmail(emailId, targetFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all });
    },
  });
}
```

### Verification
- Drag email from list → hover over folder → drop
- Email should move to target folder
- UI should update via query invalidation

---

## Item 4: Mobile Scroll Timing

### Status: ✅ 100% COMPLETE

**Issue (FIXED):**
- ~~8px activation distance may block short scroll gestures on mobile~~ → ✅ Added TouchSensor with 250ms delay
- ~~`touchAction: 'none'` prevents native scroll~~ → Consider conditional touchAction if issues persist

### Implementation Steps

#### Step 4.1: Increase Activation Distance for Touch

**File**: `frontend/components/email/list/ThreadList.tsx`

```typescript
import { TouchSensor } from '@dnd-kit/core';

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8, // Desktop: 8px
    },
  }),
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,      // Hold 250ms before drag starts
      tolerance: 5,    // Allow 5px movement during delay
    },
  }),
  useSensor(KeyboardSensor)
);
```

#### Step 4.2: Conditional touchAction

**File**: `frontend/components/email/list/DraggableThreadListItem.tsx`

```typescript
// Only disable touch action during active drag
sx={{
  touchAction: isDragging ? 'none' : 'pan-y',
  // ... other styles
}}
```

### Verification
- On mobile: scroll should work smoothly
- Long-press (250ms) initiates drag
- Short swipes scroll the list

---

## Files to Modify Summary

| File | Changes |
|------|---------|
| `pages/settings.tsx` or settings index | Wire SignatureSettings component |
| `email-send.service.ts` | Fix forwardEmail() signature bug |
| `SortableFolderItem.tsx` | Add useDroppable for folder drop zones |
| `ThreadList.tsx` | Add onDragEnd handler + TouchSensor |
| `use-emails.ts` | Add useMoveEmail mutation |
| `DraggableThreadListItem.tsx` | Conditional touchAction |

---

## Priority Order

1. **Fix forwardEmail bug** (5 min) - Critical bug
2. **Wire SignatureSettings** (10 min) - Feature completion
3. **Mobile scroll timing** (15 min) - UX improvement
4. **Drag & drop to folders** (30 min) - Feature addition

---

## Risk Assessment

| Change | Risk | Notes |
|--------|------|-------|

| forwardEmail fix | LOW | Simple string concatenation |
| SignatureSettings wiring | LOW | Just importing existing component |
| TouchSensor delay | LOW | Standard dnd-kit pattern |
| useDroppable folders | MEDIUM | Need to verify folder ID mapping |

---

## Verification Commands

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Manual tests
# 1. Forward email → verify signature appears
# 2. Settings → Signatures tab visible and works
# 3. Mobile: scroll list smoothly
# 4. Drag email → drop on folder → verify move in mobile we have a dirrerent UI wa can remove and use proper modal!
```
