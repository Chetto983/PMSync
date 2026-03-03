---
status: diagnosed
phase: 28-cleanup-voltagent-deletion
source: [28-01-SUMMARY.md, 28-02-SUMMARY.md, 28-03-SUMMARY.md]
started: 2026-03-03T10:00:00Z
updated: 2026-03-03T10:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Chat page loads after dead code deletion
expected: Navigate to the chat page. The assistant-ui chat should render with message thread area and composer input. No console errors about missing modules.
result: issue
reported: "POST /api/v1/ai/chat returns 403 Forbidden when sending a message. GET /api/v1/ai/stats/action-counts returns 404 Not Found (repeated polling). UI renders but chat is non-functional."
severity: blocker

### 2. Email thread detail page loads cleanly
expected: Navigate to any email thread (e.g. /dashboard/email/thread/{threadId}). Page loads normally. No EmailChatPanel or floating chat button visible — they were removed. The email content renders without errors.
result: issue
reported: "i don't know look all broken"
severity: blocker

### 3. Frontend type-check passes
expected: Run `npm run type-check` in the frontend directory. It should pass with zero type errors (pre-existing lint warnings are acceptable).
result: pass

### 4. Zero voltagent references in frontend
expected: Run `grep -r "voltagent" frontend/src frontend/lib frontend/hooks frontend/components frontend/pages frontend/e2e --include="*.ts" --include="*.tsx" -l` — should return zero matching files.
result: pass

### 5. Playwright E2E chat tests pass
expected: Run `npx playwright test chat-e2e` from the frontend directory. All 5 tests should pass: streaming response, tool result cards, HITL approval, briefing widget, mobile layout.
result: issue
reported: "20 passed, 6 failed. All 6 failures on mobile viewports (mobile-chrome, mobile-safari): sends message/streaming response, tool result card, HITL approval card. Desktop tests pass."
severity: major

## Summary

total: 5
passed: 2
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "Chat page should be functional after dead code deletion — send messages and receive responses"
  status: failed
  reason: "User reported: POST /api/v1/ai/chat returns 403 Forbidden. GET /api/v1/ai/stats/action-counts returns 404. UI renders but chat non-functional."
  severity: blocker
  test: 1
  root_cause: "Two separate bugs: (A) ConsentGuard on ai-chat.controller.ts:68 has @RequiresConsent('ai_chat') — no userConsent row exists in DB for this feature, so ConsentGuard throws ForbiddenException (default-deny). (B) GET /api/v1/ai/stats/action-counts endpoint never existed on backend — it was served by the old voltagent proxy deleted in Phase 28. Frontend lib/api/ai.ts:718 calls it, use-ai-actions.ts:118 polls it."
  artifacts:
    - path: "backend/src/modules/ai-chat/controllers/ai-chat.controller.ts"
      issue: "Line 68: @RequiresConsent('ai_chat') blocks all users without consent row"
    - path: "backend/src/modules/compliance/guards/consent.guard.ts"
      issue: "Lines 48-51: default-deny when no userConsent record found"
    - path: "frontend/lib/api/ai.ts"
      issue: "Line 718: getActionCounts() calls non-existent /api/v1/ai/stats/action-counts"
    - path: "frontend/hooks/ai/use-ai-actions.ts"
      issue: "Line 118: countsQuery polls missing endpoint on every AssistantMessage render"
  missing:
    - "Remove @RequiresConsent('ai_chat') from chat handler OR seed userConsent row for ai_chat feature"
    - "Add GET stats/action-counts endpoint to AiController OR disable countsQuery in use-ai-actions.ts"
- truth: "Email thread detail page loads cleanly without old EmailChatPanel/Fab components"
  status: failed
  reason: "User reported: i don't know look all broken"
  severity: blocker
  test: 2
  root_cause: "Thread detail page wraps ThreadView inside EmailLayout which renders a 2-pane Allotment (FolderSidebar | children). ThreadView is squeezed into the narrow email-list pane instead of full-width. Height chain breaks: ThreadViewOutlook sets height:100% but Allotment parent has no resolved height, collapsing content to zero. FolderSidebar renders on a page that has no email list context."
  artifacts:
    - path: "frontend/pages/dashboard/email/thread/[threadId].tsx"
      issue: "Lines 339-384: wraps ThreadView in EmailLayout instead of simple full-width container"
    - path: "frontend/components/email/layout/EmailLayout.tsx"
      issue: "Lines 319-413: 2-pane mode always renders FolderSidebar; thread content squeezed into list pane"
    - path: "frontend/components/email/thread/ThreadViewOutlook.tsx"
      issue: "Lines 164-169: height:100% collapses to zero when parent Allotment pane has no resolved height"
  missing:
    - "Replace EmailLayout wrapper with simple full-height Box container on thread detail page"
    - "Apply same fix to loading/error/empty states (lines 260-337) which also use EmailLayout"
- truth: "Playwright E2E chat tests should all pass including mobile viewports"
  status: failed
  reason: "6 of 26 tests failed — all on mobile-chrome and mobile-safari: streaming response, tool result card, HITL approval card"
  severity: major
  test: 5
  root_cause: "Three tests use .chat-desktop-thread as locator anchor. On mobile viewports (<768px), CSS rule in chat-layout.css:44-46 sets .chat-desktop-layout to display:none, hiding .chat-desktop-thread. Tests timeout waiting for toBeVisible() on elements inside hidden parent. The mobile-specific test (375px layout) passes because it correctly uses .chat-mobile-layout locators."
  artifacts:
    - path: "frontend/e2e/chat-e2e.spec.ts"
      issue: "Lines 157, 206, 263: tests scope to .chat-desktop-thread which is display:none on mobile"
    - path: "frontend/src/components/chat/chat-layout.css"
      issue: "Lines 44-46: .chat-desktop-layout { display: none } below 768px"
  missing:
    - "Add test.skip guard for mobile viewports on the 3 desktop-only tests: test.skip(vp.width < 768, 'Desktop-only test')"
