# Email Frontend Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete remaining email frontend features (smart replies, keyboard navigation, loading skeletons)

**Architecture:** TanStack Query for data fetching, Zustand for UI state, React hooks for keyboard handling. All AI features use existing `aiApi` module. Loading skeletons use MUI Skeleton components.

**Tech Stack:** React 18, TanStack Query, Zustand, MUI 7, Lucide icons

---

## Pre-Implementation Audit

After code review, the roadmap is **outdated**. Current actual status:

| Feature | Roadmap | Actual | Evidence |
|---------|---------|--------|----------|
| AI Summarize Button | Missing | ✅ DONE | `AiActionButtons.tsx:165-185` |
| Priority Indicator | Missing | ✅ DONE | `ThreadListItem.tsx:242-259` |
| Sentiment Display | Missing | ✅ DONE | `AiActionButtons.tsx:216-245` |
| Smart Replies Panel | Missing | ❌ MISSING | No UI component exists |
| j/k Navigation | Missing | PARTIAL | `isFocused` prop exists, no handler |
| Loading Skeletons | Missing | ❌ MISSING | ThreadList has no skeleton |

**Remaining Work:** 3 features across 7 files

---

## Task 1: Smart Reply Suggestions Panel

**Files:**
- Create: `frontend/components/email/thread/SmartRepliesPanel.tsx`
- Modify: `frontend/components/email/thread/ExpandedMessage.tsx`
- Modify: `frontend/hooks/queries/index.ts`
- Modify: `frontend/locales/en.ts`
- Modify: `frontend/locales/it.ts`
- Modify: `frontend/locales/index.ts`

### Step 1: Add translations

**File: `frontend/locales/en.ts`**

Add inside `threadMessage.ai`:
```typescript
smartReplies: {
  title: 'Smart Replies',
  loading: 'Generating replies...',
  useReply: 'Use this reply',
  noReplies: 'No suggestions available',
},
```

**File: `frontend/locales/it.ts`**

Add inside `threadMessage.ai`:
```typescript
smartReplies: {
  title: 'Risposte Intelligenti',
  loading: 'Generazione risposte...',
  useReply: 'Usa questa risposta',
  noReplies: 'Nessun suggerimento disponibile',
},
```

**File: `frontend/locales/index.ts`**

Add inside `ThreadMessageLocale.ai`:
```typescript
smartReplies: {
  title: string;
  loading: string;
  useReply: string;
  noReplies: string;
};
```

### Step 2: Create SmartRepliesPanel component

**File: `frontend/components/email/thread/SmartRepliesPanel.tsx`**

```typescript
/**
 * Smart Replies Panel Component
 *
 * Shows AI-generated quick reply suggestions below an email.
 * User clicks a suggestion to populate compose with that reply.
 *
 * Part of Phase 8: AI Integration
 */
import { memo, useState } from 'react';
import { Box, Typography, Paper, Chip, Collapse, CircularProgress, IconButton } from '@mui/material';
import { Sparkles, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';
import { aiApi } from '@/lib/api/ai';

interface SmartRepliesPanelProps {
  emailId: string;
  /** Callback when user selects a reply to use */
  onSelectReply: (replyText: string) => void;
}

export const SmartRepliesPanel = memo(function SmartRepliesPanel({
  emailId,
  onSelectReply,
}: SmartRepliesPanelProps) {
  const t = useTranslations();
  const { locale } = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [replies, setReplies] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    if (replies === null && !isLoading) {
      // First time opening - fetch replies
      setIsLoading(true);
      setError(null);
      try {
        const response = await aiApi.generateSmartReplies(emailId, locale);
        if (response.data.success && response.data.replies) {
          setReplies(response.data.replies);
        } else {
          setReplies([]);
        }
      } catch {
        setError('Failed to generate replies');
        setReplies([]);
      } finally {
        setIsLoading(false);
      }
    }
    setIsExpanded(!isExpanded);
  };

  const handleSelectReply = (reply: string) => {
    onSelectReply(reply);
  };

  const smartRepliesT = t.threadMessage?.ai?.smartReplies;

  return (
    <Box sx={{ px: 2, pb: 1, pl: 7.5 }}>
      {/* Toggle Button */}
      <Box
        onClick={handleToggle}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          color: 'primary.main',
          '&:hover': { textDecoration: 'underline' },
        }}
      >
        <Sparkles size={14} />
        <Typography variant="caption" fontWeight={500}>
          {smartRepliesT?.title || 'Smart Replies'}
        </Typography>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </Box>

      {/* Replies Panel */}
      <Collapse in={isExpanded}>
        <Paper
          elevation={0}
          sx={{
            mt: 1,
            p: 1.5,
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
          }}
        >
          {isLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                {smartRepliesT?.loading || 'Generating replies...'}
              </Typography>
            </Box>
          ) : error ? (
            <Typography variant="caption" color="error.main">
              {error}
            </Typography>
          ) : replies && replies.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {replies.map((reply, idx) => (
                <Box
                  key={idx}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    p: 1,
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'action.hover',
                    },
                  }}
                  onClick={() => handleSelectReply(reply)}
                >
                  <Typography variant="body2" sx={{ flex: 1, fontSize: '0.8125rem' }}>
                    {reply}
                  </Typography>
                  <IconButton size="small" color="primary" sx={{ flexShrink: 0 }}>
                    <Send size={14} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {smartRepliesT?.noReplies || 'No suggestions available'}
            </Typography>
          )}
        </Paper>
      </Collapse>
    </Box>
  );
});

export default SmartRepliesPanel;
```

### Step 3: Integrate into ExpandedMessage

**File: `frontend/components/email/thread/ExpandedMessage.tsx`**

Add import:
```typescript
import { SmartRepliesPanel } from './SmartRepliesPanel';
```

Add callback handler after `handleSummaryGenerated`:
```typescript
const handleSelectReply = (replyText: string) => {
  // Trigger reply with pre-filled content
  onReply(message.id);
  // Note: The compose dialog will need to accept initial content
  // This is wired through the compose store or passed as state
  sessionStorage.setItem('draft_reply_content', replyText);
};
```

Add after `<AiInsightsPanel>` render:
```typescript
{/* Smart Replies Panel - show only for received emails */}
<SmartRepliesPanel
  emailId={message.id}
  onSelectReply={handleSelectReply}
/>
```

### Step 4: Run verification

Run: `cd frontend && npm run type-check`
Expected: No errors

Run: `cd frontend && npm run lint`
Expected: No errors

### Step 5: Commit

```bash
git add frontend/components/email/thread/SmartRepliesPanel.tsx frontend/components/email/thread/ExpandedMessage.tsx frontend/locales/en.ts frontend/locales/it.ts frontend/locales/index.ts
git commit -m "$(cat <<'EOF'
feat(email): add smart reply suggestions panel

- Create SmartRepliesPanel component with lazy loading
- Integrate into ExpandedMessage below AI insights
- Add i18n translations for EN/IT
- Wire to aiApi.generateSmartReplies()

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: j/k Keyboard Navigation

**Files:**
- Create: `frontend/hooks/use-keyboard-navigation.ts`
- Modify: `frontend/components/email/list/ThreadList.tsx`
- Modify: `frontend/locales/en.ts`
- Modify: `frontend/locales/it.ts`

### Step 1: Create keyboard navigation hook

**File: `frontend/hooks/use-keyboard-navigation.ts`**

```typescript
/**
 * Keyboard Navigation Hook
 *
 * Vim-style j/k navigation for email list.
 * - j: Move to next email
 * - k: Move to previous email
 * - Enter: Open focused email
 * - x: Toggle selection
 * - Escape: Clear focus
 *
 * Phase 9: Advanced UX
 */
import { useCallback, useEffect, useState } from 'react';

interface UseKeyboardNavigationOptions {
  /** Total number of items */
  itemCount: number;
  /** Callback when an item is selected (Enter) */
  onSelect: (index: number) => void;
  /** Callback when selection is toggled (x) */
  onToggleSelection?: (index: number) => void;
  /** Whether navigation is enabled */
  enabled?: boolean;
}

interface UseKeyboardNavigationReturn {
  /** Currently focused index (-1 = none) */
  focusedIndex: number;
  /** Set focused index programmatically */
  setFocusedIndex: (index: number) => void;
  /** Clear focus */
  clearFocus: () => void;
}

export function useKeyboardNavigation({
  itemCount,
  onSelect,
  onToggleSelection,
  enabled = true,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const clearFocus = useCallback(() => {
    setFocusedIndex(-1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focus is in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case 'j':
          e.preventDefault();
          setFocusedIndex((prev) => {
            if (prev < 0) return 0;
            return Math.min(prev + 1, itemCount - 1);
          });
          break;

        case 'k':
          e.preventDefault();
          setFocusedIndex((prev) => {
            if (prev < 0) return itemCount - 1;
            return Math.max(prev - 1, 0);
          });
          break;

        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < itemCount) {
            e.preventDefault();
            onSelect(focusedIndex);
          }
          break;

        case 'x':
          if (focusedIndex >= 0 && focusedIndex < itemCount && onToggleSelection) {
            e.preventDefault();
            onToggleSelection(focusedIndex);
          }
          break;

        case 'Escape':
          if (focusedIndex >= 0) {
            e.preventDefault();
            clearFocus();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, itemCount, focusedIndex, onSelect, onToggleSelection, clearFocus]);

  // Reset focus when item count changes (new data loaded)
  useEffect(() => {
    if (focusedIndex >= itemCount) {
      setFocusedIndex(itemCount > 0 ? itemCount - 1 : -1);
    }
  }, [itemCount, focusedIndex]);

  return {
    focusedIndex,
    setFocusedIndex,
    clearFocus,
  };
}
```

### Step 2: Integrate into ThreadList

**File: `frontend/components/email/list/ThreadList.tsx`**

Add import:
```typescript
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';
```

Inside the component, add the hook:
```typescript
// j/k keyboard navigation (Phase 9)
const { focusedIndex, setFocusedIndex, clearFocus } = useKeyboardNavigation({
  itemCount: emails.length,
  onSelect: (index) => {
    const email = emails[index];
    if (email) handleClick(email.id);
  },
  onToggleSelection: (index) => {
    const email = emails[index];
    if (email) handleSelect(email.id, !selectedIds.includes(email.id));
  },
  enabled: !isLoading && emails.length > 0,
});

// Clear focus when email is opened
useEffect(() => {
  if (selectedEmailId) {
    clearFocus();
  }
}, [selectedEmailId, clearFocus]);
```

Update ThreadListItem render to pass `isFocused`:
```typescript
<ThreadListItem
  key={email.id}
  thread={email}
  isSelected={selectedIds.includes(email.id)}
  isHovered={hoveredId === email.id}
  isFocused={focusedIndex === index}
  // ... rest of props
/>
```

### Step 3: Add keyboard shortcuts help to translations

**File: `frontend/locales/en.ts`**

Add to `emailList`:
```typescript
keyboardShortcuts: {
  title: 'Keyboard Shortcuts',
  jk: 'j/k - Navigate up/down',
  enter: 'Enter - Open email',
  x: 'x - Toggle selection',
  escape: 'Escape - Clear focus',
},
```

**File: `frontend/locales/it.ts`**

Add to `emailList`:
```typescript
keyboardShortcuts: {
  title: 'Scorciatoie Tastiera',
  jk: 'j/k - Naviga su/giù',
  enter: 'Invio - Apri email',
  x: 'x - Attiva/Disattiva selezione',
  escape: 'Escape - Cancella focus',
},
```

### Step 4: Run verification

Run: `cd frontend && npm run type-check`
Expected: No errors

### Step 5: Commit

```bash
git add frontend/hooks/use-keyboard-navigation.ts frontend/components/email/list/ThreadList.tsx frontend/locales/en.ts frontend/locales/it.ts
git commit -m "$(cat <<'EOF'
feat(email): add j/k vim-style keyboard navigation

- Create useKeyboardNavigation hook with j/k/Enter/x/Escape
- Integrate into ThreadList component
- Pass isFocused to ThreadListItem for focus outline
- Add keyboard shortcuts translations

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Email List Loading Skeletons

**Files:**
- Create: `frontend/components/email/list/ThreadListSkeleton.tsx`
- Modify: `frontend/components/email/list/ThreadList.tsx`

### Step 1: Create ThreadListSkeleton component

**File: `frontend/components/email/list/ThreadListSkeleton.tsx`**

```typescript
/**
 * Thread List Skeleton Component
 *
 * Loading skeleton matching ThreadListItem 3-line layout:
 * - Line 1: Avatar + Sender + Date
 * - Line 2: Subject
 * - Line 3: Snippet
 *
 * Phase 10: Performance & Polish
 */
import { memo } from 'react';
import { Box, Skeleton } from '@mui/material';

interface ThreadListSkeletonProps {
  /** Number of skeleton items to render */
  count?: number;
}

const SkeletonItem = memo(function SkeletonItem() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        minHeight: 96,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* Checkbox placeholder */}
      <Box sx={{ width: 40, flexShrink: 0 }}>
        <Skeleton variant="rounded" width={20} height={20} />
      </Box>

      {/* Avatar */}
      <Skeleton variant="circular" width={28} height={28} sx={{ flexShrink: 0 }} />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Line 1: Sender + Date */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Skeleton variant="text" width="30%" height={20} />
          <Box sx={{ flex: 1 }} />
          <Skeleton variant="text" width={60} height={16} />
        </Box>

        {/* Line 2: Subject */}
        <Skeleton variant="text" width="80%" height={18} sx={{ mb: 0.25 }} />

        {/* Line 3: Snippet */}
        <Skeleton variant="text" width="60%" height={16} />
      </Box>
    </Box>
  );
});

export const ThreadListSkeleton = memo(function ThreadListSkeleton({
  count = 8,
}: ThreadListSkeletonProps) {
  return (
    <Box>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonItem key={index} />
      ))}
    </Box>
  );
});

export default ThreadListSkeleton;
```

### Step 2: Integrate into ThreadList

**File: `frontend/components/email/list/ThreadList.tsx`**

Add import:
```typescript
import { ThreadListSkeleton } from './ThreadListSkeleton';
```

Update the loading state render (replace existing loading spinner):
```typescript
if (isLoading) {
  return <ThreadListSkeleton count={10} />;
}
```

### Step 3: Run verification

Run: `cd frontend && npm run type-check`
Expected: No errors

Run: `cd frontend && npm run lint`
Expected: No errors

### Step 4: Commit

```bash
git add frontend/components/email/list/ThreadListSkeleton.tsx frontend/components/email/list/ThreadList.tsx
git commit -m "$(cat <<'EOF'
feat(email): add loading skeletons to email list

- Create ThreadListSkeleton matching 3-line layout
- Replace spinner with skeleton in ThreadList loading state
- Improves perceived performance on slow networks

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update Roadmap & Final Verification

**Files:**
- Modify: `frontend/docs/EMAIL_FRONTEND_COMPREHENSIVE_ROADMAP.md`

### Step 1: Update roadmap progress

Update Phase 8 status to ~95% (only label suggestions remains)
Update Phase 9 status to ~50% (j/k done, undo/templates/VIP deferred)
Update Phase 10 status to ~90% (skeletons done, E2E tests deferred)

### Step 2: Run full verification

Run: `cd frontend && npm run type-check`
Expected: Exit code 0

Run: `cd frontend && npm run lint`
Expected: Exit code 0

Run: `cd frontend && npm run build`
Expected: Build succeeds

### Step 3: Commit roadmap update

```bash
git add frontend/docs/EMAIL_FRONTEND_COMPREHENSIVE_ROADMAP.md
git commit -m "$(cat <<'EOF'
docs: update email frontend roadmap progress

- Phase 8: ~95% (smart replies done, label suggestions deferred)
- Phase 9: ~50% (j/k navigation done, undo/templates/VIP deferred)
- Phase 10: ~90% (skeletons done, E2E tests deferred)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Implementation Order

| Task | Priority | Effort | Files Changed |
|------|----------|--------|---------------|
| Task 1: Smart Replies | P1 | 30 min | 6 files |
| Task 2: j/k Navigation | P1 | 25 min | 4 files |
| Task 3: Loading Skeletons | P2 | 15 min | 2 files |
| Task 4: Roadmap Update | P3 | 5 min | 1 file |

**Total: ~75 minutes**

---

## Testing Checklist

- [ ] Smart Replies: Click "Smart Replies" below email, see suggestions load
- [ ] Smart Replies: Click a suggestion, verify compose opens with text
- [ ] j/k Navigation: Press j to move down, k to move up in email list
- [ ] j/k Navigation: Press Enter on focused email to open it
- [ ] j/k Navigation: Press x on focused email to toggle selection
- [ ] Loading Skeleton: Navigate to email list, see skeleton while loading
- [ ] Type check: `npm run type-check` passes
- [ ] Lint: `npm run lint` passes
- [ ] Build: `npm run build` succeeds

---

## Deferred Items (P2/P3)

These items are not included in this plan:

| Feature | Priority | Reason |
|---------|----------|--------|
| Undo Send (30s delay) | P2 | Requires backend changes |
| Email Templates | P2 | Feature scope, localStorage |
| VIP Split Inbox | P3 | Complex UI redesign |
| Label Suggestions | P3 | AI triage already covers this |
| E2E Tests | P3 | Requires Playwright setup |

---

## Success Criteria

1. **Smart Replies:** Panel shows below emails, clicking suggestion triggers compose
2. **j/k Navigation:** Vim-style navigation works without input focus
3. **Loading Skeletons:** No spinner flash, smooth skeleton-to-content transition
4. **All checks pass:** type-check, lint, build all succeed
