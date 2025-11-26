# PMSync AI Integration Roadmap

## Current State Assessment

### Backend AI (✅ Complete & Production-Ready)
| Component | Status | Description |
|-----------|--------|-------------|
| RouterAgent | ✅ | Intent classification with fast-path optimization |
| EmailAgent | ✅ | 13 email actions (send, reply, forward, archive, delete, etc.) |
| CalendarAgent | ✅ | 6 calendar actions (create, update, delete, check availability) |
| ContactsAgent | ✅ | 7 contact actions (CRUD, merge, enrich) |
| GeneralAgent | ✅ | Chat + web search via Mistral |
| KnowledgeAgent | ✅ | RAG/vector search integration |
| HitlService | ✅ | Human-in-the-loop approval workflow |
| FeedbackService | ✅ | Learning loop with confidence adjustment |
| ActionExecutorService | ✅ | Bridges AI to Email/Calendar/Contact services |
| MemoryService | ✅ | Session-based conversation memory |
| Real-time Events | ✅ | WebSocket notifications for action status |

### Frontend AI Components (🔧 Built but NOT Integrated)

| Component | Location | Integration Point | Status |
|-----------|----------|-------------------|--------|
| EmailSummaryPanel | `components/email/ai/` | ThreadDisplay.tsx | ❌ Not connected |
| SmartReplySuggestions | `components/email/ai/` | ComposeDialog.tsx | ❌ Not connected |
| AiStatsCard | `components/dashboard/ai/` | AI Dashboard page | ❌ Not connected |
| LearningProgressCard | `components/dashboard/ai/` | AI Dashboard page | ❌ Not connected |
| AgentActivityChart | `components/dashboard/ai/` | AI Dashboard page | ❌ Not connected |
| PendingActionsPanel | `components/dashboard/ai/` | AI Dashboard page | ❌ Not connected |
| SchedulingDrawer | `components/calendar/ai/` | Calendar page | ⚠️ Partial |

### AI Dashboard Page (`pages/dashboard/ai.tsx`)
- ✅ Chat interface working
- ✅ Message processing via multi-agent API
- ✅ Pending actions sidebar (built-in, not using new component)
- ✅ Action history tracking
- ✅ WebSocket real-time updates
- ❌ Not using new dashboard components (stats, learning, activity chart)

---

## Phase 1: Component Integration (Priority: HIGH)
**Timeline: 1-2 days**

### 1.1 Integrate EmailSummaryPanel into ThreadDisplay
```
File: components/email/ThreadDisplay.tsx
Action: Add EmailSummaryPanel component after email header
Trigger: Button or auto-expand for long emails
```

### 1.2 Integrate SmartReplySuggestions into ComposeDialog
```
File: components/email/ComposeDialog/ComposeDialog.tsx
Action: Add SmartReplySuggestions when mode === 'reply'
Trigger: Show after dialog opens with reply context
```

### 1.3 Upgrade AI Dashboard with New Components
```
File: pages/dashboard/ai.tsx
Action: Replace inline pending actions with PendingActionsPanel
Action: Add AiStatsCard row for key metrics
Action: Add LearningProgressCard for learning visualization
Action: Add AgentActivityChart for activity breakdown
```

---

## Phase 2: Missing Features (Priority: MEDIUM)
**Timeline: 3-5 days**

### 2.1 Email Categorization UI
- Component exists in backend (CATEGORIZE_EMAIL action)
- Need UI for label suggestions based on AI analysis
- Integration point: Email list view or thread display

### 2.2 Calendar AI Integration
- SchedulingDrawer needs full integration
- Natural language event creation
- Availability checking UI

### 2.3 Contact Enrichment UI
- Backend supports ENRICH_CONTACT action
- Need UI to trigger and display enrichment results
- Integration point: Contact detail view

### 2.4 Knowledge Base Management
- Backend has KnowledgeAgent
- Need UI for:
  - Viewing knowledge base items
  - Adding notes/documents to knowledge
  - Searching knowledge with results display

---

## Phase 3: Enhanced Features (Priority: MEDIUM)
**Timeline: 1-2 weeks**

### 3.1 Conversation Persistence
- Save chat sessions to database
- Load previous conversations
- Session history browser

### 3.2 Custom Prompt Templates
- User-defined quick actions
- Save favorite prompts
- Template management UI

### 3.3 Analytics Dashboard
- Detailed AI usage metrics
- Cost tracking (API calls)
- Performance monitoring
- User adoption analytics

### 3.4 Voice Integration (Inspired by Zero-main)
- Speech-to-text input
- Voice commands for quick actions
- Accessibility improvements

---

## Phase 4: Advanced Features (Priority: LOW)
**Timeline: 2-4 weeks**

### 4.1 Writing Style Analysis (From Zero-main)
- Analyze user's email writing patterns
- 52 style metrics tracking
- Personalized email composition

### 4.2 Multi-turn Action Planning
- Complex task decomposition
- Action sequences with dependencies
- Progress tracking for multi-step tasks

### 4.3 Proactive Suggestions
- AI suggests actions based on inbox patterns
- Meeting scheduling recommendations
- Follow-up reminders

### 4.4 Team Collaboration
- Shared AI sessions
- Delegated action approval
- Team-wide learning insights

---

## Technical Debt & Improvements

### Backend
| Item | Priority | Description |
|------|----------|-------------|
| Memory summarization | Medium | Implement actual summarization (currently just FIFO) |
| KnowledgeAgent i18n | Low | Remove hardcoded Italian messages |
| Action rollback | Low | Implement undo capability for executed actions |
| Batch processing | Low | Process multiple actions in single request |

### Frontend
| Item | Priority | Description |
|------|----------|-------------|
| Component integration | HIGH | Connect all AI components to pages |
| Error boundaries | Medium | Add React error boundaries for AI components |
| Offline support | Low | Queue actions when offline |
| Performance | Medium | Virtual scrolling for long message lists |

---

## Integration Checklist

### EmailSummaryPanel Integration
- [ ] Import component in ThreadDisplay.tsx
- [ ] Add AI summary toggle button to email header
- [ ] Pass email ID and content to component
- [ ] Handle loading/error states
- [ ] Test with various email types

### SmartReplySuggestions Integration
- [ ] Import component in ComposeDialog.tsx
- [ ] Show only when mode === 'reply'
- [ ] Pass original email context
- [ ] Handle suggestion selection
- [ ] Integrate with editor content

### AI Dashboard Upgrade
- [ ] Import new dashboard components
- [ ] Add stats row with AiStatsCard components
- [ ] Replace inline pending actions with PendingActionsPanel
- [ ] Add LearningProgressCard section
- [ ] Add AgentActivityChart section
- [ ] Connect refresh handlers
- [ ] Test responsive layout

---

## API Endpoints Status

### Multi-Agent API (All Working)
| Endpoint | Method | Status |
|----------|--------|--------|
| `/ai/multi-agent/process` | POST | ✅ |
| `/ai/multi-agent/agents` | GET | ✅ |
| `/ai/multi-agent/pending-actions` | GET | ✅ |
| `/ai/multi-agent/pending-actions/:id/approve` | POST | ✅ |
| `/ai/multi-agent/pending-actions/:id/reject` | POST | ✅ |
| `/ai/multi-agent/stats/action-counts` | GET | ✅ |
| `/ai/multi-agent/stats/learning` | GET | ✅ |
| `/ai/multi-agent/stats/aggregate` | GET | ✅ |
| `/ai/multi-agent/feedback` | GET | ✅ |
| `/ai/multi-agent/learning/reset` | POST | ✅ |

### Legacy AI API (Working but Superseded)
| Endpoint | Method | Status |
|----------|--------|--------|
| `/ai/chat/sessions` | POST | ✅ Legacy |
| `/ai/summarize/:emailId` | POST | ✅ Legacy |
| `/ai/smart-reply/:emailId` | POST | ✅ Legacy |
| `/ai/categorize/:emailId` | POST | ✅ Legacy |

---

## Inspired by Zero-main

### Applicable Patterns
1. **Vercel AI SDK** - Multi-model abstraction (consider for future)
2. **Tool-based architecture** - Already implemented similarly
3. **52 writing metrics** - For personalized email composition
4. **Durable Objects** - Per-user agent instances (for scale)
5. **Effect.js** - Structured error handling (consider adopting)

### Not Applicable (Different Stack)
- Cloudflare Workers (we use NestJS)
- Hono framework (we use Express/NestJS)
- MCP server (different integration approach)

---

## Success Metrics

### Phase 1 Success
- [ ] All AI components visible and functional
- [ ] Email summary working in thread view
- [ ] Smart replies working in compose
- [ ] Dashboard showing real AI metrics

### Phase 2 Success
- [ ] Calendar AI scheduling working
- [ ] Contact enrichment functional
- [ ] Knowledge base searchable via UI

### Phase 3 Success
- [ ] Conversation history persisted
- [ ] Custom prompts saveable
- [ ] Analytics dashboard live

### Phase 4 Success
- [ ] Writing style adaptation working
- [ ] Multi-turn planning functional
- [ ] Proactive suggestions active

---

## Next Immediate Actions

1. **TODAY**: Integrate EmailSummaryPanel into ThreadDisplay
2. **TODAY**: Integrate SmartReplySuggestions into ComposeDialog
3. **TODAY**: Update AI dashboard with new components
4. **THIS WEEK**: Full testing of all integrations
5. **THIS WEEK**: Documentation update

---

*Last Updated: 2025-11-26*
*Document Owner: PMSync AI Team*
