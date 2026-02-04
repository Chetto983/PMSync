# v2.1 Requirements: Optimization & Polish

## Overview

**Version:** v2.1
**Goal:** Performance optimization and polish items deferred from v2.0
**Total Requirements:** 5

## Performance (OPT-01 to OPT-02)

### OPT-01: Code Splitting for LCP

**What:** Implement React.lazy code splitting to meet LCP budget
**Why:** Current LCP is 4.12s, target is 2.5s
**Acceptance:**
- [ ] Identify non-critical widgets for lazy loading
- [ ] Implement React.lazy with Suspense boundaries
- [ ] Add skeleton fallbacks for lazy components
- [ ] Achieve LCP <= 2.5s in Lighthouse CI

### OPT-02: Code Splitting for TTI

**What:** Reduce Time to Interactive through deferred loading
**Why:** Current TTI is 4.13s, target is 3.5s
**Acceptance:**
- [ ] Defer non-essential JavaScript
- [ ] Implement route-based code splitting
- [ ] Achieve TTI <= 3.5s in Lighthouse CI

## Polish (POLISH-01 to POLISH-02)

### POLISH-01: iOS Viewport Safe Area

**What:** Add viewport-fit=cover meta tag for iOS safe areas
**Why:** iOS safe area CSS won't activate without this meta tag
**Acceptance:**
- [ ] Add viewport-fit=cover to _app.tsx or _document.tsx
- [ ] Verify safe-area-inset-* CSS works on iPhone X+
- [ ] Test on iOS Safari (notch area rendering)

### POLISH-02: Search Filter E2E Tests

**What:** Complete the 7 skipped search filter E2E tests
**Why:** Filter parsing works but tests need full search state
**Acceptance:**
- [ ] Implement search state management for E2E
- [ ] Enable skipped tests
- [ ] All 7 search filter tests passing

## Backend API (API-01)

### API-01: Folder Nesting Endpoint

**What:** Backend PATCH /folders/:id { parentId } endpoint
**Why:** Frontend drag-folder-into-folder UI is ready but lacks backend
**Acceptance:**
- [ ] Create PATCH /api/folders/:id endpoint
- [ ] Accept parentId in request body
- [ ] Validate folder ownership and tenant isolation
- [ ] Prevent circular references
- [ ] Update folder tree structure
- [ ] Add unit tests

---

## Requirement Coverage

| Category | Count | Requirements |
|----------|-------|--------------|
| Performance | 2 | OPT-01, OPT-02 |
| Polish | 2 | POLISH-01, POLISH-02 |
| Backend API | 1 | API-01 |
| **Total** | **5** | |

---
*Requirements defined: 2026-02-04*
