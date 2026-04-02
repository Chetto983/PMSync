# Architecture Patterns: Email Triage & Classification

**Domain:** AI email triage, label onboarding, classification systems
**Researched:** 2026-04-02
**Confidence:** MEDIUM-HIGH (competitor patterns from public docs; PMSync internals from codebase)

## Competitor Architecture Patterns

### Pattern 1: Preset + AI-Prompt Labels (Superhuman Model)

**How it works:**
- Built-in labels (Marketing, Pitch, Social, News) are always-on with pre-baked classification logic
- Custom labels use either deterministic criteria (From, To, Subject) OR natural language AI prompts
- AI prompts evaluate email content, subject, sender, and recipients -- NOT metadata like timestamps or attachment count
- Labels feed into Split Inbox views: emails matching certain labels route to "Other" split by default
- Users can override: move email between splits, which trains the sender/domain mapping

**Onboarding:**
- Zero-config for built-in labels (auto-applied from day 1)
- Custom labels require manual setup: Settings > Auto Labels > Build Your Own
- AI prompts are free-text with guidance: "be explicit", "use examples", "iterate on misclassifications"
- Last 14 days of emails are retroactively labeled when a new Auto Label is created

**Key design decisions:**
- Max 10 custom AI-prompt labels (prevents prompt explosion and cost scaling)
- AI prompts cannot reference email metadata (unread status, timestamp, attachments, CRM data)
- Built-in labels are NOT editable -- ensures consistent baseline across all users
- Custom labels can be combined with deterministic AND/OR criteria

**Relevance to PMSync:**
PMSync's `aiPrompt` field on labels is directly comparable. PMSync is more advanced: it has `family`, `mutuallyExclusiveWith`, `suppressUrgency`, and `defaultLane` -- metadata Superhuman does not expose. But PMSync lacks: the 14-day retroactive labeling, the max-10 guardrail, and the restriction on what AI prompts can reference.

### Pattern 2: Sender Memory (Shortwave/SaneBox Model)

**How it works:**
- When a user manually applies a label to an email, the system remembers the sender-to-label mapping
- All future emails from that sender automatically get the same label
- This is deterministic (not AI) -- it is a lookup table: sender -> label
- SaneBox extends this with ML on headers: analyzes sender frequency, social graph position, CC patterns
- SaneBox scans 4-6 weeks of historical headers on signup to bootstrap the model

**Onboarding:**
- SaneBox: completely automatic. Signs up, connects email, waits 1-2 weeks for accuracy
- Shortwave: automatic for built-in labels; manual label application trains future behavior
- Neither requires any wizard or configuration

**Key design decisions:**
- SaneBox ONLY reads headers (From, To, Subject, Date) -- never email body content. This is a privacy selling point.
- Shortwave's Magic Labels auto-apply built-in labels (Newsletters, Purchases, Finance, Travel) from trained sender patterns
- Training is per-sender, not per-email-content. Same sender always gets same label.

**Relevance to PMSync:**
PMSync's `TriageLearningService` already has a signal buffer for learning from user corrections. The gap is: (1) it is in-memory and not shared across instances (v11.0 pitfall), and (2) it does not yet persist sender-to-label mappings as a lookup table. Adding a `SenderLabelOverride` table would give PMSync sender memory comparable to Shortwave.

### Pattern 3: Binary Gate + Fixed Routing (HEY Model)

**How it works:**
- Every first-time sender lands in "The Screener" -- a separate queue
- User makes a binary decision: Yes (screen in) or No (block forever)
- If Yes, user assigns the sender to one of 3 fixed destinations: Imbox, Feed, or Paper Trail
- No AI, no ML, no automation. Every sender decision is manual and permanent (until changed).
- HEY sends nothing back to blocked senders -- the block is silent

**Onboarding:**
- Onboarding IS the product. First experience is screening 6 HEY welcome emails.
- Each email teaches a concept (Imbox, Feed, Paper Trail, Reply Later, Set Aside, Clips)
- The Screener button glows when new unscreened senders arrive
- Follow-up onboarding emails arrive over the next few minutes, teaching features through the product itself

**Key design decisions:**
- No categories beyond 3. Deliberate simplicity.
- Sender-level routing, not email-level. You route the person, not the message.
- No AI because the founders believe users should make their own decisions about who gets attention
- Paper Trail is read-only by default (receipts, confirmations) -- no notifications

**Relevance to PMSync:**
HEY's approach is philosophically opposite to PMSync's AI-first triage. However, the Screener concept maps to a useful feature: a "first-time sender" alert that asks users to classify unknown senders. This could feed sender memory (Pattern 2). HEY's 3-lane routing (Imbox/Feed/Paper Trail) is conceptually similar to PMSync's `defaultLane` system but far less flexible.

### Pattern 4: Fixed Smart Categories (Spark/Google Inbox Model)

**How it works:**
- Pre-trained ML model classifies every email into fixed categories
- Spark: People, Notifications, Newsletters (3 categories, mutually exclusive)
- Google Inbox: Travel, Purchases, Finance, Social, Updates, Forums, Promos (7 categories)
- Categories are not user-configurable -- the ML model determines the rules
- Google Inbox bundled related emails (e.g., all travel for one trip grouped together)

**Onboarding:**
- Zero-config. Model is pre-trained on aggregate email patterns.
- Spark: emails from real people always sort to top (People card)
- Google Inbox: bundles auto-create based on detected email type
- Users can manually recategorize, which trains future sender classification

**Key design decisions:**
- Categories are mutually exclusive (one email = one category)
- Pre-trained model means instant accuracy without user data
- No custom categories -- simplicity over flexibility
- Spark allows toggling categories on/off but not creating new ones

**Relevance to PMSync:**
PMSync's 10 default labels cover a superset of both Spark's and Google Inbox's categories. The key difference: PMSync allows multi-label (an email can be both "Customer" and "Action Items"), while Spark/Inbox force single-category. PMSync's approach is richer but needs strong mutual exclusivity rules to prevent label soup.

## Recommended Architecture for PMSync Enhancement

### Component Boundaries

| Component | Responsibility | Exists | Status |
|-----------|---------------|--------|--------|
| `UserLabel` (Prisma model) | Label definition with aiPrompt, family, lanes, exclusivity | Yes | Complete |
| `TriageOnboardingRules` | Wizard input contract -> prompt generation | Yes | Backend contract complete, no frontend |
| `EmailAnalysisService` | LLM-based email classification | Yes | Working, uses per-label aiPrompt |
| `TriageLearningService` | Signal buffer for learning from corrections | Yes | In-memory only, needs Redis migration |
| `SenderLabelOverride` (new) | Persistent sender-to-label lookup table | No | Needed for Shortwave-style sender memory |
| Smart Views UI | Filterable views based on labels/lanes | No | TASK-04, TASK-05 requirements |
| Onboarding Wizard UI | Guided setup that generates TriageOnboardingRules | No | Frontend gap |
| Label Correction Action | UI to change label + train sender memory | No | Needed for feedback loop |

### Data Flow: Classification Pipeline

```
New Email Arrives (via sync or webhook)
    |
    v
[1. Sender Override Check] -- Is there a SenderLabelOverride for this sender+tenant?
    |                              |
    | No override                  | Override found
    v                              v
[2. LLM Classification]      [Apply stored labels]
    |                              |
    | Run email against            | Skip LLM (deterministic)
    | all active label aiPrompts   |
    v                              v
[3. Taxonomy Enforcement] -- Apply mutuallyExclusiveWith rules
    |                       Remove conflicting labels
    |                       Apply suppressUrgency
    v
[4. Lane Assignment] -- Map labels to defaultLane values
    |
    v
[5. Store & Notify] -- Persist label assignments
                       Push to Smart Views via WebSocket
                       Update sender memory if correction
```

### Patterns to Follow

**Pattern: Sender Override as L1 Cache**

Check sender overrides BEFORE running LLM classification. This is cheap (database lookup or Redis cache) and provides instant, deterministic results for known senders. LLM classification only runs for unknown senders or senders without overrides.

```typescript
// Pseudocode for classification pipeline
async classifyEmail(email: Email, tenantId: string): Promise<LabelAssignment[]> {
  // L1: Sender override (instant, deterministic)
  const override = await this.senderOverrideService.find(tenantId, email.fromAddress);
  if (override) {
    return override.labels;
  }

  // L2: LLM classification (slower, probabilistic)
  const labels = await this.emailAnalysisService.classifyWithLabels(email, tenantId);

  // L3: Taxonomy enforcement
  return this.taxonomyService.enforce(labels);
}
```

**Pattern: Retroactive Labeling on New Label Creation**

When a user creates a new label (or completes onboarding wizard), retroactively classify the last N days of emails. Superhuman does 14 days. This gives users immediate value and validates the label's accuracy.

**Pattern: Correction Feedback Loop**

When a user corrects a label:
1. Update the email's label assignment immediately
2. Create/update a `SenderLabelOverride` for that sender
3. Optionally: log the correction as a training signal for future prompt refinement

## Anti-Patterns to Avoid

### Anti-Pattern 1: Content-Only Classification
**What:** Classifying based only on email body text.
**Why bad:** Same sender can send structurally identical emails that mean different things in different contexts. Sender identity is a strong signal.
**Instead:** Use sender + subject + content as combined signals. Weight sender history highest.

### Anti-Pattern 2: Auto-Archive on First Classification
**What:** Automatically archiving emails classified as Promotions/Updates on first run.
**Why bad:** Users panic when emails "disappear." Trust in classification must be earned.
**Instead:** Visually group and suppress, but keep in inbox. Add auto-archive as an opt-in per label after user validates accuracy.

### Anti-Pattern 3: Unbounded Custom Labels
**What:** Letting users create unlimited AI-prompt labels.
**Why bad:** Each label adds an LLM classification call. 50 labels = 50x cost per email. Also creates label soup where emails get 10+ labels.
**Instead:** Cap custom AI labels (Superhuman caps at 10). Use sender overrides for high-volume deterministic routing.

### Anti-Pattern 4: Re-Classifying on Every View
**What:** Running classification every time a user opens an email.
**Why bad:** Expensive, slow, and results can change between views (confusing).
**Instead:** Classify once on arrival. Store result. Only re-classify if label definition changes (retroactive labeling).

## Sources

- [Superhuman Auto Labels](https://help.superhuman.com/hc/en-us/articles/40127432866323-Auto-Labels)
- [Superhuman Custom Split Inbox](https://help.superhuman.com/hc/en-us/articles/38458483333907-Custom-Split-Inbox)
- [Shortwave Magic Labels](https://www.shortwave.com/blog/magic-labels-custom-bundles/)
- [Shortwave Smart Labels](https://www.shortwave.com/docs/concepts/labels/)
- [HEY How It Works](https://www.hey.com/how-it-works/)
- [HEY The Screener](https://www.hey.com/features/the-screener/)
- [Spark Smart Inbox](https://sparkmailapp.com/features/smart_inbox)
- [SaneBox Training](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox)
- [Google Inbox Bundles (The Next Web)](https://thenextweb.com/news/hands-googles-inbox-helps-organize-life-email-bundles)
- PMSync codebase: `triage-onboarding.contract.ts`, `default-user-labels.ts`, `email-analysis.service.ts`, `triage-learning.service.ts`
