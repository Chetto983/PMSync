# Label-First Email Triage Roadmap

## Goal

Turn PMSync email triage into a professional operating workflow that follows this order:

1. summarize the email
2. understand intent and context
3. apply user-driven labels
4. compute score / urgency / lane
5. create follow-up only when real action or waiting state exists

This replaces the weaker pattern of scoring first and trying to infer workflow later.

## Why This Direction

PMSync already has the right product premise in [Sistema_Logico_PMS_COMPLETO](D:/MailAgent/docs/Sistema_Logico_PMS_COMPLETO.md):

- the user should manage only `Mail`, `Calendario`, `Contatti`, `Task`
- follow-ups, reminders, tickets, and operational correlation should be automatic
- the system should recognize context, connect objects, and avoid duplicates
- the user should define only a few essential rules at onboarding:
  - customer domains
  - activity keywords
  - follow-up timing

That means triage cannot just be an isolated `aiPriority` number. It must be the entry point to the operating model.

## External Benchmark Synthesis

### Beam AI

Beam's public email triage agent positions the product around:

- automatic categorization of incoming emails
- prioritization
- forwarding / auto-reply workflows
- feedback loops and self-improvement
- Gmail / Outlook integration

Useful direction:

- triage is treated as automation, not only summarization
- categorization and routing are part of the same system

Gap:

- the public template is still too high-level to define a strong inbox operating model for PMSync by itself

### Microsoft Outlook Copilot

The strongest signal from Outlook is:

- priority works better when users teach the system with phrases, not keywords
- examples like `it's from...`, `mentions...`, `contains...` outperform brittle term matching
- the system shows both summary and reasoning for why a message is important
- meeting mail, auto-generated noise, and some low-signal system mail are explicitly excluded from the main prioritization path

Design implication for PMSync:

- user label rules should be written as natural-language prompts
- score should be explainable
- some email classes should be excluded or heavily downweighted before scoring

### Shortwave

Shortwave is the clearest benchmark for label-driven triage:

- AI filters use natural-language rules
- filters can apply custom labels, archive clutter, mark important/unimportant, update todo state
- labels feed inbox splits, bundling, delivery schedules, and skip-inbox behavior
- newsletters and low-priority mail are intentionally batched instead of interrupting the user

Design implication for PMSync:

- labels must be first-class operational inputs, not decorative tags
- labels should power lanes, bundles, and downstream workflow
- low-value traffic should be deferred or visually de-emphasized

### Superhuman

Superhuman contributes two useful patterns:

- a small number of intentional inbox lanes is better than many categories
- follow-up is a second-layer workflow for resurfacing pending conversations, not the first step of triage

Design implication for PMSync:

- do not create follow-up records for every email with a non-zero score
- separate `act now` from `waiting` from `review later`

## Product Principles

1. Triage must understand context before assigning urgency.
2. Labels must come from user logic and business context, not only generic LLM taxonomies.
3. Score is a ranking layer, not the semantic meaning of the email.
4. Follow-up is created only when the email implies a real next action or waiting state.
5. System alerts, newsletters, and passive updates must not pollute human/action lanes.
6. Every result must include visible reasoning so users can trust and tune it.
7. Triage must improve from user onboarding rules and future feedback, without exposing extra complexity in the UI.

## Current PMSync Gaps

- `aiPriority` is still too central compared to user labels and context rules.
- The system already supports `aiPrompt` on labels, but the onboarding and operating model around it are still thin.
- Follow-up creation still depends too much on general actionability and not enough on explicit workflow intent.
- Notifications, release notes, CI alerts, and spam-like traffic can still compete with real customer or operational work.
- Score, labels, and follow-up are not yet presented as one coherent pipeline to the user.

## Target Operating Model

PMSync triage should operate in five layers.

### Layer 1: Summary + Intent

For every inbound email, extract:

- concise summary
- primary intent
- actor / sender class
- actionable vs informational
- deadline present or not
- waiting-for-reply signal or not

Output:

- `summary`
- `intent`
- `actionability`
- `deadlineDate`
- `waitingState`

### Layer 2: Label Engine

Apply labels in this order:

1. user-created labels with `aiPrompt`
2. onboarding rules
3. safe default labels
4. conservative heuristics only when no strong user rule applies

Expected label families:

- `Customer`
- `VIP`
- `Billing`
- `Sales`
- `Project`
- `System Alert`
- `Newsletter`
- `Waiting`
- `Action Items`
- `Review Later`

Rules:

- maximum 2-3 primary labels
- do not mix contradictory labels
- `System Alert` and `Newsletter` should heavily suppress urgency unless action is explicit
- labels should be explainable in plain language

### Layer 3: Score / Urgency / Lane

Compute score after labels are known.

Inputs:

- intent
- label set
- sender importance
- contact / company relevance
- deadline proximity
- escalation or complaint tone
- explicit request for response
- follow-up history

Outputs:

- `score`
- `urgency`
- `priorityReason`
- `lane`

Recommended default lanes:

1. `Action now`
2. `Waiting on reply`
3. `Customer / VIP`
4. `System alerts`
5. `Review later`

### Layer 4: Follow-Up Engine

Create workflow objects only when needed.

Cases:

- `TODO`: user or team must do something
- `WAITING_FOR`: user is blocked pending someone else's reply or external update
- `NONE`: no follow-up object should exist

Do not create follow-ups for:

- newsletters
- release notes
- passive monitoring alerts
- receipts / confirmations without next action
- generic updates unless tied to a real deadline or failure condition

### Layer 5: Correlation Engine

Use labels and context to connect the email to:

- contact
- company
- thread
- task
- reminder
- event
- CRM object / ticket / practice when applicable

This is the step that makes PMSync respect the operating model in `Sistema_Logico_PMS_COMPLETO.md`.

## Delivery Plan

### Phase A — Onboarding Rules

Ship a first-run triage setup in UI where the user defines only a few rules:

- important customers / domains
- important projects / keywords
- what counts as a system alert
- default follow-up timing
- custom labels with natural-language prompts

Success metric:

- a new tenant can teach triage logic in under 3 minutes

### Phase B — Label-First Backend Pipeline

Refactor backend triage flow to enforce:

- `summary -> label resolution -> score -> follow-up`
- explicit label precedence
- suppression for passive categories
- lane assignment as part of the same result

Success metric:

- spam, newsletters, and passive updates stop surfacing as urgent unless a real action signal exists

### Phase C — Professional Inbox Views

Expose triage outputs in the UI through:

- lanes
- visible reasoning
- label badges
- score explanation
- clear split between `TODO` and `WAITING_FOR`

Success metric:

- users understand what to do next without opening several widgets

### Phase D — Learning and Overrides

Add safe preference learning:

- per-user lane overrides
- phrase-based priority rules
- sender/domain memory
- `always important`, `always review later`, `always system alerts`

Success metric:

- repeated corrections visibly improve future triage

### Phase E — Validation and Scorecard

Validate with real user mailboxes:

- label-fit accuracy
- score-fit accuracy
- follow-up precision
- false-positive urgency rate
- lane consistency

Success metric:

- triage quality reaches `>= 9.5/10` on real production validation

## Execution Sprints

| Sprint | Title | SP | Goal |
|--------|-------|---:|------|
| T01 | Onboarding Rules & Label Prompt UX | 8 | collect user rules and custom labels in a first-run flow |
| T02 | Summary + Intent Extraction Contract | 5 | formalize structured triage inputs before scoring |
| T03 | Label-First Resolution Engine | 8 | enforce label precedence and contradiction handling |
| T04 | Score, Urgency & Lane Engine | 8 | compute explainable ranking after labels |
| T05 | Follow-Up Precision Pass | 5 | create `TODO` / `WAITING_FOR` only when justified |
| T06 | Correlation & Context Attachment | 5 | bind emails to tasks, reminders, events, CRM context |
| T07 | Inbox Views & Reasoning UI | 8 | make lanes, reasons, labels, and follow-up states visible |
| T08 | Feedback Learning & Overrides | 5 | user corrections feed future triage |
| T09 | Production Validation & Scorecard | 6 | live validation with real tenant mailboxes |
| **Total** | | **58** | |

## Data Contract Recommendation

Every triaged email should eventually expose a single normalized payload:

```ts
type TriageResult = {
  summary: string;
  intent: 'request' | 'update' | 'alert' | 'sales' | 'billing' | 'personal' | 'unknown';
  actionability: 'none' | 'todo' | 'waiting';
  labels: string[];
  score: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  lane: 'action-now' | 'waiting-on-reply' | 'customer-vip' | 'system-alerts' | 'review-later';
  priorityReason: string;
  followUpType: 'TODO' | 'WAITING_FOR' | null;
  followUpReason: string | null;
  deadlineDate: string | null;
  correlationHints: {
    contactId?: string;
    company?: string;
    threadId?: string;
    contextLabel?: string;
  };
};
```

## Validation Criteria

The triage pipeline is not done until all of these are measured on real mail:

- `summary quality`: did the summary preserve the real user-facing meaning?
- `label fit`: are labels coherent with user prompts and tenant rules?
- `score fit`: is urgency proportional to actual business value and action need?
- `follow-up precision`: are follow-ups created only when needed?
- `false-positive rate`: how often do passive emails become urgent?
- `lane consistency`: do similar emails land in the same operational view?

## Recommended Immediate Slice

The next implementation slice should be:

1. onboarding rules UI
2. label-first backend contract
3. lane + reasoning payload
4. live validation on the tenant's real inbox

This is the smallest slice that upgrades PMSync from generic email AI to a real inbox operating system.

## References

- Beam AI Email Triage Agent: https://beam.ai/agents/email-triage-agent/
- Beam AI Email Triage and Forwarding: https://beam.ai/lp/email-triage-and-forwarding
- Microsoft Prioritize my inbox: https://support.microsoft.com/en-us/topic/prioritize-my-inbox-65e37040-2c90-4ee3-86d9-e95d5ba0e3cb
- Outlook Focused Inbox: https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978
- Shortwave Customize your settings: https://www.shortwave.com/docs/guides/customize-your-shortwave-settings/
- Superhuman Features: https://help.superhuman.com/hc/en-us/sections/38456822930835-Features
