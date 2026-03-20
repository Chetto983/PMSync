# Email Client Redesign Roadmap

**Created**: 2026-03-20
**Design Direction**: Superhuman-inspired refined minimalism
**Skills Applied**: `frontend-design` (aesthetic), `ux-antipatterns` (detection & fix)

---

## Design Philosophy

**Tone**: Refined minimalism with surgical precision. NOT flashy or maximalist.
The "unforgettable" quality is **speed and density** — maximum information in minimum space,
with every interaction feeling instant.

**Key Principles**:
1. **Speed-obsessed** — every action produces visible feedback within 100ms
2. **Dense but scannable** — clear visual weight hierarchy without feeling cramped
3. **Keyboard-first** — visible focus indicators, shortcuts everywhere
4. **Restrained motion** — subtle transitions that communicate state, not decorate
5. **Information hierarchy** — sender > subject > snippet > metadata

**Color Palette** (from tokens.ts):
- Primary: teal `hsl(189, 70%, 50%)` — active states, focus, unread accent
- Surface: `background.paper` / `background.default` — layered depth
- Text: 3 weights — `text.primary` (sender), `text.secondary` (subject), `text.disabled` (snippet)
- Semantic: red (delete/flag), orange (warning), green (success)

**Typography** (existing tokens):
- Sender: `body2`, `fontWeight: 600` (unread: `700`), `fontSize: 0.8125rem`
- Subject: `body2`, `fontSize: 0.8125rem`, `color: text.secondary`
- Snippet: `caption`, `fontSize: 0.75rem`, `color: text.disabled`
- Date: `caption`, `fontSize: 0.6875rem`, `whiteSpace: nowrap`

---

## UX Anti-Patterns Audit (Current State)

### Found Issues (13 violations across 8 categories)

| # | Anti-Pattern | Category | File | User Harm |
|---|-------------|----------|------|-----------|
| 1 | **No undo on delete** | 6.4 Destructive no confirm | ThreadListItem | Email deleted instantly, no recovery |
| 2 | **No undo on archive** | 6.4 Destructive no confirm | ThreadListItem | Archived instantly, must find in All Mail |
| 3 | **Filters not in URL** | 7.2 State not in URL | email-ui-store | Refresh loses folder/search, can't share links |
| 4 | **Scroll position lost** | 8.1 Scroll not recovered | ThreadList | Navigate to email → back → scroll resets to top |
| 5 | **Double-click submits** | 9.1 Duplicate submission | ThreadListHeader bulk | Bulk actions have no re-invocation guard |
| 6 | **Stale response race** | 9.2 No AbortController | use-emails.ts | Fast folder switching shows wrong folder's emails briefly |
| 7 | **Hover-only quick actions** | 10.2 Hover-only info | ThreadListItem | Touch/keyboard users can't access flag/archive/delete |
| 8 | **No focus trap in dialogs** | 10.6 Keyboard trap | LabelPickerDialog | Tab escapes dialog on keyboard |
| 9 | **Empty state no guidance** | 3.1 Error without guidance | EmptyState | "No emails" with no actionable next step |
| 10 | **Layout shift on load** | 1.1 Elements shifting | ThreadList | Skeleton → real content causes shift |
| 11 | **Optimistic revert silent** | 2.2 Silent revert | email-page-actions | Flag/archive fail silently reverts, user doesn't know |
| 12 | **Font mismatch** | — Config issue | _app.tsx vs tokens | Tokens specify Inter, app loads Roboto — inconsistent |
| 13 | **2x folders fetch** | 13.2 Redundant requests | email.tsx + FolderSidebar | Duplicate API call on every page load |

### Already Fixed (from prior audit)

| # | Issue | Fix | Commit |
|---|-------|-----|--------|
| ✅ | FAB invisible | Removed display:none, bumped zIndex | dad3d3e5 |
| ✅ | Email count shows 50 | Uses pagination.total | dad3d3e5 |
| ✅ | 23 checkboxes no aria-label | Added i18n labels | dad3d3e5 |
| ✅ | 2x email fetch on folder click | Single Zustand set() + ref reset | 95a3d8fe |
| ✅ | WebSocket leak (260+ conns) | Moved useWebSocket to _app.tsx | f3364a7c |
| ✅ | Aggressive cache invalidation | Targeted invalidation on org switch | dad3d3e5 |

---

## Execution Phases

### Phase 1: Thread List Rows (Biggest Visual Impact)

**Goal**: Email rows look and feel like Superhuman — dense, scannable, with clear unread distinction and smooth hover actions.

**Changes**:
1. **ThreadListItem.tsx** — Redesign row layout:
   - Tighten vertical padding: `py: 1` → `py: 0.75` (48px target height)
   - Sender name: `fontWeight: 700` for unread (bold), `500` for read (medium)
   - Subject + snippet on same line with em-dash, `text.secondary` for subject, `text.disabled` for snippet
   - Date right-aligned, `tabularNums` for alignment
   - Left accent border: 3px teal for unread → 3px transparent for read (already exists, verify)
   - Hover background: subtle `action.hover` with 150ms transition
   - Selected background: `primary.main` at 8% opacity

2. **Hover action bar** — Improve visibility and accessibility:
   - Gradient fade from transparent to `background.paper` before action buttons
   - Actions: Flag (toggle) | Archive | Delete — 3 buttons max for speed
   - Add keyboard accessibility: actions accessible via Tab when row focused
   - Add touch fallback: long-press or swipe gesture (existing behavior ok)

3. **UX fix: Undo on delete/archive** (anti-pattern #1, #2):
   - Show Snackbar with "Undo" action for 6 seconds after delete/archive
   - Optimistic remove from list, undo restores from snapshot

4. **UX fix: Optimistic revert notification** (anti-pattern #11):
   - Show error toast when flag/archive/delete fails and reverts

**Success Criteria**:
- Row height 48-56px, sender bold for unread, snippet muted
- Hover shows 3 action buttons with gradient mask
- Delete/archive shows undo snackbar
- Failed optimistic updates show error toast

---

### Phase 2: Sidebar Polish

**Goal**: Folder sidebar feels like Outlook — compact, clear active state, unread counts prominent.

**Changes**:
1. **FolderItem.tsx** — Visual refinement:
   - Active folder: left border accent (3px primary) instead of background tint
   - Unread count: right-aligned number (not badge on icon), bold when > 0
   - Tighter spacing: `py: 0.5` for compact feel
   - Icon: 18px, consistent color (primary when active, text.secondary otherwise)

2. **FolderSidebar.tsx** — Layout adjustments:
   - Section headers: uppercase caption, letter-spacing 0.5px
   - Provider sections: subtle divider, collapse animation smoothed
   - Sync button: inline with provider header, not floating

3. **UX fix: Remove duplicate folders fetch** (anti-pattern #13):
   - Remove `useFolders()` from `email.tsx`, rely on FolderSidebar's fetch
   - Pass needed folder data through Zustand store or shared query cache

**Success Criteria**:
- Active folder has left accent border
- Unread counts right-aligned as numbers
- Only 1x GET /api/v1/folders on page load
- Smooth collapse animations on provider sections

---

### Phase 3: Header & Search Bar

**Goal**: Search feels instant and powerful like Superhuman's command palette.

**Changes**:
1. **ThreadListHeader.tsx** — Cleaner toolbar:
   - Email count: subtle caption text, not prominent
   - Bulk actions: icon-only with tooltips, compact spacing
   - Separator between selection actions and global actions

2. **EmailSearchBar.tsx** — Enhanced search UX:
   - Placeholder with operator hints: "Search emails (from:, to:, has:attachment)"
   - Keyboard shortcut `/` to focus search
   - Clear button (X) visible when search has text
   - Search chips below bar for active filters

3. **UX fix: Filters in URL** (anti-pattern #3):
   - Sync folder/search/filter state to URL query params
   - On page load, restore filters from URL
   - Enables shareable filtered views and browser back/forward

**Success Criteria**:
- Search shows operator hints in placeholder
- `/` key focuses search input
- URL reflects current folder and search query
- Browser back/forward navigates filter history

---

### Phase 4: Reading Pane

**Goal**: Reading pane shows email content with clean typography and clear action hierarchy.

**Changes**:
1. **ExpandedMessage.tsx** — Typography refinement:
   - Sender: larger, bold, with avatar inline
   - Recipients: collapsed by default, expand on click ("to me, +3 others")
   - Date: relative format ("2 hours ago") with absolute on hover tooltip
   - Actions: reply/forward/more as icon row below header, not floating

2. **EmailHtmlContent.tsx** — Content rendering:
   - Max-width for readability (680px)
   - Proper link styling (primary color, underline on hover)
   - Image loading with placeholder skeleton

3. **UX fix: Scroll position preservation** (anti-pattern #4):
   - Cache scroll position per thread in a ref map
   - Restore on re-select

**Success Criteria**:
- Email content max-width 680px for readability
- Relative dates with tooltip
- Collapsed recipients
- Scroll position preserved when switching between threads

---

### Phase 5: Context Menu & Keyboard Polish

**Goal**: Right-click context menu and visible keyboard focus make the app feel native.

**Changes**:
1. **New: EmailContextMenu component** (~120 lines):
   - MUI Menu triggered by `onContextMenu` on ThreadListItem
   - Actions: Open, Reply, Reply All, Forward, Divider, Flag, Archive, Move to, Label, Divider, Mark read/unread, Delete
   - Keyboard accessible (arrow keys to navigate menu items)

2. **Keyboard focus indicators**:
   - Focused row: subtle `outline: 2px solid primary.main` with `-2px` offset
   - Reading pane focus: visible when navigating with keyboard
   - Enter key: verify it opens focused email (code exists, may need event fix)
   - `?` key: verify help dialog opens

3. **UX fix: Touch/keyboard access to quick actions** (anti-pattern #7):
   - When row is focused via keyboard, show quick actions
   - Tab into action bar from focused row

**Success Criteria**:
- Right-click on email row shows context menu with all actions
- Keyboard focus shows clear outline on rows
- Tab from focused row cycles through quick actions
- Enter opens focused email, ? opens help

---

### Phase 6: Micro-Animations & Transitions

**Goal**: Subtle motion that communicates state changes without slowing down the interface.

**Changes**:
1. **Row transitions**:
   - Archive/delete: row slides out with 200ms ease, list reflows smoothly
   - New email arrives: row slides in from top with 150ms ease
   - Selection: checkbox scales in with 100ms spring

2. **Panel transitions**:
   - Reading pane: content fades in with 150ms ease on thread switch
   - Sidebar collapse: width transitions with 200ms ease

3. **Loading states**:
   - Skeleton pulse matches row height exactly (anti-pattern #10 fix)
   - Shimmer direction: left-to-right, 1.5s duration

4. **Respect reduced-motion**:
   - All animations wrapped in `prefers-reduced-motion` check
   - Fallback: instant state changes, no animation

**Success Criteria**:
- Delete/archive shows slide-out animation
- Reading pane content fades on switch
- Skeletons match actual row dimensions
- `prefers-reduced-motion` disables all animations

---

## Execution Order

```
Phase 1 (Thread rows)     ← Start here, biggest impact
  └→ Phase 2 (Sidebar)    ← Visual consistency with rows
    └→ Phase 3 (Header)   ← Depends on sidebar for filter sync
      └→ Phase 4 (Pane)   ← Reading experience
        └→ Phase 5 (Menu) ← Interaction polish
          └→ Phase 6 (Motion) ← Final layer
```

**Constraint**: After EACH phase, run `cd frontend && npx tsc --noEmit` to validate.

---

## Files Touched Per Phase

| Phase | Primary Files | Secondary Files |
|-------|--------------|-----------------|
| 1 | ThreadListItem.tsx, use-email-page-actions.ts | email.tsx (undo snackbar) |
| 2 | FolderItem.tsx, FolderSidebar.tsx | email.tsx (remove useFolders) |
| 3 | ThreadListHeader.tsx, EmailSearchBar.tsx | email-ui-store.ts, email.tsx (URL sync) |
| 4 | ExpandedMessage.tsx, EmailHtmlContent.tsx | ThreadView.tsx |
| 5 | NEW EmailContextMenu.tsx, ThreadListItem.tsx | use-keyboard-navigation.ts |
| 6 | ThreadListItem.tsx, ThreadList.tsx | EmailLayout.tsx |

---

## Out of Scope

- Font change (Inter→custom) — requires `@fontsource` package change, separate PR
- Dark mode audit — handled by Phase 96 in v7.0 roadmap
- Mobile-specific redesign — current responsive behavior is adequate
- Compose dialog redesign — separate effort
- AI features in email — separate milestone
