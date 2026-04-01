# Label-First Email Triage Research

**Researched:** 2026-04-01
**Domain:** Email triage pipeline architecture, LLM-driven classification, inbox workflow
**Confidence:** MEDIUM-HIGH (verified against production competitors, PMSync codebase, and LLM provider docs)

## Summary

This document covers ten research areas for evolving PMSync from basic AI triage (score + labels + follow-up) into a label-first professional inbox operating model. The research draws from Superhuman, Shortwave, Spark, SaneBox, Outlook Copilot, and Beam AI as external benchmarks, cross-referenced with PMSync's existing codebase and Mistral AI's structured output capabilities.

The core finding is that PMSync already has most of the right primitives -- `aiPrompt` on labels, triage onboarding rules, a unified LLM call, follow-up detection, and sender behavior learning. What it lacks is (1) enforced pipeline ordering where labels genuinely precede scoring, (2) lane assignment as a first-class output, (3) stronger follow-up gating, and (4) a feedback loop that closes the distance between user corrections and future triage behavior.

**Primary recommendation:** Enforce the five-layer pipeline contract (summarize, intent, labels, score+lane, follow-up) in the backend, expose lanes in the frontend, and measure with per-label precision/recall on real tenant mail before tuning further.

---

## 1. Email Triage Pipeline Architecture

### How Modern Apps Structure Their Pipelines

**Superhuman** runs a two-stage pipeline: first, classify email as human vs automated (drives Important/Other split), then apply user-defined custom splits on top. Scoring and urgency are implicit -- the split placement IS the priority signal. No numeric score is shown to users.

**Shortwave** uses a RAG-backed architecture with server-side GPU clusters and vector databases. Emails are grouped into smart bundles (newsletters, updates, promotions, travel) automatically, then AI-powered filters apply user-defined natural-language rules. Classification happens at ingestion time, not on-demand.

**Spark** uses a three-tier auto-sort: Personal (from real humans), Notifications (transactional/system), Newsletters (marketing/digest). Priority contacts are layered on top as a user override. The categorization is deterministic heuristics first, ML second.

**Outlook Copilot (Prioritize My Inbox)** uses a three-priority model (High/Medium/Low) where the LLM scores email importance based on user-taught natural-language rules. It processes meeting mail and auto-generated noise separately, explicitly excluding them from the main prioritization path.

**SaneBox** learns from user behavior signals (open rate, reply rate, response time, deletion patterns) and sorts into SaneBox folders. The algorithm is purely behavioral -- no content analysis initially, content analysis added later as a secondary signal.

**Beam AI** positions triage as automation (categorize, prioritize, route/forward, auto-reply) with a feedback loop for self-improvement. The pipeline is categorization first, then prioritization, then action.

### Optimal Ordering

Every serious competitor follows some variant of: **understand content first, classify second, score third, act fourth**. No production system scores first and then tries to infer meaning.

**Recommended pipeline order for PMSync:**

```
1. SUMMARIZE    -- extract concise summary (2-3 sentences)
2. INTENT       -- classify intent + extract signals (deadline, escalation, waiting state)
3. LABELS       -- apply user-driven labels using aiPrompt rules + taxonomy constraints
4. SCORE + LANE -- compute urgency/priority AFTER labels are resolved; assign inbox lane
5. FOLLOW-UP    -- create TODO/WAITING_FOR only when justified by intent + labels
```

**Parallel vs sequential:** Steps 1-2 can be done in a single LLM call (PMSync already does this). Step 3 (label resolution) must happen before step 4 (score) because labels suppress or amplify urgency. Step 5 depends on both labels and score. The current PMSync implementation does all of this in one LLM call but then post-processes labels and signals in `normalizeTriageSignals()` -- this is architecturally sound.

**Confidence:** HIGH -- every benchmark confirms this ordering.

### Current PMSync State

PMSync already uses a single unified LLM call (`analyzeEmailUnified`) that returns summary, intent, labels, priority, urgency, follow-up signals in one pass. Post-processing in `normalizeTriageSignals()` already suppresses urgency for passive labels. The architecture is correct. What's missing:
- Lane assignment is not computed (no `lane` field in output)
- The contract is not strictly enforced -- the LLM can return any priority, and suppression is heuristic-based regex
- Label rules from the taxonomy (mutual exclusivity, suppression families) are not enforced in code

---

## 2. Label/Category Systems

### Operational Labels vs Decorative Tags

The distinction that separates professional email apps from basic tagging:

| Property | Operational Label | Decorative Tag |
|----------|------------------|----------------|
| Drives routing | Yes (determines lane, visibility, urgency) | No |
| Has rules | Yes (aiPrompt, mutual exclusivity) | No |
| Affects scoring | Yes (suppression families) | No |
| Limited count | Yes (max 2-3 per email) | No (unlimited) |
| User-taught | Yes (natural language prompts) | Sometimes |

**Optimal number of categories:** Superhuman uses 2-4 splits (Important, Other, News, Calendar). Spark uses 3 (Personal, Notifications, Newsletters) + Priority overlay. Shortwave uses up to 50 AI filters but bundles them visually into ~5-7 groups. Outlook uses 3 priority levels.

**Recommendation for PMSync:** 9 labels (already defined in `TRIAGE_LABEL_TAXONOMY`) organized into 5 families is the right number. The taxonomy already has mutual exclusivity rules and suppression flags. The gap is enforcement -- the code doesn't reject contradictory label combinations.

### Label Families and Mutual Exclusivity

PMSync's current taxonomy (`triage-onboarding.contract.ts`) defines five families:

| Family | Labels | Behavior |
|--------|--------|----------|
| priority | Important | Amplifies urgency |
| workflow | Follow-up, Action Items | Drives TODO/WAITING_FOR creation |
| semantic | Finance | Domain-specific routing |
| context | Customer, System Alert | Modifies score interpretation |
| suppression | Promotions, Updates, Review Later | Reduces urgency, blocks follow-up |

**Key rules already defined but not enforced in code:**
- Promotions is mutually exclusive with Important, Follow-up, Action Items, Customer
- Review Later is mutually exclusive with Important, Action Items, Follow-up
- System Alert suppresses urgency unless action is explicit
- Maximum 2-3 labels per email

**Recommendation:** Add a `validateLabelCombination()` function after LLM returns labels, before persisting. Drop contradictory labels using family priority: suppression < context < semantic < workflow < priority.

**Confidence:** HIGH -- taxonomy is already designed, needs code enforcement.

---

## 3. Intent Extraction

### Intent Taxonomy

PMSync currently uses these intent values:

```
action_required | fyi | question | meeting_request | follow_up | escalation | feedback
```

This is a reasonable taxonomy. Production email classifiers (from Label Your Data, SCIMUS, and the academic literature) converge on similar categories with minor variations:

| PMSync Intent | Production Equivalent | Notes |
|---------------|----------------------|-------|
| action_required | request, task, approval | PMSync groups these; could split later |
| fyi | informational, update, notification | Good catch-all |
| question | inquiry, clarification | Correct |
| meeting_request | scheduling, calendar | Correct |
| follow_up | waiting, reminder, check-in | Correct |
| escalation | complaint, urgent, threat | Correct |
| feedback | review, survey, NPS | Correct |

**Missing intents worth adding:**
- `alert` -- system/operational alerts (distinct from escalation which implies human conflict)
- `billing` -- financial transactions (invoices, receipts, payment requests)
- `introduction` -- networking, warm intros (low urgency, high relationship value)

**Prompt engineering for intent:**

The key insight from production systems is that intent should be extracted from the email body, not just subject/sender. The current PMSync prompt asks the LLM to return `intent` as part of the unified analysis, which is correct. The prompt could be strengthened by:

1. Defining each intent explicitly in the system prompt (currently only listed as options)
2. Adding negative examples for common confusion cases:
   - Newsletter with "action required" subject line -- still FYI
   - GitHub notification about a failed build -- alert, not escalation
   - Invoice PDF attachment -- billing, not action_required (unless overdue)

**Structured output schema for intent:**

```json
{
  "intent": "action_required",
  "intentConfidence": 0.85,
  "intentSignals": ["explicit deadline mentioned", "asks for approval"],
  "actionability": "todo"
}
```

**Confidence:** MEDIUM -- the taxonomy is solid, but the prompt strengthening is based on general best practices, not Mistral-specific testing.

---

## 4. Urgency Scoring After Labels

### Current State

PMSync computes priority (1-5) and urgency (critical/high/medium/low) in the LLM call, then post-processes in `normalizeTriageSignals()`:
- If passive notification: clamp priority to 3+ (never urgent), suppress follow-up
- If promotional: clamp priority to 4+ (always low), suppress follow-up
- If actionable system alert: boost to priority 2 or higher

This is close but not fully label-subordinate. The LLM can still return priority=1 for a newsletter, and the post-processing catches it with regex. This is fragile.

### Recommended Approach: Score = f(labels, signals, sender)

```
base_score = LLM_raw_priority (1-5)
label_modifier = sum of label weights:
  - suppression labels: +2 (lower priority, higher number = less urgent)
  - context labels (Customer): -1 (boost)
  - workflow labels (Action Items): -0.5 (slight boost)
  - no labels matched: +0.5 (slight penalty for unclassifiable)
sender_modifier = from TriageLearningService:
  - high reply rate sender: -0.5
  - high archive-without-reply sender: +1
  - VIP/important sender: -1
deadline_modifier:
  - has deadline within 24h: -2
  - has deadline within 7d: -1
  - no deadline: 0
escalation_modifier:
  - escalation risk: -1.5
final_score = clamp(base_score + label_modifier + sender_modifier + deadline_modifier + escalation_modifier, 1, 5)
```

### Explainable Reasoning

Every scoring decision should produce a human-readable `priorityReason`. PMSync already has the `reasoning` field. The improvement is to make it structured:

```typescript
interface PriorityExplanation {
  baseScore: number;
  factors: Array<{
    factor: string;    // "label:Promotions", "sender:VIP", "deadline:24h"
    weight: number;    // -1.5, +2, etc.
    reason: string;    // "Promotional email suppresses urgency"
  }>;
  finalScore: number;
  lane: string;
}
```

### Lane Assignment

Lane is a direct function of labels + urgency. The mapping:

| Primary Signal | Lane |
|---------------|------|
| urgency=critical OR urgency=high + Action Items | `action-now` |
| Follow-up label + intent=follow_up | `waiting-on-reply` |
| Customer label OR VIP sender | `customer-vip` |
| System Alert label | `system-alerts` |
| suppression label OR urgency=low | `review-later` |
| Default (no strong signal) | `action-now` if urgency>=medium, else `review-later` |

**Confidence:** MEDIUM -- the factor weighting needs real-data calibration.

---

## 5. Follow-up Precision

### Current Problem

PMSync's `TriageActionService.shouldCreateFollowUp()` uses a combination of:
- `needsFollowUp` flag from LLM
- `hasDeadline` flag from LLM
- Label-based gating (action/follow-up labels required)
- Regex-based passive notification detection
- Critical incident keyword override

This already substantially reduces false positives compared to the naive approach. The remaining gap is:
- LLM over-triggers `needsFollowUp=true` for informational emails with vaguely actionable language
- No distinction between "I need to do something" (TODO) vs "I'm waiting for someone else" (WAITING_FOR) at the LLM level -- this is determined post-hoc by checking if the sender is the user

### When to Create Each Type

| Follow-up Type | Create When | Do NOT Create When |
|---------------|-------------|-------------------|
| **TODO** | Explicit ask directed at user, approval needed, deliverable with deadline | Newsletter mentions "try this", generic "let us know", system notification |
| **WAITING_FOR** | User sent email and expects response, user delegated task, pending external approval | Auto-reply received, confirmation email, read receipt |
| **NONE** | Informational update, newsletter, receipt, announcement, passive alert, completed conversation | -- |

### False Positive Reduction Strategies

1. **Two-signal rule:** Require BOTH `needsFollowUp=true` from LLM AND at least one of: explicit action label, explicit action intent, or hasDeadline. PMSync already does a version of this.

2. **Confidence gating:** Only create follow-up when `confidence >= 0.6`. Currently PMSync stores confidence but doesn't gate on it.

3. **Sender class filtering:** Auto-generated senders (noreply@, notifications@, github-noreply@) should NEVER create follow-ups unless the email contains a critical incident keyword. PMSync partially does this with regex.

4. **Recency check:** Don't create WAITING_FOR for threads where the most recent message is from someone else (conversation already continued).

5. **LLM prompt improvement:** Ask the LLM to explicitly output `followUpType: "TODO" | "WAITING_FOR" | "NONE"` instead of a boolean `needsFollowUp`. This moves the classification upstream.

### Recommended Prompt Addition

```
For follow-up, determine:
- "TODO" = the recipient must take a specific action (reply, approve, deliver, decide)
- "WAITING_FOR" = the sender is waiting for someone else to respond or deliver
- "NONE" = no follow-up needed (informational, completed, passive)

Set followUpType to NONE for: newsletters, receipts, confirmations without next steps,
release notes, routine notifications, and automated alerts without explicit action.
```

**Confidence:** HIGH -- the patterns are well-understood, and PMSync's existing gating is close.

---

## 6. Onboarding Rules UX

### How Competitors Handle It

**Outlook Copilot:** Settings > Copilot > Prioritize. Users type natural language phrases like "emails from my manager about Project Alpha with Excel attachments." The system explicitly says it works better with phrases than keywords. Starting rules are provided, user customizes.

**Shortwave:** AI filters use natural-language conditions. Up to 50 filters on premium plans. Each filter can apply labels, archive, mark important/unimportant, update todo state. The UX is a text field per filter with a natural-language description of what should match.

**Superhuman:** Split Inbox Library with 60+ pre-built configurations. Three-click setup. Custom splits define conditions based on people and subject keywords, not natural language. Simpler but less flexible than Shortwave.

**SaneBox:** No explicit rule teaching. Learns entirely from behavior. Users correct by moving emails between folders. Zero onboarding friction but slow to converge.

**Spark:** No explicit teaching. Auto-categorizes from day one. Users can pin priority contacts. Minimal onboarding.

### PMSync's Current Approach

PMSync has `TriageOnboardingRulesInput` with 7 fields:
- customerDomains (list)
- importantSenders (list)
- projectTopics (list)
- systemAlertSources (list)
- billingTopics (list)
- reviewLaterTopics (list)
- followUpSlaHours (number)

This is already more structured than most competitors. The `buildRecommendedLabelSet()` function converts these rules into `aiPrompt` strings for each label. This is architecturally strong.

### Recommendations

1. **Natural language + structured hybrid:** Keep the structured fields (domains, senders) for precise matching. Add a free-text "additional instructions" field per label, similar to Shortwave's AI filter text. PMSync already has `aiPrompt` on labels -- expose it in the onboarding UI.

2. **Progressive disclosure:** Start with 3 essential fields (customer domains, important senders, system alert sources). Show advanced fields (billing, review later, follow-up SLA) as expandable sections.

3. **Pre-populated suggestions:** After connecting email, scan the first 50 emails to suggest: top senders (by reply frequency), likely customer domains, likely system senders (noreply@, github-noreply@). Let user confirm/edit.

4. **Teaching by example:** When user moves an email to a different lane or changes a label, offer "Always do this for emails from [sender]?" or "Always do this for emails about [topic]?" -- similar to SaneBox's implicit learning but with explicit confirmation.

**Confidence:** HIGH -- PMSync's foundation is already strong, recommendations are incremental.

---

## 7. Lane/Split Inbox Architecture

### Database Schema Patterns

**Option A: Computed lane (recommended for PMSync)**

Lane is computed at triage time and stored on the Email table:

```sql
ALTER TABLE "Email" ADD COLUMN "lane" TEXT;
-- Values: 'action-now', 'waiting-on-reply', 'customer-vip', 'system-alerts', 'review-later'
CREATE INDEX "idx_email_lane_tenant" ON "Email" ("tenantId", "lane", "receivedAt" DESC);
```

Lane is re-computed whenever labels or urgency change. This is how Superhuman works -- splits are computed properties, not manually assigned folders.

**Option B: User-defined split rules (like Superhuman custom splits)**

```sql
CREATE TABLE "InboxSplit" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "orderIndex" INT NOT NULL,
  "filterRules" JSONB NOT NULL, -- { senders: [], labels: [], domains: [], keywords: [] }
  "isDefault" BOOLEAN DEFAULT false
);
```

**Recommendation:** Start with Option A (computed lane). It's simpler, consistent with the label-first pipeline, and can be extended to Option B later. Superhuman started with Important/Other (computed) and added custom splits later.

### Frontend Rendering

**Tab-based lanes (like Superhuman):**

```typescript
// Lanes as tabs in the email list view
const INBOX_LANES = [
  { id: 'action-now', label: t.inbox.lanes.actionNow, icon: 'priority_high' },
  { id: 'waiting-on-reply', label: t.inbox.lanes.waiting, icon: 'hourglass' },
  { id: 'customer-vip', label: t.inbox.lanes.customerVip, icon: 'star' },
  { id: 'system-alerts', label: t.inbox.lanes.systemAlerts, icon: 'notifications' },
  { id: 'review-later', label: t.inbox.lanes.reviewLater, icon: 'schedule' },
] as const;

// Query hook: fetch emails by lane
const useEmailsByLane = (lane: string) =>
  useQuery(emailApi.listByLane(lane));
```

**Keyboard navigation:** Tab/Shift+Tab to switch lanes (Superhuman pattern). This fits PMSync's keyboard-driven UX.

**Badge counts:** Show unread count per lane in the tab. Suppress counts for `review-later` (reduces noise).

**Confidence:** HIGH -- the pattern is well-established across competitors.

---

## 8. Learning and Feedback Loops

### Current PMSync State

`TriageLearningService` already:
- Records implicit signals (reply, archive, delete, flag, forward)
- Computes per-sender behavior scores (reply rate, archive rate, response time)
- Uses EMA blending for score updates
- Stores in Redis with 30-day TTL
- Respects privacy consent gates

This is a solid behavioral learning foundation, similar to SaneBox's approach.

### What's Missing

1. **Label correction learning:** When a user manually changes a label on a triaged email, that should feed back into the system. Currently, label changes invalidate the analysis cache but don't adjust future behavior.

2. **Lane override learning:** When a user moves an email from one lane to another (e.g., drags from "review-later" to "action-now"), that's a strong correction signal.

3. **Follow-up dismissal learning:** When a user dismisses a follow-up as unnecessary, that should reduce future follow-up creation for similar senders/topics.

### Bounded vs Unbounded Learning

**Bounded (recommended):** Learning affects a fixed set of parameters with hard limits:
- Per-sender importance weight: [-2, +2]
- Per-label accuracy adjustment: [-0.5, +0.5]
- Per-domain classification bias: suppression/priority/neutral

**Unbounded (avoid):** Learning that modifies the LLM prompt itself, adds/removes label rules dynamically, or changes the pipeline behavior in ways that compound unpredictably.

### Recommended Feedback Signals

| User Action | Signal Type | What It Teaches |
|------------|-------------|-----------------|
| Move email between lanes | Lane preference | "This sender/topic belongs in X lane" |
| Add/remove label manually | Label correction | "LLM was wrong about this label" |
| Dismiss follow-up | Follow-up precision | "Don't create follow-ups for this type" |
| Reply quickly (< 1h) | Sender importance | "This sender is high priority" |
| Archive without reading | Sender importance | "This sender is low priority" |
| Star/flag email | Urgency override | "This was more important than scored" |

### Privacy Considerations

PMSync already has the right privacy architecture:
- Consent gate (`ai_auto_triage` consent required)
- Behavioral tracking toggle (`aiBehavioralTrackingEnabled`)
- Data stored in Redis with TTL (not permanent)
- No PII in learning signals (only sender email + signal type)

**Additional recommendation:** Add a "forget me" endpoint that clears all sender scores for a tenant, for GDPR right-to-erasure compliance.

**Confidence:** HIGH -- the foundation exists, recommendations are incremental.

---

## 9. LLM Prompt Patterns for Triage

### Current PMSync Prompt Structure

The `analyzeUnified.systemPrompt` in `en.ts` is well-structured:
- 10-step instruction set
- `<ALLOWED_LABELS>` block with label names
- `<LABEL_RULES>` block with per-label aiPrompt (injected dynamically)
- `<OUTPUT_FORMAT>` block with JSON schema
- Confidence calibration guide
- Temperature: 0.1 (correct for classification)
- Max tokens: 800

### What Works Well

1. Single LLM call for all dimensions (saves cost and latency)
2. Explicit label constraint (only allowed labels can be returned)
3. Per-label instructions via `<LABEL_RULES>` (user-customizable)
4. Low temperature (0.1) for deterministic output
5. Explicit negative instructions ("do NOT create follow-up for newsletters")

### What Could Be Improved

**1. Enforce pipeline ordering in the prompt:**

Currently the instructions say "read, summarize, label, score" but the LLM generates everything at once. Add explicit ordering guidance:

```
CRITICAL: Generate your response in this exact order:
1. First, write the summary.
2. Based on the summary, determine intent.
3. Based on intent + email content, select labels using LABEL_RULES.
4. Based on labels + intent, compute priority and urgency.
   - If labels include Promotions, Updates, or Review Later: urgency MUST be "low" or "medium"
   - If labels include Important + Customer: urgency SHOULD be "high" or "critical"
5. Based on everything above, decide followUpType.
```

**2. Add the `lane` field to the output schema:**

```json
"lane": "action-now|waiting-on-reply|customer-vip|system-alerts|review-later"
```

**3. Replace boolean follow-up with enum:**

```json
"followUpType": "TODO|WAITING_FOR|NONE",
"followUpReason": "string or null"
```

**4. Add `intentConfidence` for two-signal gating:**

```json
"intentConfidence": 0.0-1.0
```

**5. Add label-urgency constraint rules directly in the prompt:**

```
<URGENCY_CONSTRAINTS>
- If ANY label is in the suppression family (Promotions, Updates, Review Later):
  urgency MUST be "low" or "medium", NEVER "high" or "critical"
- If label "Important" is applied: urgency SHOULD be "high" or "critical"
- If label "Customer" + intent "escalation": urgency MUST be "critical"
</URGENCY_CONSTRAINTS>
```

### Token Efficiency

Current prompt uses ~800 output tokens. With the additions above, estimate ~900 tokens. At Mistral Small pricing ($0.1/1M input, $0.3/1M output), this is approximately $0.0003 per email. For 20 emails/batch, that's $0.006 per triage run. Acceptable.

### Mistral Structured Output

Mistral supports native `response_format: { type: 'json_schema' }` which guarantees schema conformance. PMSync currently relies on prompt-based JSON and manual parsing. Switching to Mistral's native structured output would:
- Eliminate JSON parsing errors
- Guarantee correct field types
- Reduce prompt tokens (no need for `<OUTPUT_FORMAT>` block)

**However:** Verify that Mistral Small supports `json_schema` mode (not just `json_object`). The distinction matters -- `json_object` only guarantees valid JSON, `json_schema` guarantees schema conformance.

**Confidence:** MEDIUM -- prompt improvements are based on best practices, but the specific impact on Mistral Small's behavior needs real testing.

---

## 10. Production Validation

### Metrics to Track

| Metric | What It Measures | Target | How to Measure |
|--------|-----------------|--------|----------------|
| **Label precision** | Are assigned labels correct? | >= 85% | Human review of sample |
| **Label recall** | Are correct labels assigned? | >= 80% | Human review of sample |
| **Urgency calibration** | Does urgency match business value? | < 10% false-high | Count urgency overrides |
| **Follow-up precision** | Are follow-ups justified? | >= 90% | Count dismissals / total |
| **Follow-up recall** | Are needed follow-ups created? | >= 75% | Count manual follow-up creates |
| **Lane consistency** | Do similar emails land in same lane? | >= 90% | Compare same-sender emails |
| **Summary quality** | Does summary capture the point? | >= 90% | Human review |
| **False-positive urgency rate** | Newsletters/spam marked urgent | < 5% | Automated check |

### Measurement Approach

**Automated metrics (run daily):**
```bash
node scripts/validate-ai-features-production.mjs \
  --dim=categorize,priority,follow-up-detection,triage,briefing
```

PMSync already has this script. Extend it to track:
- Per-label precision (count of label corrections / total label assignments)
- Follow-up dismissal rate (dismissed / total created)
- Lane override rate (manually moved / total lane assignments)

**Human review (run weekly on sample):**
- Pull 50 random triaged emails per tenant
- For each: verify summary accuracy, label correctness, urgency appropriateness, follow-up justification
- Score each dimension 0-1, compute averages

**Confusion matrix per label:**
For each label, track:
- True positive: LLM assigned label, human agrees
- False positive: LLM assigned label, human disagrees
- False negative: LLM missed label, human would have assigned it
- True negative: LLM didn't assign, human agrees

### A/B Testing

For triage changes, use a **shadow mode** approach:
1. Run old pipeline and new pipeline on same emails
2. Store both results (only old results are shown to user)
3. Compare metrics between old and new
4. Switch to new when metrics are equal or better

This avoids disrupting user experience during testing.

### Regression Testing

**Before any prompt change:**
1. Run triage on a fixed set of 100 test emails (mix of categories)
2. Compare label assignments, urgency scores, follow-up decisions
3. Flag any email where urgency increased by 2+ levels or follow-up flipped
4. Manual review of all flipped results before deploying

**Confidence:** HIGH -- standard ML evaluation practices applied to the email domain.

---

## Appendix A: Recommended Data Contract Update

The `TriageResult` interface should evolve to include lane and structured follow-up:

```typescript
interface TriageResultV2 {
  // Layer 1: Summary + Intent
  summary: string;
  intent: 'action_required' | 'fyi' | 'question' | 'meeting_request'
    | 'follow_up' | 'escalation' | 'feedback' | 'alert' | 'billing' | 'introduction';
  intentConfidence: number;

  // Layer 2: Labels (from user-driven rules)
  labels: string[];          // max 3, from allowed label set
  labelFamily: string[];     // corresponding families for each label

  // Layer 3: Score + Lane
  priority: 1 | 2 | 3 | 4 | 5;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  lane: 'action-now' | 'waiting-on-reply' | 'customer-vip' | 'system-alerts' | 'review-later';
  priorityReason: string;
  priorityFactors: Array<{ factor: string; weight: number; reason: string }>;

  // Layer 4: Follow-up
  followUpType: 'TODO' | 'WAITING_FOR' | null;
  followUpReason: string | null;
  followUpDueDate: string | null;

  // Metadata
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  tone: string;
  escalationRisk: boolean;
  hasDeadline: boolean;
  deadlineDate: string | null;
  keyTopics: string[];
  confidence: number;
  reasoning: string;
}
```

## Appendix B: Prompt Template Recommendation

```
You are an expert email analyst. Analyze this email and return a complete JSON analysis.

<PIPELINE_ORDER>
Follow this exact reasoning order:
1. SUMMARIZE: Write a 2-3 sentence summary capturing the main point.
2. INTENT: Classify the primary intent based on the email content.
3. LABELS: Select up to 3 labels from ALLOWED_LABELS using LABEL_RULES.
4. SCORE: Compute priority and urgency AFTER considering labels.
5. FOLLOW-UP: Determine follow-up type AFTER considering labels and intent.
</PIPELINE_ORDER>

<ALLOWED_LABELS>
${allowedLabels}
</ALLOWED_LABELS>

${labelRules}

<URGENCY_CONSTRAINTS>
- Suppression labels (Promotions, Updates, Review Later) force urgency to "low" or "medium"
- "Important" label suggests urgency "high" or "critical"
- "Customer" + "escalation" intent forces urgency "critical"
- "System Alert" alone does NOT force high urgency unless action is explicitly required
</URGENCY_CONSTRAINTS>

<FOLLOW_UP_RULES>
- "TODO": The email recipient must take a specific action (reply, approve, deliver, decide)
- "WAITING_FOR": The sender is waiting for someone else to respond or deliver
- "NONE": No follow-up needed
Set NONE for: newsletters, receipts, confirmations, release notes, routine notifications, automated alerts without explicit action.
</FOLLOW_UP_RULES>

<OUTPUT_FORMAT>
Reply ONLY with valid JSON:
{
  "summary": "string",
  "intent": "action_required|fyi|question|meeting_request|follow_up|escalation|feedback|alert|billing",
  "intentConfidence": 0.0-1.0,
  "labels": ["label1", "label2"],
  "priority": 1-5,
  "urgency": "critical|high|medium|low",
  "lane": "action-now|waiting-on-reply|customer-vip|system-alerts|review-later",
  "sentiment": "positive|negative|neutral|mixed",
  "tone": "formal|casual|urgent|friendly|cold|assertive",
  "escalationRisk": true|false,
  "hasDeadline": true|false,
  "deadlineDate": "ISO string or null",
  "followUpType": "TODO|WAITING_FOR|null",
  "followUpReason": "string or null",
  "followUpDueDate": "ISO string or null",
  "keyTopics": ["topic1", "topic2"],
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of priority assessment"
}
</OUTPUT_FORMAT>
```

## Appendix C: Competitor Summary Table

| Feature | Superhuman | Shortwave | Spark | Outlook Copilot | SaneBox | PMSync (current) | PMSync (target) |
|---------|------------|-----------|-------|-----------------|---------|------------------|-----------------|
| Auto-categorization | Yes (human vs auto) | Yes (bundles) | Yes (3-tier) | Yes (High/Med/Low) | Yes (behavioral) | Yes (LLM labels) | Yes (label-first) |
| User-defined rules | Custom splits | AI filters (NL) | Priority contacts | NL phrases | Folder moves | aiPrompt labels | aiPrompt + onboarding |
| Urgency scoring | Implicit (split) | No explicit score | No explicit score | High/Med/Low | Implicit (folder) | 1-5 + urgency enum | 1-5 subordinate to labels |
| Lanes/Splits | 3-7 tabs | Bundles | 3 sections + Priority | 3 priorities | Folders | None | 5 lanes |
| Follow-up tracking | Yes (reminders) | Yes (todo/done) | Yes (follow-up) | No (Copilot only) | SaneReminder | Yes (TODO/WAITING) | Yes (gated, precise) |
| Learning from behavior | No | Limited | No | Limited | Core feature | Yes (sender scores) | Yes (+ label/lane corrections) |
| Explainable reasoning | No | No | No | Brief reason | No | Yes (reasoning field) | Yes (structured factors) |

---

## Sources

### Primary (HIGH confidence)
- PMSync codebase: `email-analysis.service.ts`, `triage-onboarding.contract.ts`, `triage-action.service.ts`, `triage-learning.service.ts`, `default-user-labels.ts`, `en.ts` locale
- PMSync roadmap: `04-LABEL-FIRST-EMAIL-TRIAGE-ROADMAP.md`, `05-LABEL-FIRST-TRIAGE-EXECUTION-ROADMAP.md`
- [Mistral AI Structured Output docs](https://docs.mistral.ai/capabilities/structured_output)
- [Superhuman Default Split Inbox](https://help.superhuman.com/hc/en-us/articles/38458392810643-Default-Split-Inbox)
- [Superhuman Custom Split Inbox](https://help.superhuman.com/hc/en-us/articles/38458483333907-Custom-Split-Inbox)
- [Microsoft Prioritize My Inbox](https://support.microsoft.com/en-us/topic/prioritize-my-inbox-65e37040-2c90-4ee3-86d9-e95d5ba0e3cb)
- [Spark Smart Inbox](https://sparkmailapp.com/features/smart_inbox)

### Secondary (MEDIUM confidence)
- [SaneBox AI algorithm behavior](https://www.digitoolsadvice.com/2026/02/how-sanebox-uses-ai-to-organize-and.html)
- [Shortwave AI features review](https://get-alfred.ai/blog/is-shortwave-worth-it)
- [Superhuman split inbox blog](https://blog.superhuman.com/how-to-split-your-inbox-in-superhuman/)
- [Practical365 - Prioritize My Inbox](https://practical365.com/prioritize-my-inbox/)
- [Google ML - Classification metrics](https://developers.google.com/machine-learning/crash-course/classification/accuracy-precision-recall)
- [Structured JSON prompting guide](https://www.learnwithparam.com/blog/prompt-engineering-structured-json-output)

### Tertiary (LOW confidence -- needs validation)
- [Beam AI Email Triage Agent](https://beam.ai/agents/email-triage-agent/) -- marketing material, architecture details sparse
- Intent classification taxonomy recommendations (synthesized from multiple sources, not from a single authoritative reference)
- Token cost estimates for Mistral Small (based on published pricing, actual costs may vary)
