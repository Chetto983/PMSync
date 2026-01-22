# VoltAgent Prompt Engineering Deep Audit

**Date**: 2026-01-22
**Auditor**: Senior Prompt Engineer
**Application**: MailAgent - AI Email/Calendar/Contacts Assistant
**Framework**: VoltAgent + Mistral AI

---

## Executive Summary

This audit analyzes all prompts in the MailAgent VoltAgent implementation against industry best practices from [Mistral AI documentation](https://docs.mistral.ai/guides/prompting_capabilities), [VoltAgent patterns](https://github.com/VoltAgent/voltagent), [Azure AI Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns), and [HITL best practices](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo).

### Overall Assessment: 7.2/10

**Strengths:**
- Clean XML-style structure with semantic sections
- Clear agent role separation (Supervisor → ActionsAgent/IntelligenceAgent)
- HITL workflow properly documented
- Severity-based approval levels

**Critical Issues:**
1. Missing few-shot examples in all prompts
2. No chain-of-thought reasoning patterns
3. Inconsistent error recovery guidance
4. Missing output format specifications
5. Supervisor delegation rules need expansion

---

## 1. Architecture Analysis

### Current Multi-Agent Topology

```
SupervisorAgent (Orchestrator)
├── ActionsAgent (WRITE operations, HITL required)
├── IntelligenceAgent (READ operations, no HITL)
├── WebSearchAgent (External search)
├── DocumentLibraryAgent (RAG over documents)
└── AnalyticsAgent (Mistral-powered insights)
```

### Best Practice Alignment

| Pattern | Industry Standard | MailAgent Status | Score |
|---------|------------------|------------------|-------|
| Supervisor Pattern | ✅ Central orchestrator | ✅ Implemented | 9/10 |
| Specialized Agents | ✅ Single responsibility | ✅ ActionsAgent/IntelligenceAgent | 8/10 |
| HITL Checkpoints | ✅ Destructive action approval | ✅ Severity-based | 8/10 |
| Tool Documentation | ✅ JSON schema + descriptions | ⚠️ Partial in prompts | 6/10 |
| Few-shot Examples | ✅ 2-5 examples per task | ❌ Missing | 3/10 |
| Chain-of-Thought | ✅ Explicit reasoning | ❌ Missing | 3/10 |
| Error Recovery | ✅ Retry + escalation | ⚠️ Minimal | 5/10 |

---

## 2. Prompt-by-Prompt Analysis

### 2.1 SupervisorAgent Prompt (`supervisor.prompt.ts`)

**Current Structure:**
```
<IDENTITY> → <SCOPE> → <ROUTING_LOGIC> → <EMAIL_RULES> → <CALENDAR_RULES> →
<CONTACT_RULES> → <PEOPLE_INFORMATION_RULE> → <ERROR_HANDLING> →
<ANTI_OVER_ENGINEERING> → <FORBIDDEN_BEHAVIOR> → <INTERNAL_CONTEXT>
```

**Strengths:**
- Clear identity statement
- Explicit routing rules (WRITE → ActionsAgent, READ → IntelligenceAgent)
- Anti-over-engineering directive is excellent
- Forbidden behavior list prevents common failures

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No delegation examples | HIGH | Missing concrete examples of "delegate to ActionsAgent with this task" |
| Routing ambiguity | MEDIUM | "Create event with attendees" has multi-step logic but no example |
| Missing tool format | MEDIUM | Doesn't specify `delegate_task` tool call format |
| No fallback guidance | MEDIUM | What if both agents fail? |

**Recommended Improvements:**

```xml
<DELEGATION_EXAMPLES>
Example 1: User says "Send an email to john@example.com saying hello"
→ delegate_task(agent="ActionsAgent", task="Send email to john@example.com with message: hello")

Example 2: User says "How many unread emails do I have?"
→ delegate_task(agent="IntelligenceAgent", task="Count unread emails and report the number")

Example 3: User says "Update contact John's phone to 555-1234"
→ delegate_task(agent="ActionsAgent", task="Search for contact named John, then update phone to 555-1234")
</DELEGATION_EXAMPLES>

<CHAIN_OF_THOUGHT>
Before delegating, think step-by-step:
1. Is this a READ or WRITE operation?
2. Does it involve external/public information?
3. Does it require multi-step coordination?
4. What specific task should I delegate?
</CHAIN_OF_THOUGHT>
```

**Score: 7/10**

---

### 2.2 ActionsAgent Prompt (`actions.prompt.ts`)

**Current Structure:**
```
<CORE_IDENTITY> → <CAPABILITIES> → <CRITICAL_NAME_TO_ID_WORKFLOW> →
<MANDATORY_EMAIL_SEND_WORKFLOW> → <MANDATORY_ACCOUNT_USAGE> →
<HITL_WORKFLOW> → <SEVERITY_LEVELS> → <TOOL_GUIDANCE> →
<OUTPUT_FORMAT> → <FORBIDDEN_BEHAVIOR>
```

**Strengths:**
- Excellent NAME_TO_ID workflow documentation (search → get ID → manage)
- Clear severity levels (LOW/MEDIUM/HIGH)
- Good tool guidance with parameter details
- Strong forbidden behavior list

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No few-shot examples | HIGH | CRITICAL_NAME_TO_ID_WORKFLOW needs concrete examples |
| Missing tool response format | MEDIUM | What does successful `manage_contact` return? |
| HITL return format unclear | MEDIUM | How should `requiresApproval: true` be structured? |
| No error examples | MEDIUM | What if search_contacts returns empty? |

**Recommended Improvements:**

```xml
<FEW_SHOT_EXAMPLES>
Example 1: "Update contact John's email to john.new@example.com"
STEP 1: search_contacts(query="John")
RESULT: [{contactId: "abc123", displayName: "John Smith", email: "john@old.com"}]
STEP 2: manage_contact(action="update", contactId="abc123", updates={email: "john.new@example.com"})
RESULT: {requiresApproval: true, actionType: "UPDATE_CONTACT", severity: "MEDIUM", payload: {...}}

Example 2: "Delete the meeting called 'Team Standup'"
STEP 1: get_events(query="Team Standup")
RESULT: [{eventId: "evt789", title: "Team Standup", start: "2026-01-23T09:00:00"}]
STEP 2: manage_event(action="delete", eventId="evt789")
RESULT: {requiresApproval: true, actionType: "DELETE_EVENT", severity: "HIGH", payload: {...}}
</FEW_SHOT_EXAMPLES>

<ERROR_RECOVERY>
If search returns empty:
- Inform user: "I couldn't find a contact named [X]. Would you like me to search with different terms?"
- Do NOT proceed with manage operation without valid ID

If manage fails:
- Return error details to user
- Suggest alternative actions
</ERROR_RECOVERY>
```

**Score: 7.5/10**

---

### 2.3 IntelligenceAgent Prompt (`intelligence.prompt.ts`)

**Current Structure:**
```
<CORE_IDENTITY> → <CAPABILITIES> → <TOOLS> → <RAG_SEARCH_CAPABILITY> →
<EMAIL_READING_WORKFLOW> → <EMAIL_COUNTING> → <OUTPUT_FORMAT> → <FORBIDDEN_BEHAVIOR>
```

**Strengths:**
- Excellent tool documentation with parameters and examples
- Clear READ-only mandate
- Good RAG search explanation
- Strong email reading workflow

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| Long tool lists without grouping | MEDIUM | Hard to parse - should be categorized |
| Missing chain-of-thought | MEDIUM | Complex queries need reasoning steps |
| No multi-tool coordination | MEDIUM | When to use list_emails vs search_emails vs semantic_search? |
| Output format too generic | LOW | Could be more specific for different query types |

**Recommended Improvements:**

```xml
<TOOL_SELECTION_LOGIC>
For "show me emails from John":
→ Use search_emails(from="john") - keyword search

For "find emails about the project deadline":
→ Use semantic_search_emails(query="project deadline") - semantic RAG search

For "how many unread emails in inbox":
→ Use count_emails(folder="INBOX", isRead=false) - count only

For "list my last 10 emails":
→ Use list_emails(limit=10, sortBy="date", sortOrder="desc") - simple list
</TOOL_SELECTION_LOGIC>

<CHAIN_OF_THOUGHT_ANALYSIS>
When asked to analyze emails, think:
1. What specific information is needed?
2. Do I need to search first, or do I have email IDs?
3. What analysis tool fits best (summarize, sentiment, priority)?
4. How should I format the response?
</CHAIN_OF_THOUGHT_ANALYSIS>
```

**Score: 7/10**

---

### 2.4 Memory Prompts (`memory.prompt.ts`)

**Current Prompts:**
1. `FACT_RETRIEVAL_PROMPT` - Extract durable facts from conversations
2. `MEMORY_DEDUCTION_PROMPT` - Determine ADD/UPDATE/DELETE/NONE
3. `MEMORY_SEARCH_PROMPT` - Find relevant memories
4. `MEMORY_SUMMARY_PROMPT` - Create concise summaries

**Strengths:**
- Based on proven mem0 patterns
- Clear JSON output format specification
- Good safeguards against ephemeral/redacted content
- Explicit instructions to avoid storing PII placeholders

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No few-shot examples | HIGH | Complex extraction needs examples |
| Deduction prompt too long | MEDIUM | 200+ lines of rules - should be condensed |
| Missing confidence scoring | MEDIUM | When is a fact "certain" vs "likely"? |

**Recommended Improvements:**

```xml
<FACT_RETRIEVAL_EXAMPLES>
Input: "User asked about tomorrow's meeting with John"
Output: {"facts": []}
Reason: Temporal reference "tomorrow" - not durable

Input: "User's timezone is America/New_York"
Output: {"facts": ["User's timezone is America/New_York"]}
Reason: Durable preference - should be remembered

Input: "User prefers concise email responses"
Output: {"facts": ["User prefers concise email responses"]}
Reason: Communication preference - durable
</FACT_RETRIEVAL_EXAMPLES>
```

**Score: 7/10**

---

### 2.5 Locale/Embedded Prompts (`en.ts`)

**Contains:**
- Email/Calendar/Contacts agent instructions
- WebSearch/Analytics/DocumentLibrary prompts
- Insight prompts (summarize, sentiment, priority, compose, actionItems)
- Action response templates
- Router intent patterns

**Issues:**

| Issue | Severity | Description |
|-------|----------|-------------|
| Prompts scattered in locale file | HIGH | Mixes i18n strings with agent prompts |
| Insight prompts lack examples | MEDIUM | `summarize`, `sentiment` need few-shot |
| Router patterns incomplete | MEDIUM | Missing some intent categories |
| No temperature guidance | LOW | Some tasks need different temperature |

**Recommended Improvements:**

1. **Extract prompts to dedicated files** - Don't mix i18n with prompt engineering
2. **Add few-shot to insight prompts:**

```typescript
// summarize.prompt.ts
export const SUMMARIZE_PROMPT = `
Summarize this email concisely.

EXAMPLES:
Email: "Hi John, The meeting is rescheduled to 3pm tomorrow. Please confirm."
Summary: Meeting rescheduled to 3pm tomorrow, confirmation requested.

Email: "Attached are Q3 financial reports. Key highlights: Revenue up 15%, costs down 8%."
Summary: Q3 reports attached. Revenue +15%, costs -8%.
`;
```

**Score: 6/10**

---

## 3. Critical Gaps vs Industry Best Practices

### 3.1 Missing: Few-Shot Prompting (Critical)

**Industry Standard** ([PromptHub](https://www.prompthub.us/blog/prompt-engineering-for-ai-agents)):
> "Few-shot Prompting involves giving the AI a few examples of how you want it to respond. These samples help the AI understand your desired format, tone, and style."

**Current State**: 0 of 5 main prompts have few-shot examples.

**Impact**: Reduced accuracy, inconsistent outputs, more hallucinations.

**Fix Priority**: HIGH

---

### 3.2 Missing: Chain-of-Thought Reasoning (Critical)

**Industry Standard** ([Lakera Guide](https://www.lakera.ai/blog/prompt-engineering-guide)):
> "Chain-of-thought Prompting asks the AI to explain its reasoning before acting. This approach is useful when the task involves logic, policies, or complex conditions."

**Current State**: No explicit reasoning directives in any prompt.

**Impact**: Complex multi-step tasks fail more often.

**Fix Priority**: HIGH

---

### 3.3 Weak: Error Recovery Patterns (Medium)

**Industry Standard** ([UiPath](https://www.uipath.com/blog/ai/agent-builder-best-practices)):
> "Build robust evaluation datasets with success cases, edge cases, and failure scenarios. Simulate tools and escalations that could block runs."

**Current State**: Only supervisor.prompt.ts has basic `<ERROR_HANDLING>` section.

**Impact**: Agents fail silently or give unhelpful errors.

**Fix Priority**: MEDIUM

---

### 3.4 Missing: Output Format Specifications (Medium)

**Industry Standard** ([Mistral Docs](https://docs.mistral.ai/guides/prompting_capabilities)):
> "The more detail you give, the better the result. If you ask for a table, it will organize information in a table."

**Current State**: Generic "provide helpful response" type guidance.

**Impact**: Inconsistent response formats, harder to parse programmatically.

**Fix Priority**: MEDIUM

---

### 3.5 Suboptimal: Tool Documentation in Prompts

**Industry Standard** ([Mistral Function Calling](https://docs.mistral.ai/capabilities/function_calling)):
> "It's recommended to provide context and custom instructions under the system role umbrella with guidance on how to use the provided tools."

**Current State**: IntelligenceAgent has good tool docs, ActionsAgent is sparse.

**Impact**: Wrong tool selection, incorrect parameters.

**Fix Priority**: MEDIUM

---

## 4. Mistral-Specific Recommendations

Based on [Mistral prompting guide](https://docs.mistral.ai/guides/prompting_capabilities):

### 4.1 Temperature Settings

| Task Type | Recommended Temp | Current |
|-----------|-----------------|---------|
| Factual queries (search, count) | 0.1-0.2 | Not specified |
| Analysis (summarize, sentiment) | 0.3-0.5 | Not specified |
| Creative (compose reply) | 0.6-0.8 | Not specified |
| Classification (routing) | 0.0-0.1 | Not specified |

**Recommendation**: Add temperature hints to insight prompts.

### 4.2 System Prompt Best Practices

From [PromptLayer Mistral Guide](https://blog.promptlayer.com/mistral-system-prompt/):

```
✅ DO:
- Use clear role assignment: "You are ActionsAgent..."
- Provide explicit constraints: "You can ONLY execute WRITE operations"
- Add guardrails: "NEVER execute without approval"

❌ DON'T:
- Make prompts too long (>2000 tokens risks attention drop)
- Use vague instructions: "help the user"
- Skip examples for complex tasks
```

### 4.3 Function Calling Format

Mistral expects tools in JSON schema format. Current implementation uses VoltAgent's tool definition which handles this, but prompts should reference tool names consistently.

---

## 5. Priority Action Items

### P0 - Critical (Implement This Week)

1. **Add few-shot examples to ActionsAgent prompt**
   - 3 examples for NAME_TO_ID workflow
   - 2 examples for email send workflow
   - 2 examples for HITL return format

2. **Add few-shot examples to SupervisorAgent prompt**
   - 4-5 delegation examples covering all agent types
   - Include multi-step coordination example

3. **Add chain-of-thought directive to Supervisor**
   - Explicit "think step-by-step before delegating"

### P1 - High (Implement This Month)

4. **Extract insight prompts from en.ts to dedicated files**
   - `prompts/summarize.prompt.ts`
   - `prompts/sentiment.prompt.ts`
   - `prompts/compose.prompt.ts`

5. **Add error recovery patterns to ActionsAgent**
   - Empty search results handling
   - Tool failure recovery
   - Validation error guidance

6. **Add tool selection logic to IntelligenceAgent**
   - When to use `search_emails` vs `semantic_search_emails`
   - When to use `list_emails` vs `count_emails`

### P2 - Medium (Next Sprint)

7. **Add temperature hints to analysis prompts**
8. **Condense MEMORY_DEDUCTION_PROMPT** (currently 200+ lines)
9. **Add output format specifications** for each prompt type
10. **Create prompt unit tests** with evaluation datasets

---

## 6. Recommended Prompt Templates

### 6.1 Improved Supervisor Prompt (Draft)

```xml
<IDENTITY>
I am SupervisorAgent, the orchestrator of MailAgent's multi-agent system.
I analyze user requests and delegate to specialized agents.
I NEVER execute email, calendar, or contact operations directly.
</IDENTITY>

<ROUTING_RULES>
WRITE operations (send, reply, delete, create, update) → ActionsAgent
READ operations (search, list, count, analyze) → IntelligenceAgent
External/public information → WebSearchAgent
Document library queries → DocumentLibraryAgent
</ROUTING_RULES>

<CHAIN_OF_THOUGHT>
Before delegating, I think:
1. What type of operation is this? (READ/WRITE/EXTERNAL)
2. Which agent handles this category?
3. What specific task should I delegate?
4. Does this need multi-step coordination?
</CHAIN_OF_THOUGHT>

<DELEGATION_EXAMPLES>
User: "Send an email to sarah@company.com saying the report is ready"
Thinking: WRITE operation (send) → ActionsAgent
Action: delegate_task(agent="ActionsAgent", task="Send email to sarah@company.com with subject 'Report Ready' and body 'The report is ready.'")

User: "How many unread emails do I have from last week?"
Thinking: READ operation (count) → IntelligenceAgent
Action: delegate_task(agent="IntelligenceAgent", task="Count unread emails from the last 7 days")

User: "Update John's phone number to 555-0123"
Thinking: WRITE operation (update contact) → ActionsAgent
Action: delegate_task(agent="ActionsAgent", task="Find contact named John and update phone number to 555-0123")

User: "What's the weather forecast for tomorrow?"
Thinking: External public information → WebSearchAgent
Action: delegate_task(agent="WebSearchAgent", task="Get weather forecast for tomorrow")
</DELEGATION_EXAMPLES>

<ERROR_HANDLING>
If delegated agent fails:
1. Analyze error message
2. Reformulate task with more specific instructions
3. Retry delegation once
4. If still fails, inform user with helpful explanation

If unsure which agent to use:
- Default to IntelligenceAgent for information queries
- Default to ActionsAgent for any modification request
</ERROR_HANDLING>

<FORBIDDEN>
- NEVER say "I don't have access" or "I can't do that"
- NEVER execute operations directly without delegating
- NEVER ask unnecessary clarifying questions for clear requests
</FORBIDDEN>
```

---

## 7. Testing Recommendations

### 7.1 Evaluation Dataset Structure

Per [UiPath best practices](https://www.uipath.com/blog/ai/agent-builder-best-practices):
> "Have at least 30 evaluation cases per agent."

**Suggested test categories:**

| Category | Count | Examples |
|----------|-------|----------|
| Happy path | 10 | Basic send email, search contacts |
| Edge cases | 10 | Empty results, ambiguous names |
| Error scenarios | 5 | Invalid parameters, service failures |
| Multi-step | 5 | Name-to-ID workflows, complex queries |

### 7.2 Metrics to Track

- Task completion rate
- Correct agent delegation rate
- HITL trigger accuracy (false positives/negatives)
- Response latency
- Token usage per request

---

## 8. Conclusion

The MailAgent VoltAgent prompts have a solid foundation with good architectural patterns. The main gaps are:

1. **Few-shot examples** - Critical for consistent behavior
2. **Chain-of-thought** - Needed for complex multi-step tasks
3. **Error recovery** - Better failure handling
4. **Prompt organization** - Extract from locale files

Implementing the P0 items (few-shot examples + CoT) will provide the highest ROI in terms of reliability and accuracy improvements.

---

## Sources

- [VoltAgent GitHub](https://github.com/VoltAgent/voltagent)
- [Mistral Prompting Capabilities](https://docs.mistral.ai/guides/prompting_capabilities)
- [Mistral Function Calling](https://docs.mistral.ai/capabilities/function_calling)
- [PromptHub: Prompt Engineering for AI Agents](https://www.prompthub.us/blog/prompt-engineering-for-ai-agents)
- [Azure AI Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [UiPath: 10 Best Practices for AI Agents](https://www.uipath.com/blog/ai/agent-builder-best-practices)
- [HITL Best Practices - Permit.io](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [LangChain Human-in-the-Loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)
- [Lakera Prompt Engineering Guide](https://www.lakera.ai/blog/prompt-engineering-guide)
- [Skywork: Multi-Agent Orchestration Best Practices](https://skywork.ai/blog/ai-agent-orchestration-best-practices-handoffs/)
