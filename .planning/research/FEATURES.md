# Features Research: v3.0 AI Intelligence & Scalability

**Domain:** Professional AI email client with auto-triage, AI chat, and follow-ups
**Researched:** 2026-02-05
**Overall confidence:** HIGH

## Executive Summary

Modern AI email clients in 2025 have converged on three core patterns: **intelligent auto-triage** (priority scoring + category assignment), **streaming AI chat interfaces** (fast, contextual, non-blocking), and **proactive follow-up reminders** (smart timing, context-aware). MailAgent already has the technical foundation (VoltAgent, embeddings, RAG) but needs UX/UI overhaul to match 2025 expectations where chat is increasingly seen as an anti-pattern and task-oriented UIs with AI-generated options are preferred.

**Key Finding:** Pure chat interfaces are losing favor. Linear's "workbench" metaphor and Superhuman's "split inbox" show that AI should augment functional UIs, not replace them with endless conversations. MailAgent's ChatCommandPalette is on the right track but needs evolution toward contextual AI suggestions embedded in the email interface.

**Competitive Gap:** Superhuman reports users process emails 150% faster with auto-triage (94% accuracy after 2 weeks). Shortwave achieves inbox zero 45% faster with smart bundles. MailAgent has the RAG intelligence but lacks the UX scaffolding to surface it effectively.

---

## Auto-Triage Features

### Table Stakes (Must Have)

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|----------------------|
| **Priority Scoring (0-100)** | Users expect AI to surface urgent emails first | Medium | Use RAG similarity + sender relationship score + recency. Machine learning on open/reply patterns. Target: 94% accuracy after 2-week learning period (Superhuman benchmark). |
| **VIP Lists** | Board members, key clients must never be buried | Low | User-defined + AI-suggested based on email frequency and response speed. Superhuman's pattern: VIP split gets checked first. |
| **Importance Indicator (High/Medium/Low)** | Visual hierarchy required for scanning | Low | Gmail's importance feature uses past actions (who you email, what you read). Badge/color coding in email list. |
| **Auto-Archive Low-Priority** | Newsletters, promotions clutter inbox | Medium | Smart bundles (Shortwave pattern): group promotions, social notifications, newsletters. Archive entire bundle with one action. |
| **Learning from User Actions** | Must adapt to individual behavior patterns | High | Track open rate, reply speed, star/archive actions by sender/keyword. Update scoring weights weekly. Store in contact embeddings. |

**Technical Requirements:**
- Existing contact embeddings (already implemented) provide foundation
- Need new `priority_score` field on Email model (0-100 int)
- New `importance_level` enum: HIGH, MEDIUM, LOW
- Background job to recalculate scores nightly (BullMQ queue)
- RAG query: "Is this email urgent based on historical context?"

**Performance Target:**
- Score calculation: <50ms per email (batch scoring during sync)
- UI rendering: Priority badge must not slow list virtualization
- Learning cycle: Weekly batch update of scoring weights

---

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI Category Assignment** | Automatic labels: "Meeting Request", "Action Required", "FYI" | High | NLP classification using Mistral. 10-15 standard categories + user-defined training. Shortwave's "smart labels" inspire this. |
| **Action Suggestions** | "Schedule meeting", "Add to CRM", "Set reminder" buttons in email preview | High | Context-aware prompts based on email content. Linear's "workbench" pattern: functional UI + AI functions, not chat. |
| **Predicted Response Templates** | Pre-drafted replies in user's tone ready to send | High | "When you check your inbox, every email needing a response will have a pre-drafted reply" (Inbox Zero pattern). Use RAG + fine-tuned LLM. |
| **Sender Relationship Context** | Show last interaction date, response rate, relationship strength in list preview | Medium | Already have CRM relationship scoring. Surface it in email list hover/preview. |
| **Bulk Triage Mode** | Review 50 emails at once with AI-suggested actions (archive, reply, snooze) | Medium | Keyboard-first: J/K navigate, A archive, R reply with template, S snooze. Superhuman's speed pattern. |

**Inspiration Sources:**
- **Superhuman Split Inbox:** Divide inbox into "VIP", "Important", "Other", "Notifications" splits
- **Shortwave Smart Bundles:** Group related emails (receipts, travel, newsletters) for batch processing
- **Inbox Zero AI Assistant:** Pre-drafted replies ready to send

**Implementation Priority:**
1. Priority scoring (enables all other features)
2. Action suggestions (high user value, moderate complexity)
3. Predicted response templates (differentiator, high complexity)
4. Bulk triage mode (power user feature)

---

### Anti-Features (Deliberately NOT Build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Automatic Sending** | Dangerous: AI could send emails without review | Always require user confirmation. Show preview with "Edit" and "Send" buttons. |
| **Automatic Archiving Without User Control** | Users panic when emails "disappear" | Show "AI suggests archiving" badge, require one-click confirmation or bulk approval. |
| **Over-Categorization (>20 Categories)** | Cognitive overload, defeats purpose of simplification | Limit to 10-15 standard categories. Allow 5 custom. Gmail nested labels already cause confusion. |
| **"Smart Reply" Generic Suggestions** | Gmail's "Thanks!" / "Sounds good!" feel robotic | Use RAG context + user's writing style. Must be >50 characters and reference email content. |
| **Silent Learning Without Transparency** | Users need to understand why AI prioritizes certain emails | Show "Why this is important" tooltip: "You always reply to Sarah within 1 hour" or "Contains deadline: Friday 3pm". |

**Design Philosophy:**
AI should be **transparent, controllable, and conservative**. Better to under-suggest than over-automate.


---

## AI Chat Interface

### Table Stakes (Expected Behavior)

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|----------------------|
| **Streaming Responses (Token-by-Token)** | Modern AI UX standard (ChatGPT, Claude) | Low | Vercel AI SDK's `useChat()` hook handles this. Replace current ChatCommandPalette polling. |
| **Context Awareness** | Chat should know current email, folder, calendar events | Medium | Already have VoltAgent context management. Ensure UnifiedRetriever queries all sources. |
| **Message History** | Persist chat across sessions | Low | Already have Prisma Conversation model. Add session restoration on page load. |
| **Typing Indicator** | Show AI is "thinking" | Low | Already have TypingIndicator.tsx component. Trigger on stream start. |
| **Error Handling (Graceful Degradation)** | Network issues, API timeouts must not crash UI | Medium | Show "AI is temporarily unavailable" with retry button. Log errors for monitoring. |
| **Mobile-Responsive Design** | Chat must work on 375px viewport | Medium | Full-screen modal on mobile, side panel on desktop (>1024px). |

**Technical Stack Recommendation:**
- **Vercel AI SDK** (`ai` package) for streaming and useChat hook
- **React Server Components** for initial message loading (Next.js App Router pattern)
- **Optimistic Updates** for instant message rendering before server confirms

**Performance Target:**
- First token: <500ms (fast start impression)
- Subsequent tokens: 20-50 tokens/second streaming
- Max response time: 30 seconds (circuit breaker at 45s)

---

### Differentiators (Modern AI Chat UX 2025)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Contextual Suggested Prompts** | Show relevant commands based on current view | Medium | In inbox: "Summarize unread" / "Find urgent". In thread: "Draft reply" / "Extract action items". Linear's pattern: AI-generated options. |
| **Command Palette Integration** | "/" commands trigger structured actions, not chat | Low | Already have ChatCommandPalette. Enhance with more commands. Avoid pure chat when structured UI is better. |
| **Rich Responses (Not Just Text)** | Show emails, calendar events, contacts as interactive cards | High | Return structured JSON from LLM: `{ type: "email_list", items: [...] }`. Render as EmailCard components, not markdown. |
| **Interruption Support** | Stop generation mid-response if user wants to refine query | Low | Vercel AI SDK supports AbortController. Add "Stop" button during streaming. |
| **Milestone Markers** | Visual indicators for progress: "Searching emails..." → "Found 12 matches" → "Summarizing..." | Medium | AI-generated progress steps. Reduces "unstructured conversation" feel. (Smashing Magazine pattern) |
| **Persistent Context Sidebar** | Keep key info visible: current date, unread count, active filters | Low | Left sidebar (desktop) or top bar (mobile) shows context. User never loses orientation. |

**Inspiration Sources:**
- **Linear "Workbench":** Functional UI with AI assistance, not pure chat
- **Claude Code (Anthropic):** Streaming with rich components (file previews, diffs)
- **Vercel v0:** Generates UI components, not just text responses

**Implementation Priority:**
1. Streaming with Vercel AI SDK (foundational upgrade)
2. Contextual suggested prompts (high user value)
3. Rich responses with structured JSON (differentiator)
4. Milestone markers (UX polish)

---

### Anti-Patterns to Avoid (Chat Interface)

| Anti-Pattern | Why It's Bad | What to Do Instead |
|--------------|--------------|-------------------|
| **Pure Chat for Everything** | Research shows users prefer visual UIs over chat for most tasks. 18/20 users chose GUI over chat for returns (Medium research). | Reserve chat for exploratory questions ("What did Sarah say about the project?"). Use structured UIs for actions (archive, schedule, label). |
| **Slow Conversational Input** | Typing prompts takes 30-60 seconds. Users get lost editing/re-typing. | Provide pre-written command templates. "/" commands insert structured prompts instantly. |
| **Silent AI Confabulation** | LLM invents facts without citing sources. Dangerous in email context. | Force source citation: "Based on email from Sarah on Jan 15..." with link to thread. IVO (Immediately Validatable Output). |
| **No Empty State Guidance** | Blank chat box forces user to invent prompts. High cognitive load. | Show 4-6 suggested actions: "Summarize today's emails", "Show follow-ups", "Find emails from John". Update suggestions based on context. |
| **Overly Anthropomorphic Design** | Chatbot avatar, "typing..." for 10 seconds feels uncanny. | Use abstract "AI Assistant" branding. Fast responses (<1s first token). Skip theatrical delays. |
| **Lost Context Between Messages** | User references "that email" but AI has no idea which one. | Track visual context: if user is viewing Thread A, chat context includes Thread A metadata automatically. |

**Critical Insight from Research:**
"Chat is a bad UI pattern for development tools" (Hacker News discussion, 2025). The shift in 2025 is toward **hybrid interfaces**: temperature controls, knobs, sliders, buttons with AI providing options, not endless text conversations.

**MailAgent Strategy:**
- Keep chat for **exploratory queries** ("Find all emails about Q1 budget")
- Use **structured UI + AI suggestions** for actions (archive, label, reply)
- Example: Email list shows AI-generated "Quick Actions" buttons per email, not "Ask AI what to do"


---

## Follow-Ups UI

### Best Practices (2025 Standards)

| Practice | Why Important | Implementation |
|----------|---------------|----------------|
| **Two Follow-Up Types: "Waiting For" and "To Do"** | Distinguish outbound (awaiting reply) vs inbound (need to reply) | Existing `followUpDate` field. Add `followUpType` enum: WAITING_FOR, TO_DO. |
| **Smart Timing Suggestions** | Users struggle to pick reminder dates | AI analyzes email urgency and suggests: 2 days, 1 week, custom. Show confidence: "Most people follow up after 3 days for this type of request". |
| **Automatic Reminder Detection** | Many emails contain explicit deadlines | NLP extraction: "Please respond by Friday 3pm" → auto-create follow-up for Thursday 2pm (1 hour buffer). |
| **Contextual Reminders** | Show original email content when reminder fires | Notification includes: email subject, sender, snippet, "View original" link. Desktop notification + in-app badge. |
| **Snooze with Recurrence** | Some follow-ups need multiple checks | "Remind me every Monday until resolved". Follow-up spawns new reminder after each check-in. |
| **Follow-Up Dashboard** | Dedicated view, not buried in inbox | Existing FollowUpTracker component. Enhance with tabs: Today, This Week, Overdue. Kanban columns for status. |

**Timing Best Practices (from Superhuman research):**
- **Single follow-up doubles response rate** (16% → 27%)
- **Sweet spot: 2-3 days** after initial send (86% of responses within 48 hours)
- **Diminishing returns after 2 follow-ups** (more increases spam complaints 3x)

**UI Pattern: Floating Action Bar**
On email hover, show quick actions: "Follow up in 2 days" / "1 week" / "Custom". One-click reminder creation.

---

### Inspiration (Good Examples)

| Product | What They Do Well | Apply to MailAgent |
|---------|-------------------|-------------------|
| **Superhuman Follow-Ups** | Keyboard shortcut (H) to set reminder from any email. Shows reminder count in inbox badge. | Add keyboard shortcut to existing FollowUpTracker. Show count in sidebar navigation. |
| **Mailsuite No Reply Alerts** | Automatic detection of sent emails with no response after N days. | Background job queries sent emails with no reply thread after 3 days. Auto-create follow-up. |
| **Boomerang for Gmail** | "Send later" + "Remind if no reply" combined feature. Clean date picker with smart presets. | Enhance existing follow-up form with "also remind me if no reply" checkbox. |
| **Linear Reminders** | Snooze tasks with natural language: "tomorrow morning", "next Friday", "in 2 weeks". | Add NLP parsing to follow-up date input: "friday 3pm" → parse to Date object. |

**Component Redesign Needed:**
Current `FollowUpTracker` component needs:
1. **Tabs for status filtering:** Today / This Week / Overdue / All
2. **Kanban view option:** To Do → In Progress → Waiting → Done
3. **Bulk actions:** "Snooze all until next week" / "Mark 5 as done"
4. **Sorting:** By date, by sender, by priority score

---

### Critical UX Patterns

**1. Notification Strategy**
- **Desktop:** Browser notification 1 hour before due (requires permission)
- **In-App:** Badge count on Follow-Ups nav item
- **Email Digest:** Daily 8am email with today's follow-ups (optional)

**2. Quick-Add from Email List**
- Hover email → show "⏰ Follow up" button in action bar
- Click → mini-popover with date presets: Tomorrow / 2 days / 1 week / Custom
- One-click creation (no full modal for simple cases)

**3. Follow-Up Resolution**
- When user replies to email with active follow-up → auto-mark as "Waiting for reply"
- When reply received → auto-mark follow-up as "Done"
- Smart: "Looks like you got a reply from Sarah. Mark this follow-up as resolved?"

---

## Nested Labels/Folders

### Expected Behavior (Gmail Pattern)

| Feature | User Expectation | Implementation |
|---------|------------------|----------------|
| **Drag-Drop to Nest** | Drag "ClientA" label onto "Projects" label to create "Projects/ClientA" hierarchy | Tree view component with react-dnd or @dnd-kit. Update `parent_id` on Label model. |
| **Expand/Collapse Tree** | Click arrow to show/hide child labels | Local state for expanded nodes. Persist to localStorage for session memory. |
| **Multi-Level Nesting** | Support Projects → ClientA → Q1_Budget (3 levels) | Backend: existing folder nesting endpoint (v2.1 API-01 shipped). Frontend: recursive tree rendering. |
| **Indent Visual Hierarchy** | Child labels indented 16px per level | CSS: `paddingLeft: ${depth * 16}px`. Limit depth to 5 levels (avoid deep hierarchies). |
| **Search Within Label** | "Search in Projects/ClientA" filters to just that label and children | API: `GET /emails?labelId=X&includeChildren=true`. Backend recursively fetches descendant label IDs. |

**Known Limitation (Gmail Behavior):**
Gmail nested labels are visually grouped but **NOT searched hierarchically**. Searching "Projects" only finds emails labeled "Projects", not "Projects/ClientA". Users expect folder-like behavior but get flat label search.

**MailAgent Improvement:**
When user searches within a parent label, **automatically include child labels** in query. This is what users actually want (folder semantics).

---

### Tree View Component Requirements

**Recommended Libraries (2025):**
- **MUI X Rich Tree View** (already using MUI): Built-in drag-drop, keyboard nav, virtualization
- **Reka UI Tree** (if switching to shadcn/ui): Accessible, headless, supports pragmatic-drag-and-drop
- **react-dnd-treeview** (standalone): Lightweight, proven for file/folder UIs

**Keyboard Navigation (Accessibility):**
- **Arrow keys:** Navigate tree (up/down/left/right)
- **Enter:** Select label (filter emails)
- **Space:** Expand/collapse node
- **Home/End:** Jump to first/last label

---

### Drag-Drop UX Details

**Visual Feedback:**
- **Dragging:** Semi-transparent ghost of label follows cursor
- **Valid drop target:** Highlight with blue border, show indent level
- **Invalid drop target:** Red border (e.g., can't nest label under itself, circular reference)
- **Drop animation:** Smooth 200ms transition to new position in tree

**Validation Rules:**
1. **No circular references:** Can't nest "Projects" under "Projects/ClientA"
2. **Max depth limit:** 5 levels (prevent overly complex hierarchies)
3. **System labels protected:** Can't nest/move Inbox, Sent, Trash (backend enforces)

**Backend Protection (already implemented in v2.1):**
API-01 shipped with circular reference detection (12 unit tests). Frontend must call `PUT /labels/:id/parent` with validation.

