# Phase 96: UI/UX Polish - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Every page gets proper empty states, loading skeletons, error feedback, mobile responsiveness, dark mode support, keyboard navigation, and complete Italian translation. No new features — polish only.

Requirements: UIPOL-01, UIPOL-02, UIPOL-03, UIPOL-04, UIPOL-05, UIPOL-06, UIPOL-07

</domain>

<decisions>
## Implementation Decisions

### Empty States (UIPOL-01)
- Style: MUI icon + short message + action CTA button per page
- Icons: domain-specific (Mail for emails, Calendar for events, Users for contacts, CheckSquare for tasks, BarChart for analytics, etc.)
- Icon colors: use existing semantic theme colors (email=blue, calendar=orange, contacts=purple, tasks=green, ai=teal)
- CTA should be contextual (e.g. "Compose email", "Add contact", "Create event")
- No custom SVG illustrations — MUI outlined icons only

### Error Feedback (UIPOL-03)
- Display: inline MUI Alert component replacing the content area where data would appear
- Error stays visible until resolved — no auto-dismiss toasts/snackbars for data fetch errors
- Every error Alert includes a "Retry" button
- Retry policy: TanStack Query `retry: 1` handles first auto-retry silently; if that fails, show inline Alert with manual Retry button
- User only sees errors that persisted after one automatic retry

### Loading Skeletons (UIPOL-02)
- Component: MUI `<Skeleton>` with wave animation (replace custom CSS pulse in chat)
- Fidelity: layout-matching — skeleton shape mirrors real content layout (email rows with avatar+subject+date placeholders, calendar event blocks, etc.)
- Progressive loading: each widget/section shows its own skeleton and resolves independently (natural with TanStack Query per-query resolution)
- No full-page skeleton blocking — each data source resolves on its own

### Mobile Responsiveness (UIPOL-04)
- Scope: audit ALL 28 protected pages at 375px width
- Minimum supported width: 375px (iPhone SE)
- Fix all overflow, hidden content, unreadable text issues
- Audit approach: identify broken pages → create fix tasks directly (no separate screenshot report)
- Chat already has 768px breakpoint mobile layout — extend responsive patterns to all pages

### Dark Mode (UIPOL-05)
- Approach: visual audit per page in dark mode
- Fix unthemed elements: white backgrounds, wrong text colors, hard-to-read borders
- All styling through MUI `palette.mode='dark'` — no manual dark class toggles
- ChatThemeBridge stays (removed in Phase 97)

### Keyboard Navigation (UIPOL-06)
- Level: Tab + Enter on all interactive elements — standard navigation only
- No custom keyboard shortcuts (no 'c' to compose, no j/k navigation)
- Focus rings visible via MUI default `:focus-visible` styling
- Every button, link, and form control must be focusable and operable via keyboard

### Italian Translation (UIPOL-07)
- Audit method: script-based key comparison (en.ts vs it.ts key tree diff)
- Also grep .tsx files for hardcoded English strings bypassing translation system
- New strings added in this phase get en + it translation immediately (same task, not batched)
- Follow CLAUDE.md procedure: translations first, then component work

### Claude's Discretion
- Exact skeleton shapes per page (as long as they match content layout)
- Specific MUI Alert variant/severity per error type
- Exact responsive breakpoint implementation approach per page
- Focus order within complex layouts
- Script implementation for i18n key comparison

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend Procedures
- `CLAUDE.md` §Frontend Procedure — Translation-first workflow, query hooks pattern, loading/error/empty state requirements
- `docs/CLAUDE_REFERENCE.md` — Component template, API module table, UI patterns

### Existing UI Patterns
- `frontend/src/components/chat/ChatEmptyState.tsx` — Reference empty state pattern (icon + text + capability cards)
- `frontend/src/components/chat/ChatPage.tsx` — Reference skeleton pattern (ChatSkeleton function)
- `frontend/src/components/chat/ChatMobileLayout.tsx` — Reference mobile layout pattern (slide-over sidebar)
- `frontend/src/components/chat/ChatThemeBridge.tsx` — Dark mode CSS variable bridge (stays until Phase 97)

### i18n
- `frontend/locales/en.ts` — English translations (~3571 keys, 4066 lines)
- `frontend/locales/it.ts` — Italian translations (4043 lines)
- `frontend/locales/index.ts` — Type definitions and locale registry

### Architecture
- `.planning/codebase/CONVENTIONS.md` — Naming patterns, code style, import organization
- `.planning/codebase/STRUCTURE.md` — File organization, component locations

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatEmptyState.tsx`: Icon + text + action cards pattern — adapt for non-chat pages (simpler: icon + text + CTA button)
- `ChatSkeleton()` in `ChatPage.tsx`: CSS pulse skeleton — will be replaced by MUI `<Skeleton>` components
- `ChatMobileLayout.tsx` + `ChatDesktopLayout.tsx`: Mobile/desktop split pattern at 768px
- `ChatThemeBridge.tsx`: Hex→HSL MUI palette→CSS var bridge for dark mode
- Tool UI error patterns in `EmailListToolUI.tsx`, `AnalysisToolUI.tsx`: MUI semantic colors (error.light/main) for error states

### Established Patterns
- MUI `sx` props for all styling — no Tailwind utilities in .tsx files
- `useTranslations()` hook → `t.section.key` for all user-visible strings
- TanStack Query with `queryOptions()` in `frontend/hooks/queries/use-*.ts`
- Domain semantic colors: email=blue, calendar=orange, contacts=purple, tasks=green, ai=teal
- `aria-label` on all interactive elements (359 uses across chat components)

### Integration Points
- Each protected page under `frontend/src/app/(protected)/` needs empty state, skeleton, error handling
- Translation keys added to `frontend/locales/en.ts` and `frontend/locales/it.ts`
- Type definitions for new keys in `frontend/locales/index.ts`
- MUI theme at `frontend/src/theme/` controls dark mode palette

</code_context>

<specifics>
## Specific Ideas

- User wants mobile audit of all broken pages — direct issue identification, no report artifact
- Extend chat's existing patterns (empty state, skeleton, mobile layout) to all pages consistently
- Phase 95 already removed some hardcoded strings — i18n grep catches any remaining

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 96-ui-ux-polish*
*Context gathered: 2026-03-21*
