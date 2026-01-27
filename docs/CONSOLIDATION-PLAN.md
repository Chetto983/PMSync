# MailAgent Consolidation - REALISTIC Single-Dev Plan

---

## 🟢 AUDIT STATUS (2026-01-26)

**Last Audit**: 2026-01-26 by Claude Code

### ✅ FIXED (Verified in Codebase)

| Issue | Status | Evidence |
|-------|--------|----------|
| `getLearningStats()` 404 | ✅ FIXED | Removed from `frontend/lib/api/ai.ts` line 721 |
| Reset Learning button | ✅ FIXED | Removed from `frontend/components/settings/AiSettings.tsx` line 289 |
| Hardcoded labels | ✅ FIXED | `getUserLabels()` in `email-insights.service.ts` lines 86-107 |
| EmailSignature model | ✅ EXISTS | `schema.prisma` line 924 |
| HITL → Learning feedback | ✅ WIRED | `recordFeedback` calls in `hitl.service.ts` lines 533, 616 |
| Analytics fake data | ✅ FIXED | Real Prisma queries in `analytics.service.ts` lines 376-441 |
| Auth session cache | ✅ IMPLEMENTED | Redis cache in `jwt.strategy.ts` lines 107-172, 5 min TTL |
| Memory cleanup (expiresAt) | ✅ IMPLEMENTED | `data-cleanup.service.ts` cron at 3 AM, cleans 5 tables |

### ⏳ REMAINING WORK

| Issue | Status | Priority |
|-------|--------|----------|
| Email Signature UI wiring | ⏳ TODO | P2 |
| `communicationStyle` → compose | ⏳ TODO | P3 |
| Auto-triage event emission | ⏳ TODO | P4 |
| Search backend integration | ⏳ TODO | P2 |
| Follow-ups snooze button | ⏳ TODO | P3 |

---

## 🔴 Reality Check (Cynical Assessment)

**What Actually Works:**

- Contacts management (not "CRM" - be honest)
- Email sync (mostly)
- VoltAgent chat (basic flow)
- WritingStyle learning (stores profiles)
- ✅ Auth session caching (Redis, 5 min TTL)
- ✅ Memory cleanup (cron job at 3 AM)
- ✅ Analytics with real data (email counts, trends)

**What's Theater Code (Looks Good, Does Nothing):**

- `Deal` model - EXISTS but ZERO API endpoints
- ~~Learning system - 482 lines of code, IN-MEMORY ONLY~~ → HITL→Learning now wired
- `communicationStyle` setting - stored, NEVER read by compose
- `jobTitle/department` settings - stored, NEVER used
- Auto-triage - code exists, NEVER triggered
- ~~`getLearningStats()` - frontend calls it, returns 404~~ → ✅ REMOVED
- ~~**Analytics endpoint** - returns HARDCODED fake numbers~~ → ✅ FIXED (real data)
- **Search** - Just local text filter on already-fetched emails, NO backend search
- **Follow-ups widget** - Backend API complete, dashboard widget is READ-ONLY (no snooze button despite prop existing)

**Brutal Math:**

- Email Roadmap claims 5 phases, ~120 tasks remaining
- One dev at 6h/day = ~3 weeks minimum
- Reality: prioritize 2 phases (Compose + AI), skip polish

---

## SINGLE DEV EXECUTION ORDER

### WEEK 1: Fix Broken Shit First

| # | Task | Hours | Why |
|---|------|-------|-----|
| 1 | Remove `getLearningStats()` 404 call | 0.5h | Errors on every page load |
| 2 | Remove Reset Learning button | 0.5h | Nothing to reset |
| 3 | Signature: Prisma model + migration | 1h | Foundation |
| 4 | Signature: Backend CRUD service | 3h | Core feature |
| 5 | Signature: Controller + swagger | 1h | Expose API |
| 6 | Signature: Wire frontend SignatureSettings | 2h | Connect UI |
| 7 | Signature: Append on send | 1h | Actually use it |
| 8 | Fix hardcoded labels → UserLabel table | 2h | categorizeEmail broken |
| **Total** | | **11h** | |

### WEEK 2: Email Roadmap (Only What Matters)

| Phase | Do | Skip | Hours |
|-------|-----|------|-------|
| **5: Compose** | Draft autosave, attachments, recipients | Templates, scheduling | 12h |
| **8: AI Integration** | Summarize button, smart reply chips | Sentiment badges, priority icons | 8h |
| **6: Search** | Basic search + global command palette | Date pickers | 4h |
| **7: Subscription** | Add useautumn | create subscrition and sensated limit | 8h |
| **Total** | | | **24h** |

### WEEK 3: Connect Orphan Code

| # | Task | Hours | Why |
|---|------|-------|-----|
| 1 | Wire HITL → Learning feedback | 2h | Approvals mean nothing without this |
| 2 | Connect `communicationStyle` → compose tone | 1h | Setting exists but unused |
| 3 | Add `email.new` event emission | 2h | Enable auto-triage |
| 4 | Create email-triage.listener | 3h | Superhuman feature |
| 5 | Add memory cleanup (expiresAt) | 2h | Memories grow forever |
| 6 | End-to-end HITL test | 2h | Prove it works |
| **Total** | | **12h** | |

---

## CRM: Stop Lying

**Reality:**

- You have CONTACTS MANAGEMENT, not CRM
- `Deal` table exists but has NO API - it's vaporware
- No DealsController, no DealsService, no frontend

**Recommendation:**

- Remove "CRM" branding until you build deals
- Keep: Contacts, relationship scoring, stale alerts
- Kill: Any deals UI mockups that don't work
- Later (V2): Pipeline, Kanban, forecasting

---

## DELETE OR FIX THESE (No Excuses)

| What | Action | Why |
|------|--------|-----|

| Reset Learning button | DELETE | No backend, never worked |
| `emailDensity` in AI Settings | MOVE | It's UI, not AI. Move to Appearance |
| Learning stats section in AI Settings | DELETE | 404 on load |
| `analytics.service.ts` fake data | REWRITE | Returns hardcoded fake data, even negative values |
| `dashboard/widgets/FollowUpWidget.tsx` | DELETE | Duplicate of productivity version, use one |
| `EmailSearchBar.tsx` | REWRITE | Client-side only, no real search |
| Follow-ups `onSnooze` prop | WIRE UP | Prop exists, button doesn't call it |

---

## PART A: AI Settings Consolidation

### Issues Identified

| Issue | Status | Action |
|-------|--------|--------|
| `GET /voltagent/stats/learning` returns 404 | Missing endpoint | Remove from frontend |
| `POST /voltagent/learning/reset` missing | No implementation | Implement or remove button |
| Email Density setting | Pure UI, not AI | Move to Appearance section |
| Working Hours/Job Details | Stored but NEVER used by AI | Consider removing or implement usage |
| `communicationStyle` not used in compose | Stored but not connected | Connect to compose tone parameter |

### Phase A1: Remove Non-Existent Endpoints

**Frontend API** (`frontend/lib/api/ai.ts`):
- Remove `getLearningStats()` if it exists (calls non-existent endpoint)
- Keep working endpoints only

**Frontend Settings Container** (`frontend/pages/dashboard/settings.tsx` or parent):
- Remove `onResetLearning` functionality (no backend implementation)
- OR implement backend endpoint if feature is wanted

### Phase A2: Move Email Density to Appearance

Email Density (`comfortable`, `compact`, `spacious`) is a **UI preference**, not AI:
1. Remove from `AiSettings.tsx`
2. Move to Appearance/Display settings section
3. Update parent container to pass props correctly

### Phase A3: Connect CommunicationStyle to Compose

Currently `communicationStyle` (FORMAL, CASUAL, TECHNICAL, CREATIVE) is stored in UserPreferences but NOT used when composing emails.

**Fix**: When calling `aiApi.composeEmail()`:

1. Fetch user's `communicationStyle` preference
2. Map to compose `tone` parameter:
   - FORMAL → 'formal'
   - CASUAL → 'casual'
   - TECHNICAL → 'technical'
   - CREATIVE → 'casual' (or add support)

**Files to modify**:

- `frontend/components/email/compose/ComposeEditor.tsx` - get preference and pass to API
- OR `frontend/hooks/queries/use-preferences.ts` - create hook if not exists

### Phase A4: Decide on Working Hours/Job Details

These settings (jobTitle, department, industry, companySize, workingHoursStart, workingHoursEnd, workingDays) are:
- Stored in UserPreferences via `personalizationApi.updateProfile()`
- NEVER read or used by any AI service

**Options**:
1. **Remove**: Delete from UI if not used
2. **Implement**: Use in AI context (e.g., include in compose prompt for better personalization)
3. **Keep for future**: Leave UI but mark as "beta" or future feature

**Recommendation**: Option 2 - Add to AI compose context for better email generation

### Phase A5: Learning Validation

The backend has two learning systems that need validation:

#### 1. WritingStyleService (`writing-style.service.ts`)
- Analyzes user email writing patterns (sentence length, formality, greetings, sign-offs)
- Stores profile in `WritingStyleProfile` Prisma model
- **Endpoint**: `GET /voltagent/stats/writing-style` - EXISTS and works
- **Status**: ✅ IMPLEMENTED

#### 2. Agent Learning System (`learning.ts`)
- Tracks approval/rejection feedback to adjust confidence
- Uses `LearningProfile` interface (NOT a Prisma model!)
- Uses in-memory cache + optional persistence callbacks
- **Endpoint**: `GET /voltagent/stats/learning` - DOES NOT EXIST (404)
- **Status**: ❌ NO API ENDPOINT

**Validation Tasks**:
1. Check if `AgentLearningProfile` exists in Prisma schema → NO, it doesn't
2. Check if learning persistence is wired up → Only in-memory, no DB persistence
3. Either:
   a. **Remove** Reset Learning button (no persistence = nothing to reset)
   b. **Implement** full learning persistence (Prisma model + endpoints)

**Recommendation**: Option A for now (remove button), add TODO for future full implementation.

---

## PART B: Email Signature Feature (Priority 2)

## Architecture Decision

### Storage Approach: **Per-Provider Signatures**
- Users may have multiple email accounts (work, personal)
- Each account should have its own default signature
- Stored in database for persistence across devices

### Signature Appending: **Backend-side**
- Append signature in `EmailSendService.sendEmail()` before building ComposeMessage
- Ensures consistency and prevents signature bypassing
- Frontend sends `signatureId` (or uses default), backend appends HTML

---

## Implementation Phases

### Phase 1: Database Schema
**File:** `backend/prisma/schema.prisma`

Add `EmailSignature` model:
```prisma
model EmailSignature {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String
  providerId String?  // null = applies to all providers
  name       String
  content    String   // HTML content
  isDefault  Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  tenant   Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user     User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider EmailProvider? @relation(fields: [providerId], references: [id], onDelete: SetNull)

  @@index([tenantId, userId])
  @@index([providerId])
}
```

Update User model to add relation.

### Phase 2: Backend API
**Files to create/modify:**

1. **DTO:** `backend/src/modules/email/dto/signature.dto.ts`
   - `CreateSignatureDto`: name, content, providerId?, isDefault?
   - `UpdateSignatureDto`: Partial<CreateSignatureDto>

2. **Service:** `backend/src/modules/email/services/email-signature.service.ts`
   - `create(tenantId, userId, dto)` - create signature, handle isDefault logic
   - `findAll(tenantId, userId, providerId?)` - list signatures
   - `findDefault(tenantId, userId, providerId?)` - get default signature
   - `update(tenantId, userId, id, dto)` - update signature
   - `delete(tenantId, userId, id)` - delete signature
   - `setDefault(tenantId, userId, id)` - set as default (unset others)

3. **Controller:** `backend/src/modules/email/controllers/signatures.controller.ts`
   - `GET /emails/signatures` - list all
   - `GET /emails/signatures/default?providerId=xxx` - get default
   - `POST /emails/signatures` - create
   - `PATCH /emails/signatures/:id` - update
   - `DELETE /emails/signatures/:id` - delete
   - `POST /emails/signatures/:id/set-default` - set as default

4. **Modify SendEmailDto:** Add optional `signatureId` field
   - If provided: use that signature
   - If not provided: use default for provider
   - If explicitly null: no signature

5. **Modify EmailSendService.sendEmail():**
   - After receiving `SendEmailDto`, fetch signature
   - Append signature HTML to bodyHtml: `bodyHtml + "<br><br>" + signature.content`
   - Pass modified body to ComposeMessage

### Phase 3: Frontend API
**File:** `frontend/lib/api/emails.ts`

Add signature API methods:
```typescript
export const signatureApi = {
  list(providerId?: string)
  getDefault(providerId?: string)
  create(dto: CreateSignatureDto)
  update(id: string, dto: UpdateSignatureDto)
  delete(id: string)
  setDefault(id: string)
}
```

### Phase 4: Frontend Query Hooks
**File:** `frontend/hooks/queries/use-signatures.ts`

- `useSignatures(providerId?)` - list signatures
- `useDefaultSignature(providerId?)` - get default
- `useCreateSignature()` - mutation
- `useUpdateSignature()` - mutation
- `useDeleteSignature()` - mutation
- `useSetDefaultSignature()` - mutation

### Phase 5: Settings UI
**File:** `frontend/components/settings/SignatureSettings.tsx` (already created, needs integration)

Connect to real API:
- Fetch signatures from backend
- Wire up CRUD operations
- Add provider selector (optional)
- Preview signatures with proper HTML rendering

### Phase 6: Compose Integration
**File:** `frontend/components/email/compose/ComposeDialog.tsx`

- Add signature selector dropdown (optional)
- Load default signature for selected provider
- Display signature preview below editor (read-only)
- Pass `signatureId` to send API

### Phase 7: Translations
**Files:** `frontend/locales/en.ts`, `frontend/locales/it.ts`

Add signature-related translations:
```typescript
settings: {
  signature: {
    title: 'Email Signatures',
    description: 'Create and manage your email signatures',
    addSignature: 'Add Signature',
    editSignature: 'Edit Signature',
    // ... etc
  }
}
```

---

## Files to Modify

### Backend (create)
- `backend/prisma/schema.prisma` - Add EmailSignature model
- `backend/src/modules/email/dto/signature.dto.ts` - DTOs
- `backend/src/modules/email/services/email-signature.service.ts` - Service
- `backend/src/modules/email/controllers/signatures.controller.ts` - Controller

### Backend (modify)
- `backend/src/modules/email/dto/send-email.dto.ts` - Add signatureId
- `backend/src/modules/email/services/email-send.service.ts` - Append signature
- `backend/src/modules/email/email.module.ts` - Register new service/controller

### Frontend (create)
- `frontend/lib/api/signatures.ts` - API client
- `frontend/hooks/queries/use-signatures.ts` - Query hooks
- `frontend/hooks/queries/signature-keys.ts` - Query keys

### Frontend (modify)
- `frontend/components/settings/SignatureSettings.tsx` - Connect to API
- `frontend/components/email/compose/ComposeDialog.tsx` - Add signature support
- `frontend/components/dashboard/Settings.tsx` - Add signature section
- `frontend/locales/en.ts` - Add translations
- `frontend/locales/it.ts` - Add translations
- `frontend/locales/index.ts` - Add types

---

## Complete Implementation Order

### Step 1: AI Settings Cleanup (PART A)
1. **Remove broken endpoint call** - Remove stats/learning API call from frontend
2. **Remove Reset Learning button** - No backend persistence exists (in-memory only)
3. **Validate WritingStyle** - Confirm `/voltagent/stats/writing-style` endpoint works
4. **Move Email Density** - Not AI-related, move to Appearance settings

### Step 2: Signature Database (PART B)
1. Add `EmailSignature` model to Prisma schema
2. Run migration: `npx prisma migrate dev`

### Step 3: Signature Backend API
1. Create DTOs: `signature.dto.ts`
2. Create Service: `email-signature.service.ts`
3. Create Controller: `signatures.controller.ts`
4. Register in email.module.ts
5. Add signatureId to SendEmailDto
6. Update EmailSendService to append signature

### Step 4: Signature Frontend
1. Create API client: `frontend/lib/api/signatures.ts`
2. Create query hooks: `frontend/hooks/queries/use-signatures.ts`
3. Connect SignatureSettings.tsx to real API
4. Add signature selector to ComposeDialog (optional)

### Step 5: Translations
1. Add signature translations to en.ts and it.ts
2. Update types in locales/index.ts

### Step 6: HITL + Learning Wiring (PART C)
1. **Wire HITL → Learning** - Inject learning into hitl.service.ts
2. **Record feedback on approve/reject** - Call `recordFeedback()` in approve/reject methods
3. **Connect learning → confidence** - Use `getAdjustedConfidenceAsync()` before action proposals

### Step 7: AI Context Enrichment (PART C continued)
1. **Fetch WritingStyleProfile** in compose - Add to system prompt
2. **Fetch UserPreferences** in compose - Add job context to prompt
3. **Map communicationStyle → tone** - FORMAL/CASUAL/TECHNICAL/CREATIVE

### Step 8: Auto-Triage Implementation (PART D) - Superhuman Feature
1. **Fix categorizeEmail()** - Use UserLabel from database, not hardcoded
2. **Add event emission** - Emit `email.new` after saving in sync
3. **Create triage listener** - `email-triage.listener.ts` handles auto-labeling + priority
4. **Add AI fields to Email** - `aiPriority`, `aiUrgency`, `aiAnalyzedAt`
5. **User preference** - Add `autoTriageEnabled`, `autoLabelEnabled` to UserPreferences
6. **Frontend toggle** - Add auto-triage switch in AI Settings

### Step 9: Validation & Testing
1. Test AI compose with full context (WritingStyle, Preferences, Signature)
2. Test HITL approve/reject updates learning profiles
3. Test signature CRUD in settings
4. Test signature appending on email send
5. Verify adjusted confidence affects auto-approve threshold
6. **Test auto-triage** - New email arrives → labels applied automatically
7. **Test auto-priority** - Email gets priority score on arrival

---

## User Decisions (Already Confirmed)

| Question | Answer |
|----------|--------|
| Per-provider signatures? | Yes (like Outlook) |
| Multiple signatures per provider? | Yes, with one default |
| Auto-include in replies? | Yes |
| Edit signature in compose? | No (edit in settings only) |

---

## Files Summary

### PART A - AI Settings (modify only)
- `frontend/lib/api/ai.ts` - Remove stats/learning if exists
- `frontend/components/settings/AiSettings.tsx` - Remove emailDensity, resetLearning button
- `frontend/components/email/compose/ComposeEditor.tsx` - Use communicationStyle as tone
- Parent settings container - Move emailDensity to Appearance
- `backend/src/modules/ai/voltagent/services/writing-style.service.ts` - Validate working
- `backend/src/modules/ai/voltagent/observability/learning.ts` - Document as in-memory only

### PART B - Signature Feature (create + modify)
**Create:**
- `backend/prisma/schema.prisma` (add EmailSignature)
- `backend/src/modules/email/dto/signature.dto.ts`
- `backend/src/modules/email/services/email-signature.service.ts`
- `backend/src/modules/email/controllers/signatures.controller.ts`
- `frontend/lib/api/signatures.ts`
- `frontend/hooks/queries/use-signatures.ts`

**Modify:**
- `backend/src/modules/email/dto/send-email.dto.ts` (add signatureId)
- `backend/src/modules/email/services/email-send.service.ts` (append signature)
- `backend/src/modules/email/email.module.ts` (register)
- `frontend/components/settings/SignatureSettings.tsx` (wire to API)
- `frontend/locales/en.ts`, `frontend/locales/it.ts` (translations)

---

## PART C: HITL + Learning Consolidation (Priority 3)

### Current State Analysis

| Component | Status | Issue |
|-----------|--------|-------|
| `hitl.service.ts` | ✅ Works | Uses Prisma `ActionQueue` model |
| `hitl.service.shouldAutoApprove()` | ⚠️ Broken | Uses `adjustedConfidence` but learning never updates it |
| `learning.ts` | ❌ In-Memory Only | 482 lines of code, NO persistence |
| `GET /voltagent/stats/learning` | ❌ 404 | No endpoint exists |
| `use-ai-actions.ts` | ⚠️ Broken | Calls `getLearningStats()` which returns 404 |
| Feedback loop | ❌ Missing | HITL approve/reject never calls `learning.recordFeedback()` |

### Phase C1: Wire HITL → Learning Feedback

When user approves/rejects action, record feedback to learning system:

**File:** `backend/src/modules/ai/voltagent/services/hitl.service.ts`

1. Inject `LearningObservability` into HitlService
2. In `approveAction()` → call `learning.recordFeedback({ wasApproved: true, ... })`
3. In `rejectAction()` → call `learning.recordFeedback({ wasApproved: false, ... })`

### Phase C2: Persist Learning Profiles

**Option A (Recommended for MVP):** Remove learning stats from frontend
- Delete `getLearningStats()` call from `use-ai-actions.ts`
- Remove learning stats UI (it always fails)
- Document learning.ts as internal optimization (in-memory)

**Option B (Full Implementation):** Add Prisma model + endpoints
- Add `AgentLearningProfile` Prisma model
- Add `GET /voltagent/stats/learning` endpoint
- Add `POST /voltagent/learning/reset` endpoint
- Wire persistence callbacks in `createLearningObservability()`

### Phase C3: Connect Learning → Confidence Adjustment

Before proposing any action, check learning profile:

**File:** `backend/src/modules/ai/voltagent/tools/*.tools.ts`

For each tool that creates actions:
1. Before `createPendingAction()`, call `learning.getAdjustedConfidenceAsync()`
2. Set `action.adjustedConfidence` from learning profile
3. `shouldAutoApprove()` will then use the learned confidence

### Phase C4: Integrate WritingStyle → Compose

WritingStyleProfile exists in Prisma but is never used by compose.

**File:** `backend/src/modules/ai/voltagent/voltagent.service.ts`

In `composeEmail()`:
1. Fetch `WritingStyleProfile` for user
2. Add to system prompt:
   - Preferred greetings: `${profile.preferredGreetings.join(', ')}`
   - Preferred sign-offs: `${profile.preferredSignOffs.join(', ')}`
   - Formality score: `${profile.formalityScore}` (0-1 scale)
   - Average sentence length: `${profile.avgSentenceLength}` words

### Phase C5: Integrate UserPreferences → Compose

UserPreferences stores job context that AI never sees.

**File:** `backend/src/modules/ai/voltagent/voltagent.service.ts`

In `composeEmail()`:
1. Fetch `UserPreferences` for user
2. Add to system prompt:
   ```
   User Context:
   - Job Title: ${preferences.jobTitle || 'Not specified'}
   - Department: ${preferences.department || 'Not specified'}
   - Industry: ${preferences.industry || 'Not specified'}
   - Communication Style Preference: ${preferences.communicationStyle}
   ```
3. Map `communicationStyle` to `tone` parameter:
   - FORMAL → 'formal'
   - CASUAL → 'casual'
   - TECHNICAL → 'technical'
   - CREATIVE → 'creative'

### Files to Modify (PART C)

**Backend (modify):**
- `backend/src/modules/ai/voltagent/services/hitl.service.ts` - Wire to learning
- `backend/src/modules/ai/voltagent/voltagent.service.ts` - Add WritingStyle + Preferences to compose
- `backend/src/modules/ai/voltagent/tools/email.tools.ts` - Use adjusted confidence

**Frontend (modify):**
- `frontend/hooks/ai/use-ai-actions.ts` - Remove broken `getLearningStats()` call
- `frontend/lib/api/ai.ts` - Remove/fix `getLearningStats` export

**Frontend (optional - if Option B):**
- Add learning stats UI after implementing backend endpoint

---

## PART D: Auto-Labeling & Auto-Triage Validation (Priority 4)

### Current State Analysis

| Component | Status | Issue |
|-----------|--------|-------|
| `UserLabel` Prisma model | ✅ Exists | Has name, slug, color, type, hierarchy |
| `EmailLabel` join table | ✅ Exists | Links emails to labels |
| `categorizeEmail()` backend | ❌ Hardcoded | Uses `allowedLabels` array, NOT database |
| `calculatePriority()` backend | ⚠️ Works | But doesn't persist priority anywhere |
| `analyzeEmail()` backend | ⚠️ Works | Comprehensive but no persistence |
| Auto-triage on sync | ❌ Missing | Not integrated with email sync |
| **Event system** | ❌ Missing | Email sync emits NO events when emails saved |
| `FeedbackQueueService` | ✅ Exists | BullMQ queue for learning signals (can reuse pattern) |
| **Frontend API** | ✅ Exists | `aiApi.categorizeEmail()`, `aiApi.calculatePriority()` |
| **Frontend UI** | ❌ ORPHANED | **NO component calls these APIs!** Only test file uses them |

### Phase D1: Fix Auto-Labeling to Use Database Labels

**File:** `backend/src/modules/ai/services/email-insights.service.ts`

Current (BROKEN):
```typescript
private readonly allowedLabels = [
  'Important', 'Follow-up', 'Action Items', 'Info',
  'Personal', 'Finance', 'Promotions', 'Updates'
];
```

Fix:
1. Inject `PrismaService` (already done)
2. Fetch user's labels: `prisma.userLabel.findMany({ where: { tenantId } })`
3. Pass label names to AI prompt
4. Map AI response back to label IDs
5. Create `EmailLabel` records

**New method signature:**
```typescript
async categorizeEmailAndApply(
  tenantId: string,
  emailId: string,
  locale?: string,
  applyLabels: boolean = false  // Actually create EmailLabel records
): Promise<{ labels: string[]; labelIds?: string[] }>
```

### Phase D2: Add Priority Persistence

**File:** `backend/prisma/schema.prisma`

Add to Email model:
```prisma
model Email {
  // existing fields...
  aiPriority       Int?       // 1-10 priority score
  aiUrgency        String?    // 'low' | 'medium' | 'high' | 'critical'
  aiAnalyzedAt     DateTime?  // when last analyzed
}
```

**File:** `backend/src/modules/ai/services/email-insights.service.ts`

After `calculatePriority()`:
```typescript
await this.prisma.email.update({
  where: { id: emailId },
  data: {
    aiPriority: result.score,
    aiUrgency: result.urgency,
    aiAnalyzedAt: new Date()
  }
});
```

### Phase D3: Integrate with Email Sync (Auto-Triage)

**Option A (Event-driven):** Emit event after saving new email
- `email.new` event triggers async processing
- Non-blocking, respects user settings

**File:** `backend/src/modules/email-sync/services/base-email-sync.service.ts`

After saving email:
```typescript
if (userPrefs.autoTriageEnabled) {
  this.eventEmitter.emit('email.new', { emailId, tenantId });
}
```

**File:** `backend/src/modules/ai/listeners/email-triage.listener.ts` (NEW)

```typescript
@OnEvent('email.new')
async handleNewEmail({ emailId, tenantId }) {
  await this.emailInsightsService.analyzeEmail(tenantId, emailId);
  await this.emailInsightsService.categorizeEmailAndApply(tenantId, emailId, undefined, true);
}
```

### Phase D4: User Preference for Auto-Triage

**File:** `backend/prisma/schema.prisma`

Add to UserPreferences:
```prisma
model UserPreferences {
  // existing fields...
  autoTriageEnabled  Boolean @default(false)
  autoLabelEnabled   Boolean @default(false)
}
```

**Frontend:** Add toggle in AI Settings

### Phase D5: Validation Tests

Create test scripts:
1. `backend/scripts/test-auto-labeling.ts`
   - Create test labels in database
   - Call `categorizeEmail()`
   - Verify labels come from database, not hardcoded
   - Verify `EmailLabel` records created

2. `backend/scripts/test-auto-triage.ts`
   - Call `calculatePriority()` and `analyzeEmail()`
   - Verify Email record updated with priority
   - Test priority-based email sorting

### Files to Modify (PART D)

**Backend (modify):**
- `backend/src/modules/ai/services/email-insights.service.ts` - Use DB labels, persist priority
- `backend/prisma/schema.prisma` - Add aiPriority fields, autoTriage prefs

**Backend (create):**
- `backend/src/modules/ai/listeners/email-triage.listener.ts` - Event handler for auto-triage

**Frontend (modify):**
- `frontend/components/settings/AiSettings.tsx` - Add auto-triage toggle

---

## PART E: VoltAgent System Validation (Priority 5)

### Current State Analysis

| Component | File | Size | Status |
|-----------|------|------|--------|
| **Supervisor Agent** | `supervisor.agent.ts` | 397 lines | ✅ Works - orchestrates sub-agents |
| **Email Agent** | `email.agent.ts` | 78 lines | ✅ Works - has WritingStyleService |
| **Calendar Agent** | `calendar.agent.ts` | ~100 lines | ✅ Needs validation |
| **Contacts Agent** | `contacts.agent.ts` | ~100 lines | ✅ Needs validation |
| **Knowledge Agent** | `knowledge.agent.ts` | ~100 lines | ✅ Needs validation |
| **General Agent** | `general.agent.ts` | ~50 lines | ✅ Needs validation |
| **WebSearch Agent** | `websearch.agent.ts` | ~100 lines | ⚠️ Optional, needs ConfigService |
| **Analytics Agent** | `analytics.agent.ts` | ~100 lines | ⚠️ Optional, needs ConfigService |
| **DocumentLibrary Agent** | `document-library.agent.ts` | ~100 lines | ⚠️ Optional, needs service |

### Tools Analysis

| Tool File | Size | Status | Issue |
|-----------|------|--------|-------|
| `email.tools.ts` | 800+ lines | ✅ Works | HITL pattern correct |
| `insights.tools.ts` | 1000+ lines | ⚠️ Partial | Uses hardcoded labels |
| `calendar.tools.ts` | ~300 lines | ⚠️ Needs validation | |
| `contacts.tools.ts` | ~300 lines | ⚠️ Needs validation | |
| `folder.tools.ts` | ~200 lines | ✅ Works | |
| `analytics.tools.ts` | ~200 lines | ⚠️ Needs validation | |
| `web-search.tools.ts` | ~200 lines | ⚠️ Needs validation | |
| `document-library.tools.ts` | ~200 lines | ⚠️ Needs validation | |

### Validation Findings

#### ✅ WORKING CORRECTLY

1. **Supervisor Agent** (`supervisor.agent.ts`)
   - `buildDynamicInstructions()` injects UserContext correctly (lines 135-248)
   - `communicationStyle` IS in the prompt (lines 183-190)
   - Locale instruction added for response language
   - Connected providers listed for multi-account awareness

2. **VoltAgentService** (`voltagent.service.ts`)
   - `getUserContext()` fetches UserPreferences and ProviderConfig (lines 438-523)
   - Injects userContext into supervisor agent (line 607-624)
   - WritingStyleService is injected (line 215)
   - HITL integration works via `observabilityHooks.onPendingAction`

3. **Email Compose** (`email-insights.service.ts`)
   - `composeEmail()` DOES use WritingStyleService (lines 142-150)
   - Calls `writingStyle.getStylePromptSection()` to inject writing style
   - Sender name and signature are included in prompt

#### ⚠️ ISSUES FOUND

1. **Learning NOT Wired to HITL**
   - `hitl.service.ts` has NO import of learning module
   - `approveAction()` and `rejectAction()` don't call `recordFeedback()`
   - Learning profiles never update from user feedback

2. **communicationStyle in Supervisor vs Compose**
   - Supervisor agent HAS communicationStyle in instructions
   - BUT `email-insights.service.ts.composeEmail()` doesn't receive it directly
   - The `tone` parameter comes from frontend, NOT from UserPreferences
   - **Gap**: Frontend should read UserPreferences.communicationStyle and pass as tone

3. **Insights Tools Use Hardcoded Labels**
   - `email-insights.service.ts` line 36-45 has hardcoded `allowedLabels`
   - Should fetch from `UserLabel` table instead

4. **No Event Emission for New Emails**
   - `base-email-sync.service.ts` doesn't emit events
   - Auto-triage can't be triggered

### Phase E1: Validate All Agents

For each agent, verify:
1. Instructions are correct and localized
2. Tools are properly registered
3. Hooks are connected for observability
4. Memory is available if needed

**Files to check:**
- `backend/src/modules/ai/voltagent/agents/calendar.agent.ts`
- `backend/src/modules/ai/voltagent/agents/contacts.agent.ts`
- `backend/src/modules/ai/voltagent/agents/knowledge.agent.ts`
- `backend/src/modules/ai/voltagent/agents/general.agent.ts`
- `backend/src/modules/ai/voltagent/agents/websearch.agent.ts`
- `backend/src/modules/ai/voltagent/agents/analytics.agent.ts`
- `backend/src/modules/ai/voltagent/agents/document-library.agent.ts`

### Phase E2: Validate All Tools

For each tool set, verify:
1. Tenant isolation via `tenantId` parameter
2. Proper error handling and localization
3. HITL pattern for destructive actions (`requiresApproval: true`)
4. Cache integration where applicable

**Files to check:**
- `backend/src/modules/ai/voltagent/tools/calendar.tools.ts`
- `backend/src/modules/ai/voltagent/tools/contacts.tools.ts`
- `backend/src/modules/ai/voltagent/tools/analytics.tools.ts`
- `backend/src/modules/ai/voltagent/tools/web-search.tools.ts`
- `backend/src/modules/ai/voltagent/tools/document-library.tools.ts`

### Phase E3: Validate Localization

Verify all prompts use centralized locale system:
- `backend/src/modules/ai/voltagent/locales/en.ts` - English prompts
- `backend/src/modules/ai/voltagent/locales/it.ts` - Italian prompts
- `backend/src/modules/ai/voltagent/locales/index.ts` - Export + types

### Phase E4: Fix Identified Gaps

1. **Wire Learning → HITL**
   - In `hitl.service.ts`, inject LearningObservability
   - Call `recordFeedback()` in approve/reject methods

2. **Connect communicationStyle → Compose**
   - Frontend: Read `UserPreferences.communicationStyle`
   - Pass as `tone` parameter to compose API

3. **Fix insights.tools.ts**
   - Use database labels instead of hardcoded

### Files to Modify (PART E)

**Backend (validate + fix):**
- `backend/src/modules/ai/voltagent/agents/*.agent.ts` - Validate all agents
- `backend/src/modules/ai/voltagent/tools/*.tools.ts` - Validate all tools
- `backend/src/modules/ai/voltagent/locales/*.ts` - Validate translations
- `backend/src/modules/ai/voltagent/services/hitl.service.ts` - Wire to learning

**Frontend (fix):**
- `frontend/components/email/compose/ComposeEditor.tsx` - Use communicationStyle as tone

---

## Implementation Priority Order (FINAL)

### 🔥 Priority 0: Auth Performance (CRITICAL - 100ms→5ms per request)
1. Add Redis session cache to JwtStrategy
2. Cache invalidation on logout/password reset
3. Background OAuth token refresh (Google + Microsoft)

### 🔴 Priority 1: Fix Broken Features
1. Remove `getLearningStats()` 404 call from frontend
2. Remove Reset Learning button (no backend)
3. Fix hardcoded labels → use UserLabel table

### 🟠 Priority 2: Email Signature Feature
1. Add EmailSignature Prisma model
2. Create backend CRUD API
3. Wire frontend SignatureSettings.tsx
4. Append signature on send

### 🟡 Priority 3: Connect Existing Code
1. Wire HITL → Learning feedback loop
2. Connect communicationStyle → compose tone
3. Add event emission for new emails

### 🟢 Priority 4: Auto-Triage (Superhuman Feature)
1. Create email-triage.listener.ts
2. Add aiPriority fields to Email model
3. Add autoTriageEnabled preference
4. Add frontend toggle

### 🔵 Priority 5: Full Validation
1. Validate all VoltAgent agents
2. Validate all tools
3. Run end-to-end tests

---

## ⚠️ MANDATORY VALIDATION PROTOCOL

**RULE: STOP AND VALIDATE AT EVERY STEP. NO EXCEPTIONS.**

### Validation Commands by Phase

| Phase | Validation Command | Pass Criteria |
|-------|-------------------|---------------|
| Auth Cache (Priority 0) | `npm run type-check` + Redis test | 0 errors + cache hit logs |
| OAuth Refresh | `npx ts-node scripts/test-oauth-refresh.ts` | Token refreshes in background |
| Broken Features Fix | `npm run type-check && npm run lint` | 0 errors |
| Signature Backend | `npm run type-check && npm run test:signatures` | API responds 200 |
| Signature Frontend | Visual test + browser console | No errors in console |
| HITL Wiring | `npx ts-node scripts/test-hitl-learning.ts` | Learning profile updates |
| Auto-Triage | `npx ts-node scripts/test-auto-triage.ts` | Labels applied to new email |
| Full System | `npm run test:e2e` | All tests pass |

### Per-Task Validation Checklist

**Before marking ANY task complete:**
1. ✅ TypeScript compiles: `npm run type-check`
2. ✅ No lint errors: `npm run lint`
3. ✅ Manual test of changed functionality
4. ✅ Check browser console for errors (frontend)
5. ✅ Check backend logs for errors

### GDPR & Tenant Isolation Validation

| Check | How to Validate | Required |
|-------|-----------------|----------|
| Data never crosses tenants | Audit all Prisma queries have `tenantId` filter | ✅ |
| PII is redacted in logs | Grep logs for email/name patterns | ✅ |
| Session cache is tenant-scoped | Cache key includes tenantId | ✅ |
| OAuth tokens encrypted at rest | Check `accessToken` is ciphertext | ✅ |
| Password hashing uses bcrypt 12+ | Check `bcrypt.hash(pw, 12)` calls | ✅ |
| No PII in error responses | Test 4xx/5xx responses | ✅ |

### Auth Cache Validation (Priority 0 - COMPLETED)

```bash
# 1. Type check passes
cd backend && npm run type-check

# 2. Start backend and make authenticated request
# First request: cache miss, 2 DB queries
# Second request: cache hit, 0 DB queries

# 3. Test logout invalidates cache
# After logout, next request should hit DB again

# 4. Test password reset invalidates all sessions
# All user sessions should be removed from cache
```

---

## Test Checklist

| Feature | Test |
|---------|------|
| Signature CRUD | Create, update, delete, set default |
| Signature on send | New email includes signature HTML |
| Signature in replies | Reply includes signature |
| Learning feedback | Approve/reject updates profile |
| CommunicationStyle | FORMAL user gets formal compose |
| Auto-triage | New email gets labels + priority |
| HITL approval | Action executes after approve |
| WritingStyle | Compose uses learned greetings |

---

## PART F: AI Memory - Reality Check

### What Exists (3 Services)

| Service | Purpose | Status |
|---------|---------|--------|
| `AIMemoryService` | Long-term storage in Postgres | ✅ Works |
| `MemoryIntelligenceService` | Semantic search + fact extraction | ⚠️ Passive only |
| `EpisodicMemoryService` | Learn from rejections | ✅ Works |

### What's Broken

| Issue | Reality |
|-------|---------|
| `expiresAt` field | Exists but NEVER checked - memories grow forever |
| Memory extraction | Only on user messages, not agent actions |
| Conversation → Memory | Messages stored but NOT converted to AIMemory |
| Memory consolidation | No dedup, no merging similar facts |

### Minimal Fixes (2h total)

1. **Add memory cleanup job** - Delete expired memories (1h)
   - `backend/src/modules/ai/voltagent/jobs/memory-cleanup.processor.ts`
   - Cron job: daily, delete where `expiresAt < now()`

2. **Set default expiry on creation** (0.5h)
   - PREFERENCE: 1 year
   - FACT: never expires
   - INTERACTION: 90 days
   - PATTERN: 6 months

3. **Log memory stats** (0.5h)
   - Add count by type to `/voltagent/memory/stats`
   - Show storage usage warning if > 10k memories

### Skip (V2)

- Memory consolidation/dedup
- Conversation → Memory conversion
- Cross-source profile merging

---

## PART G: Agent Speed Optimization

### Current State

| Agent | maxSteps | Avg Latency |
|-------|----------|-------------|
| Supervisor | 5 (was 10) | ~1000ms per step |
| Email | 3 (was 5) | ~500ms per step |
| Calendar | 5 | ~500ms per step |
| General | 3 | ~200ms per step |

### Model Router (Already Implemented)

`ModelRouterService` routes by complexity:
- Simple queries → `mistral-small` (200ms, 3x cheaper)
- Moderate → `mistral-medium` (500ms)
- Complex → `mistral-large` (1000ms)

**Estimated savings: 40-60% cost**

### Speed Fixes (Low Effort)

| Fix | Effort | Impact |
|-----|--------|--------|
| Reduce Supervisor maxSteps 5→3 | 5min | Less LLM calls |
| Reduce Calendar maxSteps 5→3 | 5min | Faster responses |
| Cache common tool results | 2h | Skip DB queries |
| Parallel tool execution | Already done | - |

### Skip (Marginal Gains)

- Streaming responses (complex frontend work)
- Model fine-tuning (expensive, overkill)
- Edge deployment (infrastructure change)

---

## PART H: CRM Audit - Honest Assessment

### What You ACTUALLY Have

| Feature | Status | Notes |
|---------|--------|-------|
| Contacts CRUD | ✅ Full | All operations work |
| Google/Microsoft sync | ✅ Full | Webhooks, manual, scheduled |
| vCard import | ✅ Works | Basic import |
| Email extraction | ✅ Works | Pulls from headers |
| Relationship scoring | ✅ Works | Basic algorithm |
| Stale contact alerts | ✅ Works | CrmAlertsWidget |
| Interaction history | ✅ Works | Linked to emails |

### What's VAPORWARE (Delete from Marketing)

| Feature | Reality |
|---------|---------|
| **Deals/Pipeline** | Prisma model exists, NO API, NO UI |
| **Companies** | Just a string field on Contact |
| **Pipeline stages** | No management, no Kanban |
| **Deal forecasting** | Nothing implemented |
| **Activity timeline** | Partial (interactions exist but no timeline UI) |

### Recommendation

1. **Rename** "CRM" to "Contacts" in UI until deals work
2. **Keep** what works: contacts, scoring, alerts
3. **Later (V2)**: Build deals module properly:
   - DealsService + Controller
   - DealsPage frontend
   - Pipeline configuration
   - Activity timeline

---

## FINAL: 3-Week Execution Summary

| Week | Focus | Hours | Deliverable |
|------|-------|-------|-------------|
| 1 | Fix broken + Signatures | 11h | Working signature feature |
| 2 | Email Compose + AI | 24h | Draft, attachments, summarize, smart-reply |
| 3 | Connect orphan code | 12h | HITL→Learning, auto-triage, memory cleanup |
| **Total** | | **47h** | MVP polished |

### NOT in This Plan (V2)

- Deals/Pipeline CRM
- Keyboard shortcuts
- Model fine-tuning

---

## PART I: Dashboard Review - Complete Redesign

### Current State (BRUTAL TRUTH)

| Component | Status | Reality |
|-----------|--------|---------|
| `analytics.service.ts` | ❌ **FRAUD** | QUERIES real data (`_sent`, `_received`) then THROWS IT AWAY and returns hardcoded fake numbers! Even has `received: -2910` (NEGATIVE!) |
| `AnalyticsChart.tsx` | ❌ BROKEN | Uses fake backend data, no loading states |
| Main Dashboard | ⚠️ Useless | 6 widgets but **NO trend graphs** |
| Follow-ups widget | ⚠️ Theater | `onSnooze` prop exists but **NO BUTTON calls it**. Dashboard widget is READ-ONLY. Backend API is complete! |
| Search | ❌ Fake | Just stores text in Zustand, does client-side filter. **NO backend search**. No command palette. |
| Two Follow-up components | ⚠️ Duplication | `dashboard/widgets/FollowUpWidget.tsx` AND `productivity/FollowUpWidget.tsx` - confusing |

### The Analytics Fraud (Line 9-35 of analytics.service.ts)

```typescript
// The CRIME: queries DB then throws it away!
const _sent = await this.prisma.email.count({ ... });   // Real data
const _received = await this.prisma.email.count({ ... }); // Real data

return [
  { name: 'Jan', emails: 4000, sent: 2400, received: 1600 },  // FAKE
  { name: 'Jul', emails: 3490, sent: 4300, received: -810 },  // NEGATIVE VALUE!
];
```

### What Dashboard NEEDS (Superhuman-level)

| Widget | Current | Needed |
|--------|---------|--------|
| **Trend Graphs** | ❌ Missing | Email volume, response time, AI usage over time |
| **Stats Cards** | ⚠️ Basic | Add % change vs last period |
| **Priority Inbox** | ❌ Missing | Top 5 urgent emails |
| **Follow-ups** | ⚠️ Basic | Add snooze, quick actions, filtering |
| **Analytics** | ❌ Broken | Fix backend, add real metrics |

### Phase I1: Create Analytics Backend (CRITICAL)

**File:** `backend/src/modules/analytics/analytics.controller.ts` (NEW)

```typescript
@Get('emails')
async getEmailAnalytics(@Query() dto: AnalyticsQueryDto) {
  // Aggregate email counts by day/week/month
  // Calculate response times
  // Track AI compose/reply usage
  return { data: [], period: dto.period };
}

@Get('ai-usage')
async getAiUsage(@Query() dto: AnalyticsQueryDto) {
  // Count: composes, summaries, smart replies
  // Track savings (time, tokens)
}
```

**File:** `backend/src/modules/analytics/analytics.service.ts` (NEW)

- `getEmailVolumeByDay(tenantId, startDate, endDate)`
- `getResponseTimeStats(tenantId, period)`
- `getAiUsageStats(tenantId, period)`
- `getProductivityMetrics(tenantId, period)`

### Phase I2: Fix AnalyticsChart.tsx

**File:** `frontend/components/dashboard/AnalyticsChart.tsx`

Current (BROKEN):
```typescript
const data = await analyticsApi.getEmailAnalytics(); // 404!
```

Fix:
1. Use TanStack Query hook
2. Handle loading/error states
3. Add period selector (7d, 30d, 90d)
4. Use Recharts properly

### Phase I3: Redesign Main Dashboard

**File:** `frontend/components/dashboard/DashboardContainer.tsx`

Add new widgets:
1. **TrendWidget** - Email volume line chart (last 7 days)
2. **StatsGridWithChange** - Stats cards with % change indicator
3. **PriorityInboxWidget** - Top 5 urgent emails
4. **ImprovedFollowUpsWidget** - With snooze and quick actions

### Phase I4: Improve Follow-ups Widget

**File:** `frontend/components/dashboard/widgets/FollowUpsWidget.tsx` or AI section

Current Issues:
- Just a list, no actions
- No snooze functionality
- No filtering (overdue, today, upcoming)

Improvements:
1. Add snooze button (1h, 1d, 1w)
2. Add quick reply action
3. Filter tabs: Overdue | Today | Upcoming
4. Show urgency indicator
5. Link to email thread

### Phase I5: Add Search Consolidation

**Files to audit:**
- `frontend/components/email/search/` - Check current state
- `backend/src/modules/email/services/email-search.service.ts` - Validate

Current Issues:
- Search may be fragmented (email list vs global)
- Need unified search component
- Need keyboard shortcut (Cmd+K)

Fix:
1. Create `SearchCommand.tsx` - Global command palette
2. Wire to email search backend
3. Add to layout (always accessible)
4. Support: emails, contacts, calendar (later)

---

## PART J: E2E Tests + Memory Consolidation (IN SCOPE)

### E2E Tests (4h total)

| Test | Coverage |
|------|----------|
| `e2e/signature.spec.ts` | Create, edit, delete, set default, send with signature |
| `e2e/compose.spec.ts` | Draft save, attachments, AI compose, send |
| `e2e/hitl.spec.ts` | Action approval, rejection, auto-approve threshold |
| `e2e/auto-triage.spec.ts` | New email → labels applied, priority set |

Framework: Playwright (already in devDependencies)

### Memory Consolidation (3h total)

| Task | Hours |
|------|-------|
| Add memory cleanup cron job | 1h |
| Memory dedup on similar facts | 1h |
| Memory stats endpoint | 0.5h |
| Set proper expiry defaults | 0.5h |

**Files:**
- `backend/src/modules/ai/voltagent/jobs/memory-cleanup.processor.ts` (NEW)
- `backend/src/modules/ai/services/ai-memory.service.ts` (modify)

---

## PART L: Auth Performance Optimization (CRITICAL - Priority 0)

### The Problem: 2 DB Queries Per Request

**Comparison with Zero-staging (reference implementation):**

| Aspect | Zero (FAST) | MailAgent (SLOW) |
|--------|-------------|------------------|
| Auth Library | `better-auth` | Passport.js + JWT |
| Session Cache | Redis `secondaryStorage` (30 days) | **NO CACHE - DB hit every request** |
| Cookie Cache | `cookieCache.enabled: true` | None |
| Session Expiry | 30 days | 24 hours |
| DB Queries/Request | 0 (from cache) | **2 queries EVERY request** |
| Token Refresh | Middleware pattern (async) | Synchronous blocking |

### Root Cause: `jwt.strategy.ts` Lines 98-143

Every authenticated request executes **2 database queries**:

```typescript
// Query 1: Session lookup - EVERY REQUEST
const session = await this.prisma.session.findUnique({
  where: { id: payload.sessionId },
});

// Query 2: User + Tenant lookup - EVERY REQUEST
const user = await this.prisma.user.findUnique({
  where: { id: payload.userId },
  include: { tenant: true },
});
```

**Impact**: With 50ms average per query, that's **100ms overhead per request** before any business logic runs.

### Zero's Solution: Redis Session Cache

```typescript
// Zero's auth.ts - Sessions cached in Redis
secondaryStorage: {
  get: async (key: string) => await redis.get(key),
  set: async (key: string, value: string, ttl?: number) =>
    await redis.set(key, value, { ex: ttl }),
  delete: async (key: string) => await redis.del(key),
},
session: {
  cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 30 }, // 30 days
  expiresIn: 60 * 60 * 24 * 30, // 30 days
}
```

### Fix: Add Redis Cache to Existing JwtStrategy (4h)

**File:** `backend/src/modules/auth/strategies/jwt.strategy.ts`

1. Inject `CacheService` (already uses Redis)
2. Cache session + user data for 5 minutes
3. Invalidate cache on logout/role change

```typescript
async validate(payload: any) {
  const cacheKey = `session:${payload.sessionId}`;

  // Try cache first
  const cached = await this.cacheService.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Existing DB queries...
  const session = await this.prisma.session.findUnique({...});
  const user = await this.prisma.user.findUnique({...});

  // Cache result for 5 minutes
  const result = { id: user.id, tenantId: user.tenantId, ... };
  await this.cacheService.set(cacheKey, JSON.stringify(result), 300);

  return result;
}
```

**Cache Invalidation Points:**

- `auth.service.ts:logout()` → Delete `session:{id}` from cache
- `auth.service.ts:resetPassword()` → Delete all user sessions from cache
- User role change → Delete user's session cache

### OAuth Token Refresh Optimization (2h)

**Problem:** Token refresh blocks the request in `getProviderWithTokens()`.

**Fix:** Background refresh when token is near expiry (5 min buffer instead of 60s).

**Files:**

- `backend/src/modules/providers/services/google-oauth.service.ts`
- `backend/src/modules/providers/services/microsoft-oauth.service.ts`

### Implementation Plan (6h total)

| Task | Hours | File |
|------|-------|------|
| Add session cache to JwtStrategy | 2h | `jwt.strategy.ts` |
| Add cache invalidation to logout | 0.5h | `auth.service.ts` |
| Add cache invalidation on password reset | 0.5h | `auth.service.ts` |
| Background token refresh (Google) | 1h | `google-oauth.service.ts` |
| Background token refresh (Microsoft) | 1h | `microsoft-oauth.service.ts` |
| Test auth performance improvement | 1h | Manual testing |

### Expected Performance Improvement

| Metric | Before | After |
|--------|--------|-------|

| Auth overhead per request | ~100ms | ~5ms (cache hit) |
| OAuth token refresh | Blocks request | Background |
| Session validation | 2 DB queries | 0 DB queries (cached) |

---

## UPDATED: 4-Week Execution Summary

| Week | Focus | Hours | Deliverable |
|------|-------|-------|-------------|

| 1 | **Auth Cache** + Fix broken + Signatures | 17h | **Fast auth** + working signature |
| 2 | Email Compose + AI + Subscription | 32h | Draft, attachments, smart-reply, pricing |
| 3 | Dashboard + Search + Memory | 16h | Trend graphs, search command, memory cleanup |
| 4 | E2E Tests + Polish | 10h | Full test coverage, follow-ups improvements |
| **Total** | | **75h** | MVP polished with **fast auth** |
