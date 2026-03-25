---
phase: 108-hitl-approval-routing
verified: 2026-03-24T16:20:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 108: HITL Approval Routing — Verification Report

**Phase Goal:** HITL approval routing — per-user sensitivity control, dynamic needsApproval on all tool services, audit logging, frontend toggle and approval card terminal states
**Verified:** 2026-03-24T16:20:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | User with HIGH_ONLY sensitivity is prompted for approval on send_email but not archive_email | VERIFIED | email-tools: `needsApproval: () => sensitivity !== 'NONE'` on send_email (HIGH); `needsApproval: () => sensitivity === 'ALL_MUTATIONS'` on archive_email (MEDIUM) |
| 2  | User with ALL_MUTATIONS sensitivity is prompted for approval on both send_email and archive_email | VERIFIED | Same closures — HIGH evaluates `true` when sensitivity is ALL_MUTATIONS; MEDIUM evaluates `true` when sensitivity is ALL_MUTATIONS |
| 3  | User with NONE sensitivity is never prompted for approval on any tool | VERIFIED | HIGH closure: `sensitivity !== 'NONE'` returns false; MEDIUM closure: `sensitivity === 'ALL_MUTATIONS'` returns false. 6 sensitivity unit tests GREEN |
| 4  | Approval and rejection events are logged in audit_logs table | VERIFIED | `AuditService.logHitlDecision` writes `HITL:APPROVED` / `HITL:REJECTED` to audit_logs; wired in `onStepFinish` at ai-chat.service.ts line 436; 9 Jest tests GREEN |
| 5  | User preferences default to HIGH_ONLY when no explicit setting exists | VERIFIED | schema.prisma line 138: `hitlSensitivity String? @default("HIGH_ONLY")`; ai-chat.service.ts: `userPrefs?.hitlSensitivity ?? 'HIGH_ONLY'`; useSettingsState.ts: `useState<string>('HIGH_ONLY')` |
| 6  | After user clicks approve, the card shows an APPROVED chip with success styling instead of disappearing | VERIFIED | HitlApprovalCard.tsx: `getDisplayState()` returns 'approved' when `result.approved === true`; renders CheckCircle + `t.chat.hitl.approvedChip` chip with success.main border |
| 7  | After user clicks deny, the card shows a DENIED chip with error styling instead of disappearing | VERIFIED | HitlApprovalCard.tsx: `getDisplayState()` returns 'rejected' when `result.approved === false`; renders XCircle + `t.chat.hitl.deniedChip` chip with error.main border |
| 8  | Destructive tool calls in complete state have warning/colored styling distinct from informational tools | VERIFIED | FallbackToolUI.tsx line 39: `if (status.type === 'complete' && HIGH_RISK_TOOLS.has(toolName))` routes to HitlApprovalWrapper; non-destructive tools use neutral Paper |
| 9  | Translation keys exist in both EN and IT for all new HITL copy | VERIFIED | en.ts lines 3974–3992: approvedChip, deniedChip, sensitivityLabel, noneDialogTitle (18 keys); it.ts matching keys at lines 3951+; index.ts types at line 3803+ |
| 10 | User sees a 3-option toggle (High risk only / All mutations / None) in AI settings | VERIFIED | AiSettings.tsx lines 318–320: ToggleButton values HIGH_ONLY, ALL_MUTATIONS, NONE with t.chat.hitl.* labels |
| 11 | Selecting NONE opens a confirmation dialog before persisting | VERIFIED | AiSettings.tsx line 133: `noneDialogOpen` state; onChange checks `v === 'NONE'` and calls `setNoneDialogOpen(true)` instead of calling setHitlSensitivity; Dialog JSX at line 362 |
| 12 | The setting persists via PATCH /users/me/preferences with hitlSensitivity field | VERIFIED | useSettingsHandlers.ts line 158: `hitlSensitivity` in save payload; users.service.ts: `update: data` (DTO spread); DTO line 206: `hitlSensitivity?: string` |
| 13 | The old autoApproveThreshold slider is replaced by the HITL sensitivity toggle | VERIFIED | No `autoApproveThreshold` found in AiSettings.tsx, useSettingsState.ts, useSettingsHandlers.ts, or useSettingsCopy.ts |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` | hitlSensitivity column on UserPreferences | VERIFIED | Line 138: `hitlSensitivity String? @default("HIGH_ONLY")` |
| `backend/src/common/services/audit.service.ts` | logHitlDecision method | VERIFIED | Lines 34 (interface) and 143 (method); fire-and-forget pattern |
| `backend/src/modules/ai-chat/services/ai-chat.service.ts` | Dynamic needsApproval via user preference closure | VERIFIED | Lines 174–178: loads userPrefs; line 436: calls logHitlDecision in onStepFinish |
| `backend/src/modules/ai-chat/tools/email-tools.service.ts` | 4 HIGH + 3 MEDIUM dynamic needsApproval | VERIFIED | 7 occurrences: 4x `!== 'NONE'`, 3x `=== 'ALL_MUTATIONS'`; no `needsApproval: true` remaining |
| `backend/src/modules/ai-chat/tools/calendar-tools.service.ts` | 1 HIGH + 2 MEDIUM dynamic needsApproval | VERIFIED | 3 occurrences: 1x `!== 'NONE'`, 2x `=== 'ALL_MUTATIONS'` |
| `backend/src/modules/ai-chat/tools/contact-tools.service.ts` | 1 HIGH + 2 MEDIUM dynamic needsApproval | VERIFIED | 3 occurrences: 1x `!== 'NONE'`, 2x `=== 'ALL_MUTATIONS'` |
| `backend/src/modules/users/dtos/update-preferences.dto.ts` | hitlSensitivity field | VERIFIED | Line 206: `hitlSensitivity?: string` |
| `backend/src/modules/ai-chat/__tests__/hitl-sensitivity.test.ts` | 6 unit tests for closure logic | VERIFIED | 6/6 tests GREEN under Vitest |
| `backend/src/modules/audit/__tests__/audit.service.spec.ts` | 3 HITL-04 tests (approved, rejected, swallows errors) | VERIFIED | 9/9 Jest tests GREEN (3 HITL + 6 existing) |
| `backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts` | 15 contract tests including Phase 108 function variant | VERIFIED | 15/15 tests GREEN |
| `frontend/src/components/chat/HitlApprovalCard.tsx` | Terminal state rendering + HIGH_RISK_TOOLS export | VERIFIED | getDisplayState(), HIGH_RISK_TOOLS set, CheckCircle/XCircle icons, approvedChip/deniedChip |
| `frontend/src/components/chat/tool-uis/FallbackToolUI.tsx` | Destructive tool routing | VERIFIED | Line 8: imports HIGH_RISK_TOOLS; line 39: routes completed destructive tools |
| `frontend/locales/en.ts` | 18 HITL translation keys | VERIFIED | approvedChip, deniedChip, sensitivityLabel, noneDialogTitle confirmed present |
| `frontend/locales/it.ts` | 18 Italian HITL translation keys | VERIFIED | approvedChip, deniedChip confirmed present |
| `frontend/locales/index.ts` | TypeScript types for HITL keys | VERIFIED | approvedChip, sensitivityLabel types confirmed |
| `frontend/components/settings/AiSettings.tsx` | HITL toggle + NONE dialog + no slider | VERIFIED | ToggleButtonGroup, noneDialogOpen state, Dialog JSX; no Slider, no autoApproveThreshold |
| `frontend/components/dashboard/settings/useSettingsState.ts` | hitlSensitivity state replacing autoApproveThreshold | VERIFIED | useState<string>('HIGH_ONLY'); no autoApproveThreshold |
| `frontend/components/dashboard/settings/useSettingsHandlers.ts` | hitlSensitivity in save payload | VERIFIED | Line 158: hitlSensitivity in payload; no aiAutoApproveThreshold |
| `frontend/lib/api/users.ts` | hitlSensitivity on UserPreferences and UpdatePreferencesData | VERIFIED | Lines 20 and 60: `hitlSensitivity?: string` on both interfaces |
| `frontend/components/dashboard/Settings.tsx` | hitlSensitivity props passed to AiSettings | VERIFIED | Line 236: `hitlSensitivity={s.hitlSensitivity} setHitlSensitivity={s.setHitlSensitivity}` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ai-chat.service.ts | prisma.userPreferences | `userPreferences.findUnique` in prepareChatAgent | WIRED | Lines 174–178: loads hitlSensitivity before createToolSet |
| ai-chat.service.ts | audit.service.ts | `logHitlDecision` call in onStepFinish | WIRED | Line 436: fires for tool results containing `approved` field |
| FallbackToolUI.tsx | HitlApprovalCard.tsx | `import { HIGH_RISK_TOOLS, HitlApprovalWrapper }` | WIRED | Line 8 import; line 39 usage |
| AiSettings.tsx | useSettingsState.ts | `hitlSensitivity` prop through Settings.tsx | WIRED | Settings.tsx line 236 passes both state and setter |
| useSettingsHandlers.ts | PATCH /users/me/preferences | `hitlSensitivity` in updatePreferences mutation | WIRED | Line 158; users.service `update: data` spread passes field through to Prisma |
| useSettingsState.ts | frontend/lib/api/users.ts | `UserPreferences.hitlSensitivity` type | WIRED | users.ts line 20; state reads `userPrefsData.hitlSensitivity` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HITL-01 | 108-02 | Frontend renders approve/reject buttons when tool call is in approval-requested state | SATISFIED | HitlApprovalCard pending state renders approve/reject buttons; terminal states verified; human-approved in Task 3 checkpoint |
| HITL-02 | 108-02 | Destructive tool calls are visually distinct (warning styling) from informational tool calls | SATISFIED | FallbackToolUI routes HIGH_RISK completed tools to colored terminal cards; HIGH_RISK_TOOLS set drives the distinction |
| HITL-03 | 108-01, 108-03 | User can configure HITL sensitivity: HIGH_ONLY / ALL_MUTATIONS / NONE in AI settings | SATISFIED | Backend dynamic closures (108-01) + frontend toggle (108-03); setting persists to DB via PATCH |
| HITL-04 | 108-01 | Approval and rejection events are logged via AuditService for GDPR accountability | SATISFIED | logHitlDecision creates HITL:APPROVED / HITL:REJECTED records; onStepFinish wired; 9 Jest tests GREEN |

No orphaned requirements — all 4 HITL IDs claimed and verified.

---

### Anti-Patterns Found

None. Scanned HitlApprovalCard.tsx, FallbackToolUI.tsx, AiSettings.tsx, ai-chat.service.ts, email-tools.service.ts, audit.service.ts for TODO/FIXME/placeholder/stub patterns. One `placeholder=` attribute in AiSettings.tsx is a legitimate HTML input placeholder on a TextField, not a stub.

---

### Human Verification Required

Plan 03 Task 3 was a `checkpoint:human-verify gate="blocking"` task. The SUMMARY documents user approval on 2026-03-24 with the following confirmations:

1. Old slider removed
2. 3-option HITL toggle working (Solo alto rischio / Tutte le mutazioni / Nessuna)
3. Confirmation dialog appears for NONE with correct Italian text
4. Warning alert shows after confirming NONE
5. Settings save and persist after page reload
6. AI Chat page loads correctly

The audit_logs DB query (step 11 of the human verification checklist) was not explicitly confirmed in the SUMMARY. This is the one item that cannot be fully verified programmatically without a live DB connection.

**Remaining human check (informational, not blocking):**

**Test:** Run `SELECT action, entity, changes FROM audit_logs WHERE action LIKE 'HITL:%' ORDER BY created_at DESC LIMIT 5;`
**Expected:** Rows with `action = HITL:APPROVED` or `HITL:REJECTED`, `entity = AiChat`, changes containing toolName and conversationId
**Why human:** No live DB access from this verifier. The code path is verified (logHitlDecision is wired, tests pass) — this is a runtime data check only.

---

### Test Suite Summary

| Suite | Runner | Tests | Result |
|-------|--------|-------|--------|
| hitl-sensitivity.test.ts | Vitest | 6 | GREEN |
| hitl-contract.test.ts | Vitest | 15 | GREEN |
| audit.service.spec.ts | Jest | 9 (3 HITL + 6 existing) | GREEN |

Backend type-check: `npx tsc --noEmit` — 0 errors
Frontend type-check: `npx tsc --noEmit` — 0 errors

---

_Verified: 2026-03-24T16:20:00Z_
_Verifier: Claude (gsd-verifier)_
