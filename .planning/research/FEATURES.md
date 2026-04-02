# Feature Landscape: Email Triage & Classification

**Domain:** AI email triage, label onboarding, classification systems
**Researched:** 2026-04-02

## Competitor Comparison Matrix

### Label/Category Definition Approaches

| Product | Preset Labels | Custom Labels | Wizard/Onboarding | AI-Driven | User-Written Prompts |
|---------|--------------|---------------|-------------------|-----------|---------------------|
| **Superhuman** | 4 built-in (Marketing, Pitch, Social, News) | Yes (AI prompt or deterministic criteria) | No wizard; manual setup via Settings | Yes (LLM classifies content, subject, sender, recipients) | Yes (Business/Enterprise only, max 10) |
| **Shortwave** | 8 built-in (Updates, Promotions, Social, Calendar, Newsletters, Purchases, Finance, Travel) | Yes (any label becomes a bundle) | Minimal; auto-applies from first use | Yes (remembers sender-to-label mappings) | No (learns from user actions) |
| **Spark** | 3 fixed categories (People, Notifications, Newsletters) | No custom categories | Zero-config; works on first launch | Yes (ML-based sender classification) | No |
| **SaneBox** | ~6 system folders (SaneLater, SaneBlackHole, SaneNews, SaneCC, SaneNoReplies, SaneSnooze) | Yes (custom training folders) | Zero-config; scans 4-6 weeks of headers | Yes (ML on headers, not content) | No |
| **HEY** | 3 destinations (Imbox, Feed, Paper Trail) | No (fixed 3-way routing) | The Screener: approve/deny each first-time sender | No AI; purely manual per-sender decisions | No |
| **Google Inbox** | 7 bundles (Travel, Purchases, Finance, Social, Updates, Forums, Promos) | No (fixed categories) | Zero-config; ML-applied from first use | Yes (Google's ML models) | No |
| **Clean Email** | Smart Folders by real-world category (Shopping, Magazines, Ride Sharing, Food Delivery, etc.) | Yes (Auto Clean rules with sender/keyword/subject criteria) | Minimal; suggests rules from existing mail patterns | Partial (ML-based Cleaning Suggestions) | No (rule-based criteria) |
| **PMSync (current)** | 10 defaults (Important, Follow-up, Action Items, Info, Personal, Finance, Promotions, Updates, Customer, System Alert) | Yes (with aiPrompt, family, mutual exclusivity, urgency suppression, defaultLane) | Backend contract exists (TriageOnboardingRules) but no frontend wizard | Yes (LLM per-label with custom prompts) | Yes (generated from onboarding rules, editable) |

### How Each Product Learns User Preferences

| Product | Learning Method | Speed to Accuracy | Feedback Mechanism |
|---------|----------------|-------------------|-------------------|
| **Superhuman** | AI prompt evaluation on each email; deterministic rules for sender/domain/subject | Immediate for rules; prompt quality determines AI accuracy | Move email between splits; edit/retrain Auto Labels |
| **Shortwave** | Sender-to-label memory (Magic Labels); Gmail Importance signals | Immediate per sender after first manual label | Apply label manually once; system remembers sender mapping |
| **Spark** | ML model trained on sender patterns | Immediate (pre-trained model) | Manually recategorize email; Spark learns sender correction |
| **SaneBox** | ML on email headers (sender, subject, frequency, social graph); 4-6 weeks historical scan | 98%+ accuracy in 1-2 weeks | Drag email between SaneBox folders; web dashboard training |
| **HEY** | No learning; static per-sender routing decisions | Instant (user decides for each sender) | Change sender's destination (Imbox/Feed/Paper Trail) anytime |
| **Clean Email** | Rule-based with ML-suggested categories | Immediate for rules; suggestions improve over time | Accept/reject Cleaning Suggestions; modify Auto Clean rules |

### Label Metadata Comparison

| Product | Action Type | Urgency/Priority | Mutual Exclusivity | Suppression | Lanes/Views |
|---------|-------------|-------------------|--------------------|--------------|--------------------|
| **Superhuman** | Implicit (Split Inbox routing) | Important vs Other split | Built-in labels go to "Other" by default | Auto-archive option per label | Split Inbox (3-7 splits) |
| **Shortwave** | Implicit (bundle vs inbox) | Gmail Importance integration | No documented exclusivity rules | Bundle = collapsed in inbox | Splits + Bundles + Delivery Schedules |
| **Spark** | Implicit (card position) | Priority sender marking (orange highlight) | Categories are mutually exclusive | Newsletters/Notifications below People | Smart Inbox cards + Focused List |
| **SaneBox** | Implicit (folder routing) | Inbox = important; SaneLater = not | Folders are mutually exclusive destinations | SaneBlackHole = permanent suppression | Folder-based views |
| **HEY** | Explicit (3 destinations) | Imbox = important | 3-way exclusive routing | "No" in Screener = permanent block | Imbox / Feed / Paper Trail |
| **PMSync** | Explicit (`defaultLane` field) | `suppressUrgency` boolean per label | `mutuallyExclusiveWith` array per label | `family: 'suppression'` category | Smart Views (planned) |

## Table Stakes

Features users expect from any AI email triage system. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Competitor Evidence |
|---------|--------------|------------|-------------------|
| Zero-config preset labels | Users expect immediate value without setup | Low | ALL competitors offer presets (Superhuman 4, Shortwave 8, Spark 3, SaneBox 6) |
| Auto-apply on new email arrival | Classification must happen before user sees the email | Medium | Superhuman, Shortwave, Spark, SaneBox all classify in real-time |
| One-click correction | Users must be able to fix wrong classifications instantly | Low | SaneBox drag-to-folder, Spark manual recategorize, Shortwave label picker |
| Bulk actions on classified groups | "Archive all promotions" is expected | Low | Shortwave bundles, SaneBox folders, Clean Email Smart Views |
| Split/grouped inbox view | Classified emails must be visually separated | Medium | Superhuman Split Inbox, Spark Smart Inbox cards, Shortwave Splits |
| Suppression of low-priority categories | Newsletters/promos should not compete with real mail | Low | Universal across all competitors |

## Differentiators

Features that set PMSync apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Competitor Gap |
|---------|-------------------|------------|---------------|
| Per-label AI prompts (user-editable) | Fine-grained control over what each label catches | Medium | Only Superhuman offers this (Business plan only, max 10). PMSync already has it. |
| Label taxonomy with mutual exclusivity | Prevents conflicting labels (e.g., Promotions + Important) | Low | No competitor exposes exclusivity rules publicly. PMSync already has it. |
| Urgency suppression metadata | Labels can explicitly suppress urgency scoring | Low | No competitor documents this. PMSync already has it. |
| Onboarding wizard that generates prompts | Guided setup creates AI prompts from business context | Medium | Superhuman requires manual prompt writing. SaneBox requires no setup but offers no customization. PMSync's TriageOnboardingRules contract is the middle ground. |
| Lane-based routing (`defaultLane`) | Labels automatically route to action views (action-now, waiting-on-reply, review-later, etc.) | Medium | HEY has 3 fixed lanes. Others use priority sorting. PMSync's per-label lane assignment is more flexible. |
| Sender memory (correction-driven) | Correcting a label for one email trains future classification for that sender | High | Shortwave's Magic Labels + SaneBox's drag-to-train. PMSync's `TriageLearningService` exists but needs multi-instance work. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| The Screener (per-sender gate) | HEY's approach requires approving every new sender. Hostile UX for users with high email volume. Only works for HEY because it is the user's primary email address. | Use AI classification; let users override per-sender if needed. |
| Fixed 3-category routing only | HEY and Spark lock users into 3 categories. Too rigid for business use. | Keep the flexible label taxonomy with configurable lanes. |
| Sender-only classification | SaneBox and Shortwave Magic Labels only remember sender mappings. Same sender can send different email types (e.g., GitHub sends both deploy alerts and marketing). | Classify on content + subject + sender (PMSync's current approach). |
| Auto-archive without user consent | Some products auto-archive promotions on first run. Users panic when emails "disappear." | Classify and visually group, but never auto-archive until user explicitly enables it per label. |
| Complex rule builder UI | Clean Email and traditional mail rules require IF/THEN logic. Most users abandon complex rule UIs. | Use AI prompts (natural language) instead of boolean rule builders. |

## Feature Dependencies

```
Smart Views UI --> Label triage visibility (classified emails need a home)
Onboarding Wizard --> AI prompt generation (wizard output feeds label.aiPrompt)
Classification Feedback --> Sender memory (corrections update future classifications)
Auto-Apply on Ingest --> Smart Views (real-time classification feeds the views)
Lane-based routing --> Smart Views (lanes are displayed as view sections)
```

## MVP Recommendation

Prioritize:

1. **Smart Views with preset labels** (table stakes) -- Surface the 10 existing default labels as filterable views
2. **One-click correction** (table stakes) -- Let users change a label on an email and remember the sender mapping
3. **Onboarding wizard** (differentiator) -- Surface TriageOnboardingRules as a 3-step guided setup

Defer:

- **Auto-archive per label**: Needs user trust first. Ship after users have validated classification accuracy.
- **Delivery schedules (Shortwave-style)**: Nice-to-have but not core to triage. Defer to a later phase.
- **Custom label creation wizard**: Power users can already create labels with aiPrompt. A creation wizard is lower priority than surfacing existing labels.

## Sources

- [Superhuman Auto Labels](https://help.superhuman.com/hc/en-us/articles/40127432866323-Auto-Labels) -- Official help docs
- [Superhuman Custom Split Inbox](https://help.superhuman.com/hc/en-us/articles/38458483333907-Custom-Split-Inbox) -- Official help docs
- [Superhuman Organize with AI](https://help.superhuman.com/hc/en-us/articles/45274846287891-Organize-with-AI) -- Official help docs
- [Superhuman AI categorization launch (TechCrunch)](https://techcrunch.com/2025/02/19/superhuman-introduces-ai-powered-categorization-to-reduce-spammy-emails-in-your-inbox/)
- [Shortwave Magic Labels blog post](https://www.shortwave.com/blog/magic-labels-custom-bundles/) -- Official blog
- [Shortwave Smart Labels docs](https://www.shortwave.com/docs/concepts/labels/) -- Official docs
- [Shortwave Bundles docs](https://www.shortwave.com/docs/guides/bundles/) -- Official docs
- [Spark Smart Inbox](https://sparkmailapp.com/features/smart_inbox) -- Official feature page
- [Spark Customize Smart Inbox](https://support.readdle.com/spark/personalization/customize-your-smart-inbox) -- Official help
- [SaneBox Training Help](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox) -- Official help
- [SaneBox SaneBlackHole Help](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder) -- Official help
- [HEY How It Works](https://www.hey.com/how-it-works/) -- Official page
- [HEY The Screener](https://www.hey.com/features/the-screener/) -- Official feature page
- [HEY Onboarding Teardown (ProductLed)](https://productled.com/blog/hey-onboarding-teardown)
- [Clean Email Auto Clean](https://clean.email/auto-clean) -- Official feature page
- [Clean Email Review 2025](https://todaytesting.com/clean-email-review/) -- Third-party review
- [Google Inbox hands-on (The Next Web)](https://thenextweb.com/news/hands-googles-inbox-helps-organize-life-email-bundles)
