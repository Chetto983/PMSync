# Domain Pitfalls: Email Triage & Classification

**Domain:** AI email triage, label onboarding, classification systems
**Researched:** 2026-04-02

## Critical Pitfalls

Mistakes that cause users to abandon the feature or require architectural rework.

### Pitfall 1: Over-Classification on First Run Destroys Trust

**What goes wrong:** The system applies AI labels to all existing emails on first activation. Many classifications are wrong because the AI has no user-specific context yet. Users see their inbox covered in incorrect labels and immediately distrust the system.

**Why it happens:** Developers want to show immediate value. "Look, we labeled all your emails!" But without historical context (SaneBox scans 4-6 weeks of headers first) or sender memory, the LLM is guessing based on content alone.

**Consequences:** Users disable the feature permanently. First impressions of AI accuracy are sticky -- once a user decides "the AI is dumb," they rarely give it a second chance.

**Prevention:**

- Do NOT retroactively label all existing emails on first activation
- Start with new incoming emails only
- Retroactive labeling should be opt-in and limited (Superhuman does last 14 days only)
- Show a "confidence" indicator during the first week: "AI is still learning your preferences"
- Prioritize high-confidence classifications first (sender-based > content-based)

**Detection:** Track label correction rate in the first 7 days. If correction rate exceeds 20%, the system is over-classifying.

### Pitfall 2: Unbounded LLM Calls Per Email

**What goes wrong:** Each label with an `aiPrompt` requires an LLM call to evaluate whether the email matches. With 10 default labels + custom labels, every incoming email triggers 10-15+ LLM calls. At 200 emails/day, that is 2,000-3,000 LLM calls/day per user.

**Why it happens:** The naive implementation evaluates each label independently against each email. Superhuman caps custom AI labels at 10 for this reason.

**Consequences:**

- LLM API costs scale linearly with labels x emails
- Classification latency grows with label count (serial) or API rate limits hit (parallel)
- Mistral rate limits may throttle classification, creating backlogs

**Prevention:**

- Batch all label prompts into a single LLM call: "Given this email, which of these labels apply: [list all label prompts]"
- Use sender overrides as L1 cache to skip LLM entirely for known senders
- Cap AI-prompt labels (Superhuman: max 10)
- Use a cheaper/faster model for classification (Mistral Small) vs. the full chat model
- Consider a two-stage pipeline: fast classifier for obvious categories (Promotions, Updates) + LLM only for ambiguous emails

**Detection:** Monitor LLM API call count per email. Alert if average exceeds 3 calls/email.

### Pitfall 3: Label Soup -- Too Many Labels Per Email

**What goes wrong:** Without mutual exclusivity enforcement, an email from a customer about an invoice gets labeled: Customer + Finance + Action Items + Important + Follow-up. Five labels on one email is noise, not signal.

**Why it happens:** Each label's aiPrompt evaluates independently. A customer invoice genuinely matches all five prompts. The LLM is technically correct but practically useless.

**Consequences:**

- Smart Views show the same email in every view
- Users cannot scan their inbox because every email has a wall of label badges
- Label priority becomes meaningless when everything is labeled

**Prevention:**

- PMSync's `mutuallyExclusiveWith` rules already address this. Enforce them strictly.
- Limit max labels per email to 2-3 (one family-priority + one family-context + one family-workflow max)
- Use the taxonomy `family` field: at most one label per family
- Post-classification pruning: if email has 4+ labels, apply priority rules to reduce to 2-3
- Superhuman's approach: built-in labels only route to "Other" split; they do not stack

**Detection:** Track average labels-per-email. Alert if it exceeds 2.5.

## Moderate Pitfalls

### Pitfall 4: Sender Memory Overrides Content Signals

**What goes wrong:** User corrects one GitHub notification to "System Alert." System remembers: GitHub = System Alert. But GitHub also sends marketing emails, release announcements, and Dependabot security alerts -- all now get labeled "System Alert."

**Why it happens:** Sender memory (like Shortwave's Magic Labels) maps sender -> label. Same sender can send structurally different email types.

**Prevention:**

- Store sender overrides at the sender + subject-pattern level, not just sender alone
- Allow multiple overrides per sender (GitHub deploy notifications -> System Alert; GitHub marketing -> Promotions)
- Fall through to LLM classification when sender has multiple override patterns
- SaneBox handles this: "categorizes service emails based on both sender and subject line"

### Pitfall 5: Onboarding Wizard Asks Too Many Questions

**What goes wrong:** Wizard has 7 fields (customerDomains, importantSenders, projectTopics, systemAlertSources, billingTopics, reviewLaterTopics, followUpSlaHours). Users abandon after field 3.

**Why it happens:** The `TriageOnboardingRules` contract was designed for completeness, not UX flow. Every field is useful but not every field is essential for first-run.

**Prevention:**

- Split into required (2 fields) + optional (5 fields):
  - Required: customerDomains, importantSenders (these define the "who matters" baseline)
  - Optional: everything else (can be configured later in Settings)
- Show a "quick setup" (2 fields) vs "full setup" (7 fields) choice
- Pre-populate from existing email data: scan recent emails to suggest domains and frequent senders
- HEY's approach: onboarding teaches through the product itself (emails that explain features), not through a form wizard

### Pitfall 6: Static AI Prompts Never Improve

**What goes wrong:** The `aiPrompt` on each label is set during onboarding and never updated. As user's email patterns change, classification accuracy degrades. New senders, new topics, new projects are not reflected in prompts.

**Why it happens:** No feedback mechanism from corrections back to prompt text. Corrections update sender memory but not the underlying AI prompt.

**Prevention:**

- Track correction patterns: if users consistently remove "Important" from newsletter-type emails, flag the Important label's aiPrompt for review
- Suggest prompt refinements: "Users corrected 15 emails this week. Would you like to update the Important label criteria?"
- Do NOT auto-mutate prompts. Prompt changes can have broad, unpredictable effects. Always require user approval.
- Periodically show a "label health" report: accuracy rate, correction count, top misclassified senders

### Pitfall 7: Classification Runs After Email Is Already Read

**What goes wrong:** Email arrives, user reads it, then classification runs 30 seconds later and adds labels. The label arrives too late to be useful for triage decisions.

**Why it happens:** Classification is async (BullMQ job) and may be delayed by queue depth or LLM latency. Email sync and classification are separate pipelines.

**Prevention:**

- Classify BEFORE the email appears in the inbox view (block rendering until classification completes, with a timeout)
- Or: classify speculatively during sync and cache the result
- Sender override lookups are instant -- use them as the fast path for known senders
- Set a classification SLA: if LLM does not respond within 3 seconds, show email without labels and classify in background
- Shortwave and Superhuman classify during sync, before the email hits the inbox view

## Minor Pitfalls

### Pitfall 8: Users Cannot Understand Why a Label Was Applied

**What goes wrong:** Email is labeled "Important" but user does not understand why. No explanation is provided. User loses trust in the AI.

**Prevention:**

- Store a brief classification reason with each label assignment (e.g., "Matched: sender is in your customer domains list")
- Show reason on hover or in email detail view
- Superhuman does not do this. It is a differentiation opportunity.

### Pitfall 9: Retroactive Labeling Creates Notification Storm

**What goes wrong:** User creates a new label, system retroactively labels 14 days of emails. Each label triggers a notification/badge update. User's inbox badge shows 200+ "new" items.

**Prevention:**

- Retroactive labeling must be silent -- no notifications, no badge updates
- Only update the label assignment in the database, not the email's read/unread status
- Log retroactive labeling as a batch operation, not individual events

### Pitfall 10: Multi-Label Display Clutters the Email List

**What goes wrong:** Email list shows all labels as badges. With 2-3 labels per email, the list becomes unreadable. Badge colors compete for attention.

**Prevention:**

- Show only the highest-priority label badge in the list view (use family priority: priority > workflow > context > semantic > suppression)
- Show all labels in the email detail view
- Use the `defaultLane` to determine which Smart View "owns" the email, regardless of other labels

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Smart Views UI | Label soup makes every view show every email (Pitfall 3) | Enforce mutual exclusivity; show email in primary lane only |
| Onboarding Wizard | Too many fields causes abandonment (Pitfall 5) | 2-field quick setup + optional full setup |
| Auto-Apply on Ingest | LLM cost explosion (Pitfall 2) | Batch prompts into single call; sender override cache |
| Auto-Apply on Ingest | Classification arrives after user reads email (Pitfall 7) | Classify during sync, before inbox render |
| Feedback Loop | Static prompts degrade over time (Pitfall 6) | Track corrections; suggest prompt updates |
| Feedback Loop | Sender memory too coarse (Pitfall 4) | Sender + subject-pattern overrides |
| First Activation | Over-classification destroys trust (Pitfall 1) | New emails only; limited retroactive opt-in |
| Label Display | Multi-label badge clutter (Pitfall 10) | Show primary label only in list view |

## Sources

- [Superhuman Auto Labels (max 10 custom)](https://help.superhuman.com/hc/en-us/articles/40127432866323-Auto-Labels) -- Official help docs
- [SaneBox training approach](https://www.sanebox.com/help/186-how-does-sanebox-determine-trainings) -- Official help
- [SaneBox sender + subject classification](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox) -- Official help
- [HEY onboarding teardown](https://productled.com/blog/hey-onboarding-teardown) -- Third-party analysis
- [Shortwave Magic Labels](https://www.shortwave.com/blog/magic-labels-custom-bundles/) -- Official blog
- PMSync codebase: `triage-onboarding.contract.ts` (7 onboarding fields), `default-user-labels.ts` (10 defaults with taxonomy), `email-analysis.service.ts` (classification pipeline)
