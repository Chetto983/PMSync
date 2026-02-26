# Phase 19: AI Draft Generation - Research

**Researched:** 2026-02-26
**Domain:** AI email composition, writing style matching, feedback learning
**Confidence:** HIGH

## Summary

Phase 19 builds AI reply draft generation directly into the email composer. The backend infrastructure is substantially in place: `WritingStyleService` already exists with full style analysis (685 lines), `WritingStyleProfile` Prisma model stores per-user metrics, `compose_reply` tool generates drafts via MistralService, and the sync pipeline already calls `learnFromEmail()` on every sent email. The `ComposeDialog` component handles reply/replyAll/forward modes with TipTap editor, draft auto-save, and an existing `AiComposeMenu` for tone selection.

The primary work is: (1) creating a new REST endpoint to generate AI drafts on-demand when reply is opened (separate from the chat agent tool pipeline), (2) auto-populating the composer with the draft, (3) adding the tone selector and "AI Draft" badge to the compose UI, (4) building the diff-based learning feedback loop that compares AI drafts vs what the user actually sent, (5) adding a settings panel for writing style visibility and manual sample override, and (6) wiring the weekly style refresh cron.

**Primary recommendation:** Create a dedicated `POST /api/v1/ai/generate-reply-draft` endpoint that calls MistralService with writing style context, returns the draft body, and is called automatically by the frontend when `ComposeDialog` opens in reply mode. Track drafts via a new `AiDraftFeedback` Prisma model for accept/edit/reject learning.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Auto-suggest on reply: when user hits Reply, AI pre-fills a full draft automatically
- Full reply draft generated (greeting, body, sign-off) -- not short suggestions or multiple options
- Replies only -- no draft generation for new compose or forwards
- Cursor lands at end of draft for quick-send power-user flow
- User can always clear the draft and write manually
- Auto-analyze last 50 sent emails per account to extract style patterns
- User can also provide manual writing samples as override
- Style profile is per email account (work = formal, personal = casual)
- Tone selector available: "More formal", "More casual", "Shorter", "More detailed" adjustments
- Visible style summary in settings showing extracted patterns (greeting, tone, sign-off) -- user can correct
- Weekly auto-refresh of style profile from new sent emails
- Language detection: draft matches incoming email language (e.g., Italian email -> Italian reply using Italian style)
- Signature/sign-off handled separately from body style -- signature comes from account settings, not AI-generated
- Draft appears inline in the composer, not side-by-side or ghost text
- Subtle "AI Draft" badge above composer -- disappears once user starts editing
- Regenerate button with optional instruction field ("make it shorter", "more formal", etc.)
- "Restore original AI draft" link available after user edits -- recoverable until send
- Track accept/edit/reject for every AI draft generated
- Learn from diffs: compare AI draft vs what user actually sent, extract correction patterns
- Improvements take effect on the very next draft (immediate feedback loop)
- Draft quality stats visible in settings: accept rate, average edits, total drafts generated

### Claude's Discretion
- Loading/generating animation while draft is being created
- Exact keyboard shortcuts for accept/regenerate/clear
- Error state handling when AI generation fails
- How diff-based learning is stored and applied (embedding approach, storage format)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DRAFT-01 | AI generates full reply drafts based on email context | Existing `compose_reply` tool + `MistralService.completePrompt()` provide the LLM call. New dedicated endpoint needed for auto-trigger on reply open. Email context fetched via existing Prisma queries with PII tokenization from Phase 13. |
| DRAFT-02 | AI drafts match user's writing style (learned from sent emails) | `WritingStyleService` already analyzes 50 sent emails, generates `<writing_style>` prompt section with formality/greeting/sign-off metrics. `learnFromEmail()` called on every sync'd sent email. Missing: per-provider profile, weekly cron, manual samples, diff-based correction learning. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| MistralService | existing | LLM completion for draft generation | Already used by `compose_reply` tool and all AI features |
| WritingStyleService | existing | Style analysis and prompt generation | Already has `analyzeText()`, `learnFromEmail()`, `getStylePromptSection()` |
| PiiDetectionService | existing (Phase 13) | Tokenize PII before sending to LLM | Required by GDPR, already wired in `completePromptWithRedaction()` |
| TipTap (ComposeEditor) | existing | Rich text editor in ComposeDialog | Already dynamically imported with SSR disabled |
| TanStack Query | existing | Data fetching for draft generation API | Standard pattern across all frontend hooks |
| Zustand (email-ui-store) | existing | Compose state management | Already manages `ComposeState` with reply mode |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @nestjs/schedule | existing | Weekly style refresh cron | For the `@Cron('0 3 * * 0')` weekly job |
| BullMQ | existing | Async backfill jobs | If style reanalysis is too slow for synchronous |
| diff-match-patch | 3.x (npm) | Compute diffs between AI draft and user-sent version | For learning feedback loop |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| diff-match-patch | Manual string comparison | diff-match-patch handles word-level edits properly; hand-rolling misses edge cases |
| Dedicated endpoint | Reuse `compose_reply` tool via chat | Dedicated endpoint is simpler, faster (no agent routing), and avoids chat session overhead |
| Per-provider style profile | Single user-level profile | User requested per-account styles; requires schema change to add `providerId` to `WritingStyleProfile` |

## Architecture Patterns

### Recommended Project Structure
```
backend/src/modules/ai/
├── voltagent/
│   ├── services/
│   │   ├── writing-style.service.ts        # EXISTING - extend with per-provider, manual samples
│   │   ├── draft-generation.service.ts     # NEW - orchestrates draft generation
│   │   └── draft-feedback.service.ts       # NEW - tracks accept/edit/reject + diff learning
│   ├── controllers/
│   │   └── ai-draft.controller.ts          # NEW - POST /generate-reply-draft endpoint
│   └── jobs/
│       └── writing-style-refresh.processor.ts # NEW - weekly cron

frontend/
├── components/email/compose/
│   ├── ComposeDialog.tsx                   # MODIFY - auto-trigger draft, badge, restore link
│   ├── AiDraftBadge.tsx                    # NEW - "AI Draft" badge component
│   └── ToneSelector.tsx                    # NEW - tone adjustment selector
├── hooks/queries/
│   └── use-ai-draft.ts                    # NEW - TanStack Query hook for draft generation
├── components/dashboard/
│   └── Settings.tsx                        # MODIFY - add writing style summary section
└── locales/
    ├── en.ts                              # MODIFY - add aiDraft translation keys
    └── it.ts                              # MODIFY - add aiDraft translation keys
```

### Pattern 1: Dedicated Draft Generation Endpoint
**What:** Separate `POST /api/v1/ai/generate-reply-draft` endpoint, not routed through the VoltAgent chat pipeline
**When to use:** Always for auto-draft on reply open
**Why:** The chat agent pipeline adds ~500ms routing overhead, requires a session, and loads 15+ tools. Draft generation is a simple LLM call with context -- no tools needed.
**Example:**
```typescript
// ai-draft.controller.ts
@Post('generate-reply-draft')
@RequiresConsent('ai_email_processing')
@RequiresQuota('ai')
async generateReplyDraft(
  @Req() req: AuthenticatedRequest,
  @Body() dto: GenerateReplyDraftDto,
) {
  return this.draftGenerationService.generateDraft(
    req.user.tenantId,
    req.user.userId,
    dto.emailId,
    { tone: dto.tone, instructions: dto.instructions, locale: dto.locale },
  );
}
```

### Pattern 2: Auto-Trigger Draft on Reply Open
**What:** When ComposeDialog opens in reply mode, automatically call the draft generation API
**When to use:** Every reply/replyAll open
**Example:**
```typescript
// In ComposeDialog.tsx -- triggered when mode is 'reply' or 'replyAll'
const { data: aiDraft, isLoading: draftLoading, refetch: regenerateDraft } = useAiDraft(
  mode === 'reply' || mode === 'replyAll' ? originalEmail?.id : undefined,
  { tone, locale }
);

// Pre-fill editor content when draft arrives
useEffect(() => {
  if (aiDraft?.body && !userHasEdited) {
    setEditorContent(aiDraft.body);
    setAiDraftOriginal(aiDraft.body); // Store for "restore" feature
  }
}, [aiDraft]);
```

### Pattern 3: Diff-Based Feedback Learning
**What:** Compare AI draft vs final sent email, store correction patterns
**When to use:** After every email send that had an AI draft
**Example:**
```typescript
// After send completes:
if (aiDraftId) {
  const feedback: DraftFeedback = {
    draftId: aiDraftId,
    action: userEditedDraft ? 'edited' : 'accepted',
    originalDraft: aiDraftOriginal,
    sentBody: finalBody,
    editDistance: computeEditDistance(aiDraftOriginal, finalBody),
    corrections: extractCorrectionPatterns(aiDraftOriginal, finalBody),
  };
  await draftFeedbackService.recordFeedback(feedback);
}
```

### Pattern 4: Per-Provider Style Profiles
**What:** Extend `WritingStyleProfile` to be scoped to a provider (email account), not just user
**When to use:** Users with multiple accounts (work formal, personal casual)
**Schema change:**
```prisma
model WritingStyleProfile {
  // ... existing fields ...
  providerId  String?  // NEW: null = default/global, set = per-account
  provider    ProviderConfig? @relation(fields: [providerId], references: [id])

  @@unique([tenantId, userId, providerId])  // CHANGE from @@unique([tenantId, userId])
}
```

### Anti-Patterns to Avoid
- **Routing drafts through VoltAgent chat agent:** Adds 500ms+ overhead, session management, tool loading. Draft generation is a simple prompt, not an agentic task.
- **Generating HTML drafts:** AI should output plain text. The TipTap editor converts to HTML. Generating HTML directly risks broken markup and doubles token count.
- **Blocking composer open on draft loading:** Show composer immediately with a loading skeleton. Draft generation should be non-blocking -- user can start typing manually at any time.
- **Storing full draft bodies in Redis:** Use Prisma for draft feedback records. Redis is for caching, not audit data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text diff computation | Custom string comparison | `diff-match-patch` or simple Levenshtein | Word-level diffs handle reorderings, insertions correctly |
| LLM completion with PII safety | Direct Mistral API call | `completePromptWithRedaction()` from insights.tools.ts | Already handles PII detect -> redact -> call -> rehydrate pipeline |
| Writing style prompt section | Manual prompt construction | `WritingStyleService.getStylePromptSection()` | Already generates locale-aware style description from profile metrics |
| Email metadata fetching | Raw Prisma query | `getEmail()` helper from insights.tools.ts | Already includes Redis caching with memory fallback |
| Weekly cron scheduling | Manual setInterval | `@nestjs/schedule` `@Cron()` decorator | Already used in the codebase for other scheduled tasks |

**Key insight:** 80% of the backend infrastructure already exists. The `compose_reply` tool does exactly what we need -- it fetches the email, gets the writing style, calls MistralService, and returns a draft. The work is extracting this into a dedicated endpoint and adding the feedback loop.

## Common Pitfalls

### Pitfall 1: Draft Blocks Reply Flow
**What goes wrong:** AI draft generation takes 2-5 seconds. If the composer waits for it, the reply UX feels broken.
**Why it happens:** Temptation to make draft a prerequisite for showing the editor.
**How to avoid:** Open ComposeDialog immediately. Show a loading skeleton in the editor area. When draft arrives, populate the editor. User can start typing at any time, which cancels the draft loading.
**Warning signs:** ComposeDialog shows a spinner instead of the editor.

### Pitfall 2: Per-Provider Profile Migration Break
**What goes wrong:** Adding `providerId` to `WritingStyleProfile.@@unique` breaks the existing constraint.
**Why it happens:** The current unique constraint is `@@unique([tenantId, userId])`. Adding `providerId` makes it `@@unique([tenantId, userId, providerId])`. Existing rows have `providerId = null`.
**How to avoid:** Migration must: (1) drop old unique constraint, (2) add new column with default null, (3) create new unique constraint. Existing row with null providerId becomes the "default" profile.
**Warning signs:** Prisma migrate fails with unique constraint violation.

### Pitfall 3: Feedback Loop Creates Infinite Drift
**What goes wrong:** Corrections from one email over-correct future drafts, causing oscillating quality.
**Why it happens:** Applying every user edit as a correction pattern without decay/weighting.
**How to avoid:** Use exponential moving average (like `learnFromEmail()` already does). Weight corrections by recency. Cap maximum adjustment per feedback. Require minimum 5 drafts before applying correction patterns.
**Warning signs:** Draft quality gets worse over time instead of better.

### Pitfall 4: Language Mismatch in Drafts
**What goes wrong:** AI generates English reply to Italian email, or vice versa.
**Why it happens:** Writing style profile is language-agnostic. If style profile is trained on English emails, AI may default to English even when incoming email is Italian.
**How to avoid:** Detect incoming email language (simple heuristic or Mistral language detection). Pass explicit language instruction in the draft generation prompt. Filter writing style greetings/sign-offs by locale (already implemented in `getStylePromptSection()`).
**Warning signs:** Users with mixed-language inboxes get wrong-language drafts.

### Pitfall 5: Signature Duplication
**What goes wrong:** AI draft includes a sign-off, then the composer appends the user's email signature, creating double sign-offs.
**Why it happens:** AI generates "Best regards, [Name]" AND the signature block adds another "Best regards, [Name]".
**How to avoid:** User decision: signature comes from account settings, not AI-generated. Strip any detected sign-off from the AI draft body. Add explicit instruction in the prompt: "Do NOT include a signature or sign-off line. The email signature will be appended automatically."
**Warning signs:** Sent emails have two signatures.

### Pitfall 6: Consent Check Missing
**What goes wrong:** Draft generation endpoint doesn't check `ai_email_processing` consent.
**Why it happens:** New endpoint created without `@RequiresConsent` decorator.
**How to avoid:** Always add `@RequiresConsent('ai_email_processing')` to any new AI endpoint. Check `ConsentGuard` is active (it is -- Phase 20 wired it as APP_GUARD).
**Warning signs:** Drafts generate for users who haven't consented to AI processing.

## Code Examples

### Draft Generation Service
```typescript
// draft-generation.service.ts
@Injectable()
export class DraftGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
    private readonly writingStyleService: WritingStyleService,
    @Optional() @Inject(PiiDetectionService)
    private readonly piiDetectionService: PiiDetectionService | null,
  ) {}

  async generateDraft(
    tenantId: string,
    userId: string,
    emailId: string,
    options: { tone?: string; instructions?: string; locale?: 'en' | 'it'; providerId?: string },
  ): Promise<{ draftId: string; body: string; subject: string }> {
    // 1. Fetch original email
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
      select: { id: true, subject: true, from: true, to: true, bodyText: true, snippet: true, providerId: true },
    });
    if (!email) throw new NotFoundException('Email not found');

    // 2. Get writing style for the specific provider (or fallback to default)
    const styleSection = await this.writingStyleService.getStylePromptSection(
      tenantId, userId, options.locale ?? 'en',
    ) ?? '';

    // 3. Detect language from incoming email
    const emailLang = this.detectLanguage(email.bodyText || email.snippet || '');

    // 4. Build prompt with PII redaction
    const { safeText, matches } = this.piiDetectionService
      ? { safeText: this.piiDetectionService.redact(email.bodyText || ''), matches: this.piiDetectionService.detect(email.bodyText || '').details }
      : { safeText: email.bodyText || '', matches: [] };

    // 5. Call Mistral
    const systemPrompt = `You are composing a reply email. ${styleSection}
Language: Write in ${emailLang}.
Do NOT include a signature or sign-off line (it will be appended automatically).
${options.tone ? `Tone: ${options.tone}` : ''}
${options.instructions ? `Additional instructions: ${options.instructions}` : ''}
Return JSON: { "subject": "Re: ...", "body": "..." }`;

    const raw = await this.mistralService.completePrompt({
      systemPrompt,
      userPrompt: `Reply to:\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${safeText}`,
      temperature: 0.35,
      maxTokens: 800,
      jsonMode: true,
    });

    // 6. Rehydrate PII tokens
    const rehydrated = this.piiDetectionService
      ? this.piiDetectionService.resolveFromMatches(raw, matches)
      : raw;

    // 7. Parse and return
    const parsed = JSON.parse(rehydrated);

    // 8. Record draft for feedback tracking
    const draft = await this.prisma.aiDraftFeedback.create({
      data: {
        tenantId, userId, emailId,
        draftBody: parsed.body,
        tone: options.tone,
        locale: emailLang,
      },
    });

    return { draftId: draft.id, body: parsed.body, subject: parsed.subject };
  }
}
```

### Frontend Auto-Draft Hook
```typescript
// use-ai-draft.ts
export function useAiDraft(emailId?: string, options?: { tone?: string; locale?: string }) {
  return useQuery({
    queryKey: ['ai', 'draft', emailId, options?.tone],
    queryFn: async () => {
      const { data } = await apiClient.post('/api/v1/ai/generate-reply-draft', {
        emailId,
        tone: options?.tone,
        locale: options?.locale,
      });
      return data;
    },
    enabled: !!emailId,
    staleTime: 0, // Always fresh draft
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}
```

### Prisma Schema Addition
```prisma
model AiDraftFeedback {
  id            String   @id @default(cuid())
  tenantId      String
  userId        String
  emailId       String
  draftBody     String   // The AI-generated draft
  sentBody      String?  // What the user actually sent (null if rejected)
  action        String   @default("pending") // pending | accepted | edited | rejected | regenerated
  editDistance   Float?   // Levenshtein distance ratio (0 = identical, 1 = completely different)
  corrections   Json?    // Extracted correction patterns
  tone          String?
  locale        String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([tenantId, userId])
  @@index([tenantId, emailId])
  @@map("ai_draft_feedback")
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multiple LLM calls for style analysis | Single `analyzeUserEmails()` batch | Already implemented | WritingStyleService already handles this efficiently |
| Generic AI replies | Style-matched replies with user profile | Already partially implemented | `getStylePromptSection()` exists but not wired to auto-draft |
| No feedback loop | HITL approval tracking | Phase 15 (learning.ts) | Learning infrastructure exists for approval/rejection |
| Per-user style only | Per-account style profiles | Phase 19 (new) | Requires schema change to add `providerId` |

**Deprecated/outdated:**
- `generate_smart_replies` tool was merged into `compose_reply` mode: 'suggestions' in Phase 2.1. Don't create another separate tool.

## Open Questions

1. **diff-match-patch vs simple Levenshtein**
   - What we know: Both can measure edit distance. diff-match-patch gives word-level patches. Levenshtein gives a single number.
   - What's unclear: How granular the correction pattern extraction needs to be.
   - Recommendation: Start with simple edit distance ratio (Levenshtein / max length) for the feedback record. If later analysis needs word-level corrections, add diff-match-patch. YAGNI for v1.

2. **Per-provider style profile: separate table or extend existing?**
   - What we know: Current `WritingStyleProfile` has `@@unique([tenantId, userId])`. Need to support multiple profiles per user.
   - What's unclear: Whether to add nullable `providerId` column or create a new related table.
   - Recommendation: Add nullable `providerId` to existing table. Null = default profile. Simpler migration, same service interface.

3. **Weekly cron: full re-analysis or incremental?**
   - What we know: `analyzeUserEmails()` queries last 50 sent emails. `learnFromEmail()` does incremental updates on every sync.
   - What's unclear: Whether weekly refresh should be a full re-analysis or just verify the incremental updates are still accurate.
   - Recommendation: Weekly cron calls `analyzeUserEmails()` (full re-analysis). It's cheap (50 email text analysis, no LLM calls) and corrects any drift from incremental updates.

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/ai/voltagent/services/writing-style.service.ts` - Existing WritingStyleService (685 lines), full NLP analysis
- `backend/src/modules/ai/voltagent/tools/insights.tools.ts` - compose_reply tool with writing style integration
- `backend/prisma/schema.prisma` - WritingStyleProfile, EmailSignature models
- `backend/src/modules/email-sync/services/sync-message-processor.service.ts` - learnFromEmail() call on sent email sync
- `frontend/components/email/compose/ComposeDialog.tsx` - Existing compose UI with reply modes
- `frontend/stores/email-ui-store.ts` - ComposeState management
- `frontend/components/email/compose/AiComposeMenu.tsx` - Existing AI compose actions

### Secondary (MEDIUM confidence)
- `backend/src/modules/ai/voltagent/voltagent.controller.ts` - Existing `GET stats/writing-style` endpoint
- `backend/src/modules/ai/voltagent/prompts/unified.prompt.ts` - RLM prompt loading pattern
- `backend/src/modules/compliance/consent.constants.ts` - ai_email_processing consent feature

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies needed
- Architecture: HIGH - patterns follow existing codebase conventions (dedicated controllers, TanStack Query hooks, Zustand store)
- Pitfalls: HIGH - identified from actual codebase inspection (signature handling, consent guards, migration constraints)

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable domain, no external dependency changes expected)
