# Phase 02: Polish & Completion - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete iOS polish (viewport-fit=cover) and E2E test coverage (7 skipped search filter tests). This phase delivers two distinct polish items deferred from v2.0.

</domain>

<decisions>
## Implementation Decisions

### iOS Safe Area Handling

- **Placement:** viewport-fit=cover in `_document.tsx` only — single meta tag in document head
- **Theme integration:** MUI theme spacing tokens (`theme.spacing.safeBottom`, `theme.spacing.safeSides`) for safe area insets
- **Landscape support:** Yes — handle notch sides with left/right safe area insets
- **Components affected:** FAB, bottom navigation, AND bottom sheet modals — all need safe area adjustments
- **Cross-platform:** Claude decides fallback behavior for non-iOS devices (Android/desktop)
- **Target devices:** iPhone X+ (notched devices only — X, 11, 12, 13, 14, 15)
- **Validation:** Chrome DevTools simulation with iPhone X+ device profiles

### Search Filter Tests

- **Data strategy:** Real API calls with user's actual tenant — no mocks for happy path
- **Filter priority:** All 7 skipped filters equally — enable and test all at once
- **Result verification:** Full result verification — assert returned emails match filter criteria
- **Filter combinations:** Include AND combinations (e.g., `from:X subject:Y`)
- **Empty results:** Show suggestion to broaden search (offer to remove filters or suggest alternatives)
- **Test entry:** URL query params (navigate to `/email?search=from:X`)
- **Data requirements:** Document in README what emails must exist for tests to pass
- **Filter chip UI:** Verify chips render with correct labels
- **Filter removal:** Test both individual chip X button AND clear all button

### Test Environment

- **CI:** Run in both GitHub Actions and locally
- **Browser matrix:** Chrome + Firefox + Safari (full cross-browser coverage)
- **Flaky handling:** Claude decides based on existing test config
- **Execution mode:** Sequential (safer for tests using same tenant data)

### Error Scenarios

- **Invalid syntax:** Verify helpful error message for malformed filters
- **API 500:** Mock 500 response, verify UI handles it gracefully
- **Timeout:** Simulate slow network, verify loading state and timeout handling
- **Offline:** Claude decides based on PWA patterns

### Claude's Discretion

- Non-iOS device safe area fallback approach
- Flaky test retry strategy (based on existing config)
- Offline search behavior

</decisions>

<specifics>
## Specific Ideas

- MUI theme integration preferred over raw CSS custom properties for safe area tokens
- Sequential test execution ensures tenant data consistency across filters
- Full verification approach: parse → API call → result assertion → chip display

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-polish-completion*
*Context gathered: 2026-02-05*
