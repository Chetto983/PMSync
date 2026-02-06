# AI Tool Capability Inventory

**Date:** 2026-02-06
**Total Tools:** 22 (registered tool functions)
**Duplicates Found:** 0 (tools are well-consolidated)
**Deprecated:** 0

## Tool Registry

All tools are located in `backend/src/modules/ai/voltagent/tools/`.

---

### Email Tools

#### list_email_index (RLM)
- **File:** `email-rlm.tools.ts`
- **Capability:** Lightweight email index with metadata only (~100 chars per email). Lists unread/recent/starred/search results.
- **Parameters:** `mode: 'unread'|'recent'|'starred'|'search'`, `limit?: number`, `query?: string`
- **Used By:** UnifiedAgent (all email intents)
- **Status:** Active
- **Notes:** RLM pattern - efficient token usage. Returns IDs for subsequent get_email_content calls.

#### get_email_content (RLM)
- **File:** `email-rlm.tools.ts`
- **Capability:** Load full email content by ID(s). Supports single ID or comma-separated list (max 5).
- **Parameters:** `emailIds: string` (comma-separated), `includeThread?: boolean`
- **Used By:** UnifiedAgent (email read intents)
- **Status:** Active
- **Notes:** RLM pattern - load only needed emails. 60-70% token reduction vs loading all upfront.

#### manage_email
- **File:** `email.tools.ts`
- **Capability:** CONSOLIDATED - send, reply, forward, move, archive, delete, mark read/unread, star emails.
- **Parameters:** `action: 'send'|'reply'|'forward'|'move'|...'`, `emailId?`, `to?`, `subject?`, `body?`, etc.
- **Used By:** UnifiedAgent (email write intents)
- **Status:** Active
- **Notes:** HITL (Human-In-The-Loop) required for send/reply/forward/delete actions.

---

### Folder Tools

#### list_folders
- **File:** `folder.tools.ts`
- **Capability:** List email folders with message counts. Excludes spam/trash by default.
- **Parameters:** `includeSystem?: boolean`, `limit?: number`
- **Used By:** UnifiedAgent (folder queries)
- **Status:** Active

#### manage_folder
- **File:** `folder.tools.ts`
- **Capability:** CONSOLIDATED - create, rename, delete folders.
- **Parameters:** `action: 'create'|'rename'|'delete'`, `folderId?`, `name?`, `parentId?`
- **Used By:** UnifiedAgent (folder management)
- **Status:** Active
- **Notes:** HITL required for all actions (folder mutations are risky).

---

### Calendar Tools

#### get_events
- **File:** `calendar.tools.ts`
- **Capability:** Get calendar events for a date range. Read-only.
- **Parameters:** `startDate: string`, `endDate: string`, `calendarId?: string`
- **Used By:** UnifiedAgent (calendar queries)
- **Status:** Active

#### manage_event
- **File:** `calendar.tools.ts`
- **Capability:** CONSOLIDATED - create, update, delete events, check availability.
- **Parameters:** `action: 'create'|'update'|'delete'|'check_availability'`, `eventId?`, `title?`, `startTime?`, `endTime?`, etc.
- **Used By:** UnifiedAgent (calendar management)
- **Status:** Active
- **Notes:** HITL required for create/update/delete. Check_availability is read-only.

---

### Contact Tools

#### search_contacts
- **File:** `contacts.tools.ts`
- **Capability:** Search contacts by name, email, company. Uses Prisma OR + raw SQL for email JSON search.
- **Parameters:** `query: string`, `limit?: number`
- **Used By:** UnifiedAgent (contact lookup, email composition)
- **Status:** Active
- **Notes:** Filters to contacts with valid email addresses only.

#### manage_contact
- **File:** `contacts.tools.ts`
- **Capability:** CONSOLIDATED - get, create, update, delete contacts.
- **Parameters:** `action: 'get'|'create'|'update'|'delete'`, `contactId?`, `email?`, `displayName?`, etc.
- **Used By:** UnifiedAgent (contact management)
- **Status:** Active
- **Notes:** HITL required for create/update/delete.

---

### AI Insights Tools

#### summarize_email
- **File:** `insights.tools.ts`
- **Capability:** Generate concise email summaries using Mistral.
- **Parameters:** `emailId: string`, `style?: 'brief'|'detailed'`
- **Used By:** UnifiedAgent (summarization intent)
- **Status:** Active

#### analyze_sentiment
- **File:** `insights.tools.ts`
- **Capability:** Analyze email sentiment and tone.
- **Parameters:** `emailId: string`
- **Used By:** UnifiedAgent (analysis intent)
- **Status:** Active

#### compose_reply
- **File:** `insights.tools.ts`
- **Capability:** Compose intelligent reply drafts with optional writing style matching.
- **Parameters:** `emailId: string`, `tone?: string`, `useWritingStyle?: boolean`
- **Used By:** UnifiedAgent (reply composition)
- **Status:** Active

#### extract_action_items
- **File:** `insights.tools.ts`
- **Capability:** Extract action items and deadlines from emails.
- **Parameters:** `emailId: string`
- **Used By:** UnifiedAgent (task extraction)
- **Status:** Active

#### generate_smart_replies
- **File:** `insights.tools.ts`
- **Capability:** Generate quick reply suggestions (3 options).
- **Parameters:** `emailId: string`
- **Used By:** UnifiedAgent (quick reply)
- **Status:** Active

---

### Memory Tools

#### search_memory
- **File:** `memory.tools.ts`
- **Capability:** Semantic search on user memories/facts. Uses pgvector.
- **Parameters:** `query: string`, `limit?: number`
- **Used By:** UnifiedAgent (knowledge recall)
- **Status:** Active

#### store_memory
- **File:** `memory.tools.ts`
- **Capability:** Store new facts or notes for future recall.
- **Parameters:** `content: string`, `type?: 'FACT'|'PREFERENCE'|'CONTACT_NOTE'|'PATTERN'`, `category?: string`
- **Used By:** UnifiedAgent (knowledge storage)
- **Status:** Active

---

### Attachment Tools

#### list_email_attachments
- **File:** `attachment.tools.ts`
- **Capability:** List attachments for an email without extracting content.
- **Parameters:** `emailId: string`
- **Used By:** UnifiedAgent (attachment queries)
- **Status:** Active

#### get_attachment_content
- **File:** `attachment.tools.ts`
- **Capability:** Extract text from attachment using Mistral OCR. On-demand (cost optimization).
- **Parameters:** `attachmentId: string`
- **Used By:** UnifiedAgent (attachment analysis)
- **Status:** Active
- **Notes:** Cost: $1/1000 pages (Mistral OCR). Extracts on-demand only.

---

### External Services Tools

#### web_search
- **File:** `web-search.tools.ts`
- **Capability:** Search the web for current information using Mistral Agents API.
- **Parameters:** `query: string`
- **Used By:** UnifiedAgent (research intent)
- **Status:** Active
- **Notes:** Uses Mistral's built-in web_search tool. 15-minute cache TTL.

#### analyze_data
- **File:** `analytics.tools.ts`
- **Capability:** AI-powered analytics using Mistral's code_interpreter. Generates charts.
- **Parameters:** `query: string`, `data: object`
- **Used By:** UnifiedAgent (analytics intent)
- **Status:** Active
- **Notes:** Uses Mistral Agents API code_interpreter. 30-minute cache TTL.

#### manage_document_library
- **File:** `document-library.tools.ts`
- **Capability:** CONSOLIDATED - query documents, list libraries, create libraries. RAG with Mistral document_library.
- **Parameters:** `action: 'query'|'list'|'create'`, `libraryId?`, `query?`, `name?`
- **Used By:** UnifiedAgent (document RAG)
- **Status:** Active
- **Notes:** Uses Mistral's built-in document_library tool. Automatic chunking and embedding.

---

### User Interaction Tools

#### ask_user_clarification
- **File:** `ask-user.tool.ts`
- **Capability:** Request user input when agent needs clarification. Triggers frontend modal.
- **Parameters:** `question: string`, `header: string`, `options: Array<{label, description?}>`, `multiSelect?: boolean`
- **Used By:** UnifiedAgent (all intents when ambiguous)
- **Status:** Active
- **Notes:** Blocking call - agent execution pauses until user responds.

---

## Duplicate Detection

| Capability | Implementations | Recommended | Delete |
|------------|-----------------|-------------|--------|
| Email operations | `manage_email` (consolidated) | Keep | None |
| Calendar operations | `manage_event` (consolidated) | Keep | None |
| Contact operations | `manage_contact` (consolidated) | Keep | None |
| Folder operations | `manage_folder` (consolidated) | Keep | None |
| Document library | `manage_document_library` (consolidated) | Keep | None |

**No duplicates found.** Tools were consolidated in a previous refactoring effort. Each capability has exactly one implementation.

---

## Deprecated Tools (Delete in 01-02)

| Tool | File | Reason | Replacement |
|------|------|--------|-------------|
| None | - | - | - |

No deprecated tools found. Codebase is clean.

---

## Tool Architecture Summary

### Pattern: Consolidated Action Tools
Most tools follow the consolidated pattern where one tool handles multiple related actions:
- `manage_email` handles 8+ email actions
- `manage_event` handles 4 calendar actions
- `manage_contact` handles 4 contact actions
- `manage_folder` handles 3 folder actions
- `manage_document_library` handles 3 document actions

This reduces tool sprawl and simplifies agent reasoning.

### Pattern: RLM (Recursive Language Model) for Emails
Email tools use the RLM pattern for efficiency:
1. `list_email_index` - lightweight metadata scan
2. `get_email_content` - load full content on-demand

This reduces token usage by 60-70%.

### Pattern: HITL (Human-In-The-Loop) for Mutations
All destructive operations require user approval:
- Send/reply/forward/delete emails
- Create/update/delete events
- Create/update/delete contacts
- Create/rename/delete folders

Tools return `{ requiresApproval: true, actionType: '...', payload: {...} }` which is captured by observability hooks and stored for user review.

### Pattern: Redis + Memory Fallback Caching
All tools with external API calls (web search, analytics, document library) implement:
- Redis caching (primary) for multi-instance deployment
- In-memory fallback when Redis unavailable
- GDPR-compliant cache keys with tenant/user isolation

---

## Consolidation Plan

**Status: Already consolidated.**

No further consolidation needed for Plan 01-02. The tool inventory is clean and well-organized.

**Recommended Actions for Plan 01-02:**
1. Add timeout wrapper to all tool `execute` functions (VOLT-05 from AUDIT.md)
2. Standardize error return format across all tools (VOLT-07 from AUDIT.md)
3. Add Prometheus metrics for tool execution times

---

*Inventory completed: 2026-02-06*
