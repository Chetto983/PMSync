# Esempio Folder Analysis - Best Practices for MailAgent

> **📚 REFERENCE DOCUMENT**: Patterns from this document are tracked in [AI_ROADMAP_MASTER.md](./AI_ROADMAP_MASTER.md)
> See Phase 3 (Prompt Enhancements) and Phase 4 (Cost Optimization) for implementation status.

**Date**: 2026-01-26
**Purpose**: Extract patterns and best practices from reference projects for MailAgent improvements

---

## Executive Summary

The `esempio` folder contains 3 high-quality reference projects:
1. **email-agent-main** - Python email agent with sophisticated triage/CRM
2. **system-prompts-collection** - AI tool system prompts (Claude Code, Cursor, Devin, etc.)
3. **Inbox Zero (Zero-staging)** - Open-source AI email client

**Key Actionable Insights**:
| Category | Pattern | Priority | Impact |
|----------|---------|----------|--------|
| Email Triage | Multi-factor attention scoring | HIGH | Better inbox prioritization |
| Contact CRM | Relationship intelligence with role classification | HIGH | Enhanced CRM insights |
| Search | Natural language → Gmail query conversion | MEDIUM | Smarter email search |
| Writing Style | 52-metric style adaptation | LOW | Personalized email composition |
| Summarization | Incremental thread re-summarization | MEDIUM | Efficient context updates |

---

## 1. Email Triage System (email-agent-main)

### Source: `triage_agent.py` (~916 lines)

### 1.1 Attention Score System

**Concept**: Multi-factor weighted scoring to determine email priority (0.0-1.0 scale)

```python
# Weights for attention scoring
weights = {
    "category": 0.30,   # Business categories (action required, decision, etc.)
    "sender": 0.25,     # Sender importance based on relationship
    "urgency": 0.20,    # Time-sensitive indicators
    "recency": 0.15,    # How recent the email is
    "thread": 0.10,     # Thread context and conversation state
}
```

**Applicability to MailAgent**:
- [ ] Create `AttentionScoreService` in `voltagent/services/`
- [ ] Integrate with `email-insights.service.ts` for prioritization
- [ ] Add to IntelligenceAgent tool selection logic

### 1.2 Triage Decisions

```python
class TriageDecision(Enum):
    PRIORITY_INBOX = "priority_inbox"    # Critical - needs immediate attention
    REGULAR_INBOX = "regular_inbox"      # Normal priority
    AUTO_ARCHIVE = "auto_archive"        # Low priority - archive automatically
    SPAM_FOLDER = "spam_folder"          # Spam/promotional
```

**Implementation**: Map to existing MailAgent folder structure or create new labels.

### 1.3 Habit Learning from Feedback

```python
async def learn_from_user_feedback(self, email_id: str, feedback: UserFeedback):
    """Update habits based on user actions"""
    # Learn sender importance
    if feedback.marked_important:
        self.sender_importance[sender] += 0.1
    # Learn category preferences
    if feedback.moved_to_folder:
        self.category_preferences[category] = feedback.target_folder
    # Learn urgency patterns
    if feedback.response_time < 1_hour:
        self.urgency_patterns[email_type] = "high"
```

**Applicability**: Already have `AgentLearningProfile` and `LearningService` - extend with:
- Sender importance adjustments
- Category preference learning
- Response time pattern tracking

---

## 2. Relationship Intelligence (email-agent-main)

### Source: `relationship_intelligence.py` (~807 lines)

### 2.1 Contact Profile Dataclass

```python
@dataclass
class ContactProfile:
    relationship_type: str          # board, investor, customer, advisor, team, vendor
    importance_level: int           # 1-10 scale
    escalation_priority: int        # Auto-escalation threshold
    interaction_frequency: str      # high, medium, low
    last_contact_date: datetime
    response_rate: float            # How often they respond
    average_response_time: float    # Typical response time
```

**Applicability to MailAgent**:
- Already have `RelationshipIntelligenceService` in `voltagent/services/`
- **Extend** with: `escalation_priority`, `response_rate`, `average_response_time` fields

### 2.2 Role Pattern Classification

```python
self.role_patterns = {
    "board": [r"board", r"director", r"chairman", r"chairperson", r"trustee"],
    "investor": [r"investor", r"investment", r"venture", r"partner", r"vc", r"angel"],
    "customer": [r"customer", r"client", r"user", r"subscriber", r"buyer"],
    "advisor": [r"advisor", r"consultant", r"coach", r"mentor"],
    "vendor": [r"vendor", r"supplier", r"provider", r"contractor"],
    "team": [r"team", r"colleague", r"coworker", r"employee", r"staff"],
}
```

**Implementation**: Add regex-based role detection to `relationship-intelligence.service.ts`:
```typescript
const ROLE_PATTERNS = {
  board: /board|director|chairman|chairperson|trustee/i,
  investor: /investor|investment|venture|partner|vc|angel/i,
  customer: /customer|client|user|subscriber|buyer/i,
  // ...
};
```

### 2.3 Company Domain Intelligence

```python
async def get_company_context(self, email_domain: str) -> CompanyContext:
    """Extract company information from email domain"""
    # Look up company size, industry, recent news
    # Calculate business relationship score
```

**Applicability**: Integrate with existing `unified-knowledge.service.ts` for company enrichment.

---

## 3. System Prompts Best Practices

### Source: `system-prompts-and-models-of-ai-tools-main/`

### 3.1 Claude Code 2.0 Patterns

**Key Techniques**:
1. **Structured XML sections** for clear instruction hierarchy
2. **Few-shot examples** with input/output pairs
3. **Tool usage rules** with explicit when-to-use guidance
4. **Self-check section** at the end

```xml
<self_check>
  Before sending each response:
  1. Did I use the appropriate tool instead of providing manual instructions?
  2. Does it follow the success criteria?
  3. Is it plain text only?
  4. Am I being concise and helpful?
  5. Did I follow safety rules?
</self_check>
```

### 3.2 Cursor Agent Patterns

**Key Techniques**:
1. **Maximize context understanding** section
2. **Code citing format** rules
3. **Todo management** integration

```xml
<maximize_context_understanding>
  When searching codebase:
  1. Use semantic search for conceptual queries
  2. Use grep for exact string matches
  3. Read related files to understand patterns
  4. Check test files for expected behavior
</maximize_context_understanding>
```

### 3.3 Common Patterns Across All Prompts

| Pattern | Used By | Status in MailAgent |
|---------|---------|---------------------|
| XML-structured instructions | All | ✅ Implemented |
| Few-shot examples | All | ✅ Implemented |
| Chain-of-thought thinking | Claude Code, Cursor | ✅ Implemented |
| Tool usage rules | All | ✅ Implemented |
| Safety protocols | Claude Code, Inbox Zero | ⚠️ Partial |
| Self-check section | Claude Code, Cursor | ❌ Add to prompts |

---

## 4. Inbox Zero AI Features

### Source: `Zero-staging/apps/server/src/lib/`

### 4.1 Gmail Search Query Builder

**Source**: `prompts.ts` - `GmailSearchAssistantSystemPrompt`

```xml
<Guideline id="4">
  Maximize Recall: For vague terms, expand with synonyms and related keywords
  joined by OR (e.g. (report OR summary), (picture OR photo OR image OR filename:jpg))
</Guideline>

<Guideline id="7">
  When asked to search for plural of a word, use the OR operator to search
  for the singular form: "referrals" → "referral OR referrals"
</Guideline>
```

**Applicability to MailAgent**:
- [ ] Create `SearchQueryBuilderService` for natural language → IMAP/Gmail query
- [ ] Integrate with IntelligenceAgent's `search_emails` tool
- [ ] Support multilingual search queries

### 4.2 Styled Email Assistant (52 Writing Metrics)

**Source**: `prompts.ts` - `StyledEmailAssistantSystemPrompt`

```xml
<style_adaptation>
  The profile JSON contains all current metrics:
  - Greeting & sign-off flags
  - 52 numeric rates including:
    - averageSentenceLength, averageLinesPerParagraph
    - typeTokenRatio, shannonEntropy, lexicalDensity
    - subordinationRatio, passiveVoiceRate, modalVerbRate
    - sentimentPolarity, sentimentSubjectivity, formalityScore
    - fleschReadingEase, gunningFogIndex, smogIndex
    - firstPersonSingularRate, empathyPhraseRate, humorMarkerRate
</style_adaptation>
```

**Applicability**: Already have `WritingStyleService` - could enhance with:
- More granular metrics (currently basic)
- Style matching for smart-reply

### 4.3 AI Chat Assistant (Fred)

**Source**: `prompts.ts` - `AiChatPrompt`

**Key Patterns**:

1. **Thinking Process Section**:
```xml
<thinking_process>
  Before responding, think step-by-step:
  1. What is the user's primary intent and any secondary goals?
  2. What tools are needed and in what sequence?
  3. Are there ambiguities that need clarification?
  4. What safety protocols apply to this request?
  5. How can I enable efficient follow-up actions?
  Keep this reasoning internal - never expose to user.
</thinking_process>
```

2. **Safety Protocols with Thresholds**:
```xml
<bulk_operation_thresholds>
  <immediate>1-2 threads, read operations</immediate>
  <preview_confirm>3-5 threads, show samples</preview_confirm>
  <detailed_confirm>6-20 threads, show count and samples</detailed_confirm>
  <staged_approach>21+ threads, suggest batched processing</staged_approach>
</bulk_operation_thresholds>
```

3. **Workflow Examples**:
```xml
<workflow_examples>
  <example name="organize_emails">
    <thinking>1. Search → 2. Check labels → 3. Create if needed → 4. Apply</thinking>
    <action_sequence>
      1. inboxRag({ query: "investment emails" })
      2. getUserLabels()
      3. createLabel({ name: "Investments" }) [if needed]
      4. modifyLabels({ threadIds: [...] })
    </action_sequence>
  </example>
</workflow_examples>
```

**Applicability**:
- [ ] Add `<thinking_process>` to SupervisorAgent prompt
- [ ] Add bulk operation thresholds to ActionsAgent HITL logic
- [ ] Add workflow examples for common multi-tool operations

### 4.4 Thread Summarization Prompts

**Source**: `brain.fallback.prompts.ts`

**Key Techniques**:

1. **Incremental Re-summarization** (avoid re-processing entire thread):
```xml
<update_logic>
  <item>If existing summary provided, update by integrating new messages
        while preserving all prior details.</item>
  <item>Maintain chronological order and ensure completeness.</item>
  <item>Do not modify prior content except to append new updates.</item>
</update_logic>
```

2. **Strict Output Guidelines**:
```xml
<strict_guidelines>
  - No omissions, distortions, or assumptions
  - Do not include any notes beyond the summary
  - Never say "Here is"
  - Use parties names, never say "the recipient" or "the sender"
</strict_guidelines>
```

**Applicability**:
- Already have `ConversationCompactionService`
- [ ] Add incremental re-summarization support (only summarize new messages)
- [ ] Apply strict output guidelines to our summarization prompts

### 4.5 Automatic Thread Labeling

**Source**: `brain.fallback.prompts.ts` - `ThreadLabels`

```xml
<labeling_rules>
  <item>Choose up to 3 labels from allowed_labels list only</item>
  <item>Ignore Gmail system labels (INBOX, UNREAD, CATEGORY_*)</item>
  <item>Include company names as labels when heavily referenced</item>
  <item>Include bank names as labels when heavily referenced</item>
  <item>Do not use personal names as labels</item>
</labeling_rules>
```

**Applicability**:
- [ ] Create `AutoLabelingService` for automatic email categorization
- [ ] Integrate with folder sync to auto-apply labels

---

## 5. Recommended Improvements for MailAgent

### Priority 1: HIGH Impact

| Improvement | Source | Est. LOC | Files to Create/Modify |
|-------------|--------|----------|------------------------|

| Attention Score System | email-agent | ~200 | `attention-score.service.ts` (NEW) |
| Bulk Operation Thresholds | Inbox Zero | ~50 | `actions.prompt.ts`, `hitl.service.ts` |
| Self-Check Section in Prompts | All prompts | ~30 | `*.prompt.ts` |
| Role Pattern Classification | email-agent | ~100 | `relationship-intelligence.service.ts` |

### Priority 2: MEDIUM Impact

| Improvement | Source | Est. LOC | Files to Create/Modify |
|-------------|--------|----------|------------------------|

| Natural Language Search Builder | Inbox Zero | ~150 | `search-query-builder.service.ts` (NEW) |
| Incremental Re-summarization | Inbox Zero | ~80 | `conversation-compaction.service.ts` |
| Workflow Examples in Prompts | Inbox Zero | ~100 | `*.prompt.ts` |
| Thinking Process Section | Inbox Zero | ~30 | `supervisor.prompt.ts` |

### Priority 3: LOW Impact (Nice to Have)

| Improvement | Source | Est. LOC | Files to Create/Modify |
|-------------|--------|----------|------------------------|
| 52-Metric Writing Style | Inbox Zero | ~300 | `writing-style.service.ts` |
| Auto-Labeling Service | Inbox Zero | ~150 | `auto-labeling.service.ts` (NEW) |
| Company Domain Intelligence | email-agent | ~100 | `unified-knowledge.service.ts` |

---

## 6. Prompt Pattern Library

### 6.1 Self-Check Section Template

```xml
<self_check>
  Before finalizing response:
  1. Did I use the correct tool for this operation?
  2. Did I search for the entity ID before attempting a write operation?
  3. Is the response actionable and helpful?
  4. Did I follow the HITL workflow for destructive actions?
  5. Am I avoiding unnecessary explanations?
</self_check>
```

### 6.2 Thinking Process Template

```xml
<thinking_process>
  Before acting, think step-by-step:
  1. What is the user's primary intent?
  2. Is this a READ or WRITE operation?
  3. What tools are needed and in what sequence?
  4. Are there ambiguities requiring clarification?
  5. What safety protocols apply?
  Keep reasoning internal - never expose to user.
</thinking_process>
```

### 6.3 Bulk Operation Safety Template

```xml
<bulk_operation_safety>
  <thresholds>
    <tier count="1-2">Execute immediately with confirmation message</tier>
    <tier count="3-5">Preview samples before execution</tier>
    <tier count="6-20">Show count + samples, require explicit confirmation</tier>
    <tier count="21+">Suggest batched processing with checkpoints</tier>
  </thresholds>
  <destructive_actions>
    Always require explicit "confirm" or "yes" for:
    - Permanent deletion
    - Moving to trash/archive
    - Bulk label modifications
  </destructive_actions>
</bulk_operation_safety>
```

### 6.4 Workflow Example Template

```xml
<workflow_examples>
  <example name="[operation_name]">
    <user>[Natural language request]</user>
    <thinking>[Step-by-step reasoning]</thinking>
    <action_sequence>
      1. [First tool call with params]
      2. [Second tool call with params]
      3. [Optional: condition check]
      4. [Final tool call]
    </action_sequence>
    <response>[Concise result summary]</response>
  </example>
</workflow_examples>
```

---

## 7. Implementation Roadmap

### Week 1: Prompt Enhancements
- [ ] Add `<self_check>` section to all agent prompts
- [ ] Add `<thinking_process>` to SupervisorAgent
- [ ] Add bulk operation thresholds to ActionsAgent
- [ ] Add 3-5 workflow examples per agent

### Week 2: Attention Score System
- [ ] Create `AttentionScoreService`
- [ ] Implement multi-factor weighted scoring
- [ ] Integrate with email-insights.service.ts
- [ ] Add to IntelligenceAgent tool selection

### Week 3: Enhanced CRM Intelligence
- [ ] Add role pattern classification to RelationshipIntelligenceService
- [ ] Add response_rate, average_response_time fields to Contact model
- [ ] Create company domain enrichment logic

### Week 4: Search & Summarization
- [ ] Create SearchQueryBuilderService
- [ ] Implement incremental re-summarization
- [ ] Add auto-labeling capability

---

## 8. Conclusion

The esempio folder contains production-quality patterns that can significantly enhance MailAgent:

1. **email-agent-main**: Sophisticated triage and CRM intelligence (Python)
2. **system-prompts**: Industry-standard prompt engineering patterns
3. **Inbox Zero**: Modern email AI UX patterns (Next.js)

**Key Takeaways**:
- Multi-factor attention scoring is the #1 missing feature for smart inbox prioritization
- Our prompts are good but missing `<self_check>` and `<thinking_process>` sections
- Bulk operation safety thresholds would improve HITL user experience
- Incremental re-summarization would reduce token costs

**Estimated Total Effort**: ~1,200 LOC additions across ~8 files

---

## References

- [email-agent-main](D:\MailAgent\esempio\email-agent-main)
- [system-prompts collection](D:\MailAgent\esempio\system-prompts-and-models-of-ai-tools-main)
- [Inbox Zero (Zero-staging)](D:\MailAgent\esempio\Zero-staging)
- [Inbox Zero GitHub](https://github.com/elie222/inbox-zero)
