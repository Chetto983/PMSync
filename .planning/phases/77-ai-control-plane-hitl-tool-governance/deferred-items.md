# Deferred Items - Phase 77

## From Plan 77-02

### Header/AiActionsBell Poll-Based HITL Cleanup
- **Files:** `frontend/components/layout/Header.tsx`, `frontend/components/layout/header/AiActionsBell.tsx`, `frontend/components/layout/header/header-utils.ts`
- **Issue:** These components still use PendingAction type and poll-based getPendingActions/approveAction/rejectAction from ai.ts
- **Impact:** PendingAction type and 3 API methods cannot be fully removed from ai.ts until these are cleaned
- **Decision needed:** Keep the header notification bell with SDK-native mechanism, or remove it entirely since approval now happens inline in chat
