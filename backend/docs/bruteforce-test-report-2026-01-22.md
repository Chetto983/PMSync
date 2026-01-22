# Bruteforce Test Report - 2026-01-22

## Test Summary

| Metric | Value |
|--------|-------|
| **Passed** | 38 |
| **Failed** | 7 |
| **Skipped** | 3 |
| **Pass Rate** | 79.2% |

---

## Failed Tests

| Test | Reason |
|------|--------|
| Supervisor multi-intent | Expected HITL pending action but none returned |
| Bulk email actions | Expected HITL pending action but none returned |
| Reply email (HITL) | Expected HITL pending action but none returned |
| Update contact (HITL) | Expected HITL pending action but none returned |
| Delete contact (HITL) | Empty response |
| Update event (HITL) | Expected HITL pending action but none returned |
| Delete event (HITL) | Expected HITL pending action but none returned |

### Root Cause Analysis

All 7 failed tests are **HITL (Human-In-The-Loop) related**. The LLM is not triggering the approval workflow for sensitive actions. Instead of returning a `pendingAction`, the agent:
1. Either responds with "I don't have that capability"
2. Or generates a text response without calling the appropriate tool

---

## Database Analysis

### Conversation Messages
- **Total messages analyzed**: 289
- **Tool calls found**: 54
- **Tool errors**: 0

### Tool Usage Distribution

| Tool | Calls |
|------|-------|
| list_emails | 20 |
| search_emails | 8 |
| delegate_task | 7 |
| manage_email | 5 |
| get_events | 3 |
| count_emails | 3 |
| search_contacts | 2 |
| list_folders | 2 |
| bulk_email_actions | 2 |
| manage_contact | 1 |
| semantic_search_emails | 1 |

---

## HITL Actions Analysis (Last 15 min)

### By Status

| Status | Count |
|--------|-------|
| PENDING_APPROVAL | 2 |
| REJECTED | 9 |

### By Type

| Action Type | Count |
|-------------|-------|
| CREATE_TASK | 6 |
| SCHEDULE_MEETING | 1 |
| CREATE_CONTACT | 1 |
| ARCHIVE_EMAIL | 1 |
| FORWARD_EMAIL | 1 |
| SEND_EMAIL | 1 |

**Note**: 9 of 11 actions were REJECTED - this is expected behavior from the test script auto-rejecting pending actions.

---

## Duplicate Messages (LLM Repetition)

Found **62 duplicate message patterns**:

| Pattern | Count |
|---------|-------|
| "I'm sorry, but I currently don't have the capability to access or modify your em..." | 8 |
| "I'm sorry, but I'm unable to assist with that specific request..." | 6 |
| "Email request created. Approve in Pending Actions." | 6 |
| "I'm sorry, but I currently don't have the capability to access or analyze your e..." | 4 |
| "I'm sorry, but I'm unable to assist with that request..." | 4 |
| "Davide Marchetto is available from 3:00 PM to 4:00 PM..." | 3 |

### Issue
The high number of "I don't have capability" responses indicates the LLM is:
1. Not recognizing available tools
2. Not understanding when to use HITL workflow
3. Generating canned refusal responses instead of taking action

---

## LLM Misunderstandings/Errors

**Total problematic responses**: 71

### Categories

1. **Capability denial** (most common):
   - "I don't have the capability to browse the web"
   - "I don't have access to your documents"
   - "I cannot delete events or manage your calendar"

2. **Tool awareness gap**:
   - Agent says it can't do X, but tool X exists
   - Example: "I can't search documents" when `semantic_search_emails` is available

3. **HITL bypass**:
   - Destructive actions (delete, update) should trigger HITL but LLM responds with refusal

---

## Critical Issues

### 1. HITL Workflow Not Triggering (HIGH)
**Impact**: 7/7 failed tests
**Symptoms**:
- Update/delete operations on contacts, events, emails don't create pending actions
- LLM responds with "I can't do that" instead of routing to HITL

**Fix Required**:
- Review `actions.agent.ts` tool definitions
- Ensure `manage_contact`, `manage_event`, `reply_email` tools are properly registered
- Check supervisor delegation logic for HITL-requiring actions

### 2. Excessive "I Can't" Responses (MEDIUM)
**Impact**: Poor user experience, wasted queries
**Symptoms**: 71 responses contain refusal/error language

**Fix Required**:
- Review system prompt for capability awareness
- Ensure tools are properly described in agent configuration

### 3. Conversation Compaction Error (LOW)
**Impact**: Memory management degraded
**Symptoms**: `userPrompt exceeds maximum length of 10000 characters`

**Fix Required**:
- Truncate long messages before compaction
- Increase limit or summarize incrementally

---

## Recommendations

1. **Immediate**: Fix HITL tool registration in `actions.agent.ts`:
   - Verify `update_contact`, `delete_contact`, `update_event`, `delete_event` tools exist
   - Verify they properly route to `HITLService.createPendingAction()`

2. **Short-term**: Improve LLM tool awareness:
   - Review system prompts for all agents
   - Add explicit capability statements
   - Test tool-use prompting

3. **Medium-term**: Add integration tests for HITL flow:
   - Unit test: tool → HITL service → pending action
   - E2E test: user message → agent → pending action returned

---

## Test Environment

- **Tenant**: cmjgylxkg000054yhnjpkmzd9
- **User**: dvdmarchetto@gmail.com
- **Conversation ID**: bruteforce-1769101249104
- **Date**: 2026-01-22 18:00-18:04 CET
