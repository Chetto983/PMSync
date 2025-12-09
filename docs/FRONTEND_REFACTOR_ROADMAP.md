# Frontend Refactor Roadmap

## Overview

This roadmap outlines the systematic refactoring of the MailAgent frontend based on a comprehensive audit conducted on December 9, 2025.

**Current State:**
- ~130 source files, 41,196 lines of code
- Next.js 16.0.8 + React 19.2.1
- Material-UI 7.3.6 + Tailwind CSS 4.1.17
- Zustand 5.0.9 + React Query 5.90.12

**Target State:**
- Optimized bundle size (40% reduction target)
- Zero any types in production code
- No console statements in production
- Memoized components preventing unnecessary re-renders
- Dynamic imports for all modals and heavy components

---

## Phase 0: Critical Security and Hygiene (P0)

**Goal:** Address security vulnerabilities and basic code hygiene issues.

### Task 0.1: Update Vulnerable Dependencies

**File:** package.json

**Issue:** mdast-util-to-hast has a moderate severity vulnerability (CWE-20, CWE-915)

**Action:**
\
### Task 0.2: Remove Console Statements (70+ instances)

**Files Affected:**
- components/dashboard/Mailbox.tsx (20+)
- components/dashboard/Calendar.tsx (20+)
- components/dashboard/Contacts.tsx (14+)
- pages/dashboard/ai.tsx (10+)

**Action:** Replace with logger.debug/error/warn from lib/logger

### Task 0.3: Configure ESLint Rules

Add to eslint.config.mjs:
- no-console: error
- @typescript-eslint/no-explicit-any: error
- @typescript-eslint/no-unused-vars: error

---

## Phase 1: TypeScript Strictness (P1)

### Task 1.1: Type WebSocket Event Interfaces
**File:** lib/websocket-client.ts (Lines 20-105)
Replace any types with proper entity types

### Task 1.2: Type API Response Mappers
**File:** components/dashboard/Mailbox.tsx (Lines 73-81)
Create ApiEmail and StoreEmail interfaces

### Task 1.3: Fix Component Type Annotations
**File:** pages/_app.tsx (Line 109)
Use NextPageWithLayout type

### Task 1.4: Type Translation Objects
Create types/i18n.ts with TranslationKeys interface

---

## Phase 2: Component Architecture (P1)

### Task 2.1: Split Mailbox Component (1,663 lines -> 5 components)

**Target Structure:**
- MailboxLayout.tsx (300 lines)
- MailboxHeader.tsx (200 lines)
- MailboxSidebar.tsx (250 lines)
- EmailListPane.tsx (300 lines)
- EmailDetailPane.tsx (150 lines)
- MailboxModals.tsx (200 lines)
- hooks/useMailboxState.ts
- hooks/useMailboxActions.ts
- hooks/useMailboxWebSocket.ts

### Task 2.2: Split Calendar Component (1,600+ lines)

**Target Structure:**
- CalendarLayout.tsx
- CalendarView.tsx
- CalendarSidebar.tsx
- EventEditor.tsx
- EventQuickView.tsx

### Task 2.3: Split AI Page (1,200+ lines)

**Target Structure:**
- AiDashboard.tsx
- ChatInterface.tsx
- PendingActionsQueue.tsx
- LearningInsights.tsx
- AgentStatus.tsx

---

## Phase 3: Performance Optimization (P1)

### Task 3.1: Dynamic Imports for Modals (~300KB reduction)
Use next/dynamic for ComposeDialog, AdvancedSearchDialog, etc.

### Task 3.2: Lazy Load FullCalendar (~350KB reduction)
Create FullCalendarWrapper with dynamic import

### Task 3.3: Optimize Icon Imports (~60KB reduction)
Create lib/icons.ts for centralized exports

### Task 3.4: Add React.memo to List Items
- ThreadListItem.tsx
- ContactListItem.tsx
- DashboardCard.tsx

### Task 3.5: Memoize Callbacks and Derived State
Convert inline callbacks to useCallback
Wrap derived state in useMemo

### Task 3.6: Configure Image Optimization
Add remotePatterns to next.config.js

### Task 3.7: Debounce WebSocket Event Handlers
Consolidate AI stats refresh calls

---

## Phase 4: Code Organization (P2)

### Task 4.1: Abstract WebSocket Event Handlers
Create createEventHandler to replace 30+ repetitive methods

### Task 4.2: Create Shared Error Handler
Create lib/error-handler.ts

### Task 4.3: Consolidate API Response Types
Create unified ApiResponse<T> wrapper

### Task 4.4: Remove Dead Code
Remove unused variables in Mailbox, Dashboard, Tasks, ai.tsx

---

## Phase 5: Testing and Quality Gates (P2)

### Task 5.1: Add Component Tests
Coverage Targets: Stores 90%, Hooks 80%, Components 70%, Utils 95%

### Task 5.2: Add Bundle Size CI Check

### Task 5.3: Add Performance Regression Tests

---

## Implementation Schedule

### Week 1-2: Phase 0 (Critical)
- [ ] Update vulnerable dependencies
- [ ] Remove all console statements
- [ ] Configure ESLint rules

### Week 3-4: Phase 1 (TypeScript)
- [ ] Type WebSocket interfaces
- [ ] Type API response mappers
- [ ] Fix component type annotations

### Week 5-8: Phase 2 (Component Architecture)
- [ ] Split Mailbox.tsx
- [ ] Split Calendar.tsx
- [ ] Split AI page

### Week 9-12: Phase 3 (Performance)
- [ ] Implement dynamic imports
- [ ] Lazy load FullCalendar
- [ ] Add React.memo
- [ ] Configure image optimization

### Week 13-14: Phase 4 (Code Organization)
- [ ] Abstract WebSocket handlers
- [ ] Create shared error handler
- [ ] Remove dead code

### Week 15-16: Phase 5 (Testing)
- [ ] Add component tests
- [ ] Set up CI checks

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Bundle Size | ~1.5MB | <900KB |
| any Types | 15+ | 0 |
| Console Statements | 70+ | 0 |
| Largest Component | 1,663 LOC | <400 LOC |
| Test Coverage | ~60% | >80% |
| Lighthouse Performance | ~70 | >90 |

---

## Risk Mitigation

1. **Regression Bugs:** Write integration tests before splitting
2. **WebSocket Issues:** Create comprehensive WebSocket test suite
3. **Performance Regression:** Measure load times before/after changes
4. **Type Errors:** Enable strict mode incrementally

---

## Files to Modify

- components/dashboard/Mailbox.tsx -> Split into 5+ files
- components/dashboard/Calendar.tsx -> Split into 4+ files
- pages/dashboard/ai.tsx -> Split into components
- lib/websocket-client.ts -> Type interfaces
- next.config.js -> Image optimization
- eslint.config.mjs -> Add rules
- package.json -> Update dependencies

## New Files to Create

- components/email/MailboxLayout.tsx
- components/email/MailboxHeader.tsx
- components/email/hooks/useMailboxState.ts
- types/api.ts
- types/i18n.ts
- lib/icons.ts
- lib/error-handler.ts

---

*Generated from frontend audit - December 9, 2025*
