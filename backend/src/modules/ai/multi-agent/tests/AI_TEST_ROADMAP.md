# AI Suite Test Roadmap

## Overview
This document outlines the comprehensive testing strategy for the AI Multi-Agent system in MailAgent.

---

## 1. Unit Tests (Existing)

### Agent Tests
- [x] `base.agent.spec.ts` - Base agent functionality
- [x] `knowledge.agent.spec.ts` - Knowledge agent tests

### Service Tests
- [x] `multi-agent.service.spec.ts` - Core multi-agent orchestration
- [x] `hitl.service.spec.ts` - Human-in-the-loop service
- [x] `agent.service.spec.ts` - AI agent service
- [x] `chat-session.service.spec.ts` - Chat session management
- [x] `email-insights.service.spec.ts` - Email insights
- [x] `mistral.service.spec.ts` - Mistral AI integration
- [x] `personalization.service.spec.ts` - Personalization features
- [x] `knowledge-base-bulk.spec.ts` - Bulk knowledge operations

### Controller Tests
- [x] `multi-agent.controller.spec.ts` - API endpoints
- [x] `multi-agent.controller.stats.spec.ts` - Statistics endpoints

---

## 2. Integration Tests (Existing)

- [x] `multi-agent.integration.spec.ts` - Full integration tests
- [x] `language-ab-testing.spec.ts` - Language/locale testing

---

## 3. Manual Testing Checklist

### 3.1 Authentication & Session Management
| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| Session creation | Send message without sessionId | Backend creates new session, returns sessionId | ⬜ |
| Session persistence | Send multiple messages | All messages use same sessionId | ⬜ |
| Invalid session | Send with fake sessionId | Returns 403 Forbidden | ⬜ |
| Session isolation | Different users access sessions | Each user only sees their sessions | ⬜ |

### 3.2 Multi-Agent Routing
| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| Email intent | "Summarize my emails" | Routes to EmailAgent | ⬜ |
| Calendar intent | "Schedule a meeting" | Routes to CalendarAgent | ⬜ |
| Contacts intent | "Find John's contact" | Routes to ContactsAgent | ⬜ |
| Knowledge intent | "Search for invoice" | Routes to KnowledgeAgent | ⬜ |
| General intent | "Hello, how are you?" | Routes to GeneralAgent | ⬜ |
| Ambiguous intent | Complex multi-domain query | Correct agent selection | ⬜ |

### 3.3 Human-in-the-Loop (HITL)
| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| Pending action created | Request action below threshold | Action added to pending list | ⬜ |
| Auto-approve | Request action above threshold | Action auto-approved/executed | ⬜ |
| Approve action | Click approve on pending action | Action executes successfully | ⬜ |
| Reject action | Click reject on pending action | Action rejected with reason | ⬜ |
| Expired action | Wait for action to expire | Action marked as expired | ⬜ |
| Real-time updates | Approve action from another tab | UI updates via WebSocket | ⬜ |

### 3.4 Learning & Feedback
| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| Approval learning | Approve multiple similar actions | Confidence boost increases | ⬜ |
| Rejection learning | Reject multiple similar actions | Confidence boost decreases | ⬜ |
| Learning profiles | View learning stats | Shows per-agent statistics | ⬜ |
| Reset learning | Reset learning for agent | Clears confidence adjustments | ⬜ |

### 3.5 Localization (i18n)
| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| English locale | Set locale to 'en' | All UI in English | ⬜ |
| Italian locale | Set locale to 'it' | All UI in Italian | ⬜ |
| AI responses locale | Send message in Italian | AI responds in Italian | ⬜ |
| Quick actions locale | Switch locale | Quick actions translated | ⬜ |
| Example queries locale | Switch locale | Examples translated | ⬜ |

### 3.6 Error Handling
| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| Rate limiting | Send 60+ requests/min | Returns 429 with message | ⬜ |
| Invalid request | Send malformed payload | Returns 400 with details | ⬜ |
| Server error | Trigger backend error | Graceful error message | ⬜ |
| Network failure | Disconnect network | Handles offline gracefully | ⬜ |

### 3.7 UI Components
| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| Empty state | No messages | Shows example queries | ⬜ |
| Loading state | Send message | Shows thinking indicator | ⬜ |
| Message rendering | Receive markdown | Renders formatted content | ⬜ |
| Pending actions panel | Have pending actions | Shows list with approve/reject | ⬜ |
| Learning progress card | Have learning data | Shows progress bars | ⬜ |
| Agent activity chart | Have activity data | Shows bar chart | ⬜ |
| Collapsible panels | Click headers | Expands/collapses smoothly | ⬜ |
| Mobile responsive | Resize to mobile | UI adapts correctly | ⬜ |

---

## 4. E2E Test Scenarios (To Implement)

### 4.1 Full User Flow Tests
```
Scenario: New user sends first AI request
  Given user is logged in
  And AI page is loaded
  When user types "Summarize my emails"
  And clicks send
  Then thinking indicator appears
  And response contains email summary
  And sessionId is stored for subsequent requests
```

```
Scenario: User approves pending action
  Given user has pending email draft action
  When user clicks approve
  Then action is executed
  And notification shows success
  And pending list updates
```

### 4.2 Multi-Tenant Isolation
```
Scenario: Tenant data isolation
  Given two users from different tenants
  When each sends AI requests
  Then each only sees their own data
  And learning profiles are isolated
```

---

## 5. Performance Tests (To Implement)

| Metric | Target | Test Method |
|--------|--------|-------------|
| Response time | < 3s p95 | Load test with k6 |
| Concurrent users | 100+ | Stress test |
| Memory usage | < 512MB | Monitor during load |
| Queue processing | < 5s | Bull queue metrics |

---

## 6. Test Execution Commands

### Backend Tests
```bash
# Run all AI tests
npm run test -- --testPathPattern="ai"

# Run multi-agent tests only
npx jest src/modules/ai/multi-agent --passWithNoTests

# Run specific test file
npx jest src/modules/ai/multi-agent/tests/multi-agent.integration.spec.ts

# Run with coverage
npm run test:cov -- --testPathPattern="multi-agent"

# Run in watch mode
npm run test:watch -- --testPathPattern="multi-agent"
```

### Frontend Tests
```bash
cd frontend

# Run all frontend tests
npm test

# Run AI component tests only
npm test -- __tests__/components/ai

# Run API tests
npm test -- __tests__/lib/api

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

---

## 7. Test Coverage Goals

| Module | Current | Target |
|--------|---------|--------|
| multi-agent.service | ~85% | 90% |
| hitl.service | ~80% | 85% |
| Agents (all) | ~75% | 80% |
| Controllers | ~70% | 80% |

---

## 8. Known Issues & Edge Cases

1. **Session ID**: Frontend must not generate fake sessionIds - let backend create them
2. **Array handling**: All array props must have defensive checks (Array.isArray)
3. **Locale fallback**: Always provide fallback strings for translations
4. **Rate limiting**: Different endpoints have different limits (60 vs 120 vs 300 rpm)

---

## 9. Test Priority Matrix

| Priority | Category | Tests |
|----------|----------|-------|
| P0 - Critical | Auth/Session | Session validation, tenant isolation |
| P0 - Critical | HITL | Action approval/rejection |
| P1 - High | Routing | Intent classification, agent routing |
| P1 - High | Localization | All UI strings translated |
| P2 - Medium | Learning | Confidence adjustments |
| P2 - Medium | UI | Component rendering |
| P3 - Low | Performance | Load/stress tests |

---

## 10. Next Steps

1. [ ] Run existing unit tests and fix any failures
2. [ ] Complete manual testing checklist
3. [ ] Implement E2E tests with Cypress/Playwright
4. [ ] Set up performance testing with k6
5. [ ] Configure CI/CD test pipeline
6. [ ] Add test coverage reporting
