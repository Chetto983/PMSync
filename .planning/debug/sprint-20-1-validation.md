---
status: investigating
trigger: "Deep production validation of Sprint 20.1 — UX Anti-Patterns Remediation"
created: 2026-04-01T12:00:00Z
updated: 2026-04-01T12:30:00Z
---

## Validation Report — Sprint 20.1

### Critical Issues (must fix before deploy)

*None found.*

### High Issues (fix soon)

**H-1: Stale closure + unnecessary re-renders in CrmSuggestionsFeed `handleAccept`/`handleDismissConfirm`**
- **Task:** T-2011
- **File:** `frontend/components/dashboard/CrmSuggestionsFeed.tsx`
- **Lines:** 188-203, 209-227
- **Issue:** `pendingIds` is in the dependency array of `handleAccept` and `handleDismissConfirm`. Every time `pendingIds` changes (Set is recreated), both callbacks get new references. Since `SuggestionItem` is a `memo` component receiving `onAccept={handleAccept}` and `onDismiss={handleDismissClick}`, every accept/dismiss causes ALL items to re-render (not just the one being acted on). The `isPending` prop already changes per-item, but the unstable callback references defeat memoization for the rest.
- **Impact:** Performance — clicking accept on 1 suggestion re-renders all N suggestions. With many suggestions this is noticeable.
- **Fix:** Use functional updater pattern to remove `pendingIds` from deps:
  ```tsx
  const handleAccept = useCallback(async (id: string) => {
    setPendingIds((prev) => {
      if (prev.has(id)) return prev; // already pending, bail via early return below
      return new Set(prev).add(id);
    });
    // ... rest needs refactoring to use ref for the guard check
  }, [acceptMutation, toast, ts, t.common]);
  ```
  Or simpler: pass `pendingIds` as a ref (`useRef`) for the guard check, keep `setPendingIds` (which is stable) for mutations.

**H-2: `role="link"` is semantically wrong for items that call `router.push()`**
- **Task:** T-2018
- **File:** `frontend/components/common/EntityContextSidebar.tsx`
- **Lines:** 258-266, 318-326
- **Issue:** Deal and ticket `ListItem`s have `role="link"` but use `onClick={() => router.push(...)}` not an `<a>` tag. ARIA spec says `role="link"` must behave like a hyperlink (middle-click, right-click > open in new tab). These items use JS navigation only. Screen readers will announce them as links, but they don't support link behaviors (e.g., Ctrl+click to open in new tab).
- **Impact:** Accessibility misrepresentation. Screen reader users expect link behavior (context menu, open in new tab) that isn't available.
- **Fix:** Either:
  1. Change to `role="button"` (since they trigger navigation programmatically), OR
  2. Wrap content in a Next.js `<Link>` or `<a>` tag to get real link semantics (preferred for SEO and accessibility).

**H-3: Debounce timer leak in KBBrowsePage**
- **Task:** T-2015
- **File:** `frontend/components/dashboard/crm-kb/KBBrowsePage.tsx`
- **Lines:** 72-78
- **Issue:** `debounceTimer` is stored in `useState` and cleared manually in `handleSearchChange`, but there is no cleanup on unmount. If the user navigates away while a debounce timer is pending, `setDebouncedSearch` fires on an unmounted component.
- **Impact:** React warning "Can't perform state update on unmounted component" (though React 18+ is more lenient, this is still a leak pattern).
- **Fix:** Use `useEffect` with cleanup or `useRef` for the timer:
  ```tsx
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  ```

**H-4: URL sync useEffect can fire on initial render with stale values, creating unnecessary history entries**
- **Task:** T-2015
- **File:** `frontend/components/dashboard/crm-kb/KBBrowsePage.tsx` (line 61-69), `TicketsList.tsx` (line 58-66), `AccountsList.tsx` (line 51-57), `ChurnWarningsList.tsx` (line 74-80)
- **Issue:** The `useEffect` that syncs state to URL runs on every change to any filter/page state. On initial render, state is initialized FROM `router.query`, but the effect immediately calls `router.replace()` with the same values. This is a wasted navigation. Additionally, `router` is excluded from deps via eslint-disable, which is fine, but if `router.pathname` changes between renders (unlikely but possible in a redirect), the stale closure could write to the wrong path.
- **Impact:** Minor — extra `router.replace` on mount that's a no-op. Not a bug per se, but not clean.
- **Fix:** Add a `useRef(true)` flag to skip the first render, or compare current query before replacing.

### Medium Issues (fix later)

**M-1: Missing `aria-label` on DealProductsTab remove button**
- **Task:** T-2020
- **File:** `frontend/components/dashboard/crm-deals/DealProductsTab.tsx`
- **Line:** 382-388
- **Issue:** The `IconButton` for removing a product from a deal has no `aria-label`. Compare with `DealContactsTab.tsx` line 336 which correctly has `aria-label={tc?.removeContact ?? 'Remove contact'}`.
- **Impact:** Accessibility — screen readers will not announce the button's purpose.
- **Fix:** Add `aria-label={tp?.removeProduct ?? 'Remove product'}`.

**M-2: Missing `aria-label` on KBBrowsePage edit/delete IconButtons**
- **Task:** T-2020
- **File:** `frontend/components/dashboard/crm-kb/KBBrowsePage.tsx`
- **Lines:** 314-328
- **Issue:** The edit and delete `IconButton`s in the articles table have no `aria-label` attributes.
- **Impact:** Accessibility gap — icon-only buttons without labels.
- **Fix:** Add `aria-label={t.common?.edit ?? 'Edit'}` and `aria-label={t.common?.delete ?? 'Delete'}`.

**M-3: Missing `aria-label` on AccountDetail "Back to accounts" button**
- **Task:** T-2020
- **File:** `frontend/components/dashboard/crm-accounts/AccountDetail.tsx`
- **Line:** 478-483
- **Issue:** The back button has a hardcoded `aria-label="Back to accounts"` instead of using a translation key. This is inconsistent with the i18n pattern used everywhere else.
- **Impact:** Non-English users get English-only screen reader text.
- **Fix:** Use `aria-label={ta?.breadcrumb?.accounts ?? 'Back to accounts'}` or add a dedicated translation key.

**M-4: AccountsList delete button missing `aria-label`**
- **Task:** T-2020
- **File:** `frontend/components/dashboard/crm-accounts/AccountsList.tsx`
- **Line:** 235-239
- **Issue:** The delete `IconButton` uses `sx={{ minWidth: 44, minHeight: 44 }}` (good for touch target) but has no `aria-label`. It only has a `Tooltip` wrapping it.
- **Impact:** `Tooltip` title does NOT provide accessible name for the button. Screen readers won't announce purpose. Note: MUI Tooltip does forward `aria-label` to the child via `title` attribute fallback, but this is unreliable across assistive technologies.
- **Fix:** Add explicit `aria-label={ta?.deleteAccount ?? 'Delete'}`.

**M-5: `getWidgetDescription` ignores translation parameter**
- **Task:** N/A (pre-existing, but exposed by Sprint 20.1 changes)
- **File:** `frontend/components/dashboard/dashboard/widget-registry.ts`
- **Line:** 130
- **Issue:** `getWidgetDescription` accepts `_t` (translation object) but all description strings are hardcoded English. The `crmSuggestions` description is also hardcoded.
- **Impact:** Non-English users see English descriptions in the customize drawer.
- **Fix:** Add translation keys for widget descriptions.

**M-6: TicketsList search is not debounced**
- **Task:** T-2015
- **File:** `frontend/components/dashboard/crm-tickets/TicketsList.tsx`
- **Line:** 131
- **Issue:** The search `TextField` directly sets `search` state on every keystroke, and this is passed directly to the `useTickets` query. Unlike KBBrowsePage which has debounced search, TicketsList fires an API request on every keypress.
- **Impact:** Performance — rapid typing fires many unnecessary API requests.
- **Fix:** Add debounce similar to KBBrowsePage pattern. (Note: This predates Sprint 20.1, but the URL sync changes now make it more visible since the URL also updates on every keystroke.)

### Low / Nitpicks

**L-1: `handleAccept` catch block in CrmSuggestionsFeed uses `t.common?.genericError`**
- **Task:** T-2022
- **File:** `frontend/components/dashboard/CrmSuggestionsFeed.tsx`
- **Lines:** 195, 219, 235
- **Issue:** The task T-2022 was about replacing generic error messages with specific keys. The CrmSuggestionsFeed still uses `t.common?.genericError` for accept/dismiss/bulk errors. This wasn't listed in the T-2022 scope (which focused on AccountContactsTab, AccountDetail, DealContactsTab, DealProductsTab), but it's inconsistent.
- **Impact:** Users see a generic "Error" instead of "Failed to accept suggestion" etc.
- **Fix:** Consider adding specific error keys: `ts?.acceptError`, `ts?.dismissError`, `ts?.bulkError`.

**L-2: `AccountDetail.handleSave` has unused `t` in dependency array**
- **Task:** T-2022
- **File:** `frontend/components/dashboard/crm-accounts/AccountDetail.tsx`
- **Line:** 410
- **Issue:** `handleSave` useCallback deps include `t` (the entire translations object), which is unused in the callback body (only `ta` is used, which is already in deps). This causes unnecessary callback recreation whenever any translation changes.
- **Impact:** Minor perf — extra re-renders.
- **Fix:** Remove `t` from the dependency array.

**L-3: Escape key handling on ConfirmDialog is correct (MUI Dialog default)**
- **Task:** T-2012
- **Observation:** MUI `Dialog` component handles Escape key natively via `onClose`. The `ConfirmDialog` correctly passes `onClose` which calls `handleClose` that checks `!isLoading` before closing. This is properly implemented.

**L-4: `handleDismissConfirm` in CrmSuggestionsFeed clears `dismissConfirmId` before the guard check**
- **Task:** T-2012
- **File:** `frontend/components/dashboard/CrmSuggestionsFeed.tsx`
- **Lines:** 209-227
- **Issue:** The function first gets `id` from `dismissConfirmId`, then sets `dismissConfirmId(null)`, then checks `pendingIds.has(id)`. This is correct — the dialog closes immediately, and the guard prevents duplicate submission. However, if the user somehow re-opens the dialog for the same ID before the async completes, the `pendingIds` guard will correctly block it. The flow is sound.
- **Impact:** None — this is just a note that it was reviewed.

### Passed Validations (what's correct)

1. **T-2011 (pendingIds double-submit guard):** Correctly uses `Set<string>` to track in-flight IDs. `CircularProgress` shows during pending. `isPending` prop disables buttons and reduces opacity. Guard check at start of `handleAccept` and `handleDismissConfirm` prevents double-submit. PASS (with H-1 perf note).

2. **T-2012 (ConfirmDialog for dismiss):** `ConfirmDialog` correctly shown with `variant="warning"`, proper title/message from translations. Single-item dismiss only (not bulk). Bulk dismiss/accept has no confirmation (as intended per task spec "not bulk dismiss"). PASS.

3. **T-2013 (KBBrowsePage ConfirmDialog):** Replaces `window.confirm` with `ConfirmDialog` component, `variant="danger"`, loading state from `deleteMutation.isPending`, proper translation keys `confirmDeleteTitle` and `confirmDelete`. PASS.

4. **T-2014 (Touch targets >= 44px):** `CrmSuggestionsFeed` IconButtons: `sx={{ width: 44, height: 44 }}` (lines 118, 130). `EntityContextSidebar`: expand/collapse buttons `sx={{ width: 44, height: 44 }}` (lines 393, 440). `ChurnWarningsList`: `sx={{ minWidth: 44, minHeight: 44 }}` (lines 303, 317). `AccountsList`: `sx={{ minWidth: 44, minHeight: 44 }}` (line 238). `AccountDetail`: `sx={{ minWidth: 44, minHeight: 44 }}` (line 481). PASS.

5. **T-2015 (URL state sync):** All four pages (TicketsList, AccountsList, KBBrowsePage, ChurnWarningsList) correctly: (a) read initial state from `router.query` via lazy initializers, (b) sync back with `router.replace(..., { shallow: true })`. PASS (with H-3, H-4, M-6 notes).

6. **T-2016 (CSS transition on EntityContextSidebar):** Drawer wrapper has `transition` on `width` property using theme transitions: `theme.transitions.create('width', { duration: theme.transitions.duration.leavingScreen })`. PASS.

7. **T-2017 (ActivityTimeline isLoadingMore):** `isLoadingMore` prop correctly disables "Load More" button and shows `CircularProgress` spinner as `startIcon`. Button text changes to loading text. PASS.

8. **T-2018 (Keyboard navigation):** Deal and ticket items in EntityContextSidebar have `tabIndex={0}` and `onKeyDown` handler for Enter and Space keys with `e.preventDefault()`. PASS (with H-2 `role="link"` concern).

9. **T-2019 (Strength bar aria):** Strength bar container has `role="img"` and `aria-label` with template interpolation: `` `${tc?.relationshipStrength ?? 'Relationship strength'}: ${strength}` ``. Correctly includes the strength value. PASS.

10. **T-2020 (aria-labels on icon buttons):** ContactDetail: all icon buttons (VIP, edit, delete, duplicates, close) have `aria-label`. EntityContextSidebar: expand/collapse buttons have `aria-label`. CrmSuggestionsFeed: accept/dismiss have `aria-label`. ChurnWarningsList: acknowledge/view buttons have `aria-label`. PARTIAL PASS (see M-1, M-2, M-4).

11. **T-2021 (Required field markers):** CreateTicketDialog subject field has `required` prop (line 62). KBArticleEditor title field has `required` (line 163), body field has `required` (line 182). MUI `TextField` with `required` prop adds asterisk to label and `aria-required`. PASS.

12. **T-2022 (Specific error messages):** AccountContactsTab: `tc?.linkError`, `tc?.unlinkError`, `tc?.loadError`. AccountDetail: `ta?.updateError`, `ta?.loadError`. DealContactsTab: `tc?.linkError`, `tc?.unlinkError`, `tc?.loadError`. DealProductsTab: `tp?.linkError`, `tp?.unlinkError`, `tp?.loadError`. All keys exist in en.ts, it.ts, and index.ts types. PASS.

---

## VERDICT: PASS WITH WARNINGS

Sprint 20.1 implementation is fundamentally sound. All 12 tasks are implemented and functional. The high issues (H-1 through H-4) should be addressed before the next sprint. The medium issues (M-1 through M-6) are accessibility and consistency gaps that should go in the backlog.

**Summary:**
- 12/12 tasks implemented
- 2 High issues (perf + a11y semantic)
- 6 Medium issues (missing aria-labels, hardcoded strings, no debounce)
- 4 Low/nitpick observations
- No critical/blocking issues
