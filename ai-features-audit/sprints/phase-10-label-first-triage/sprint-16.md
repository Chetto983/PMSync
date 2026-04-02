# Sprint 16 — Label Wizard Onboarding & Dynamic Prompt Engine

| Campo | Valore |
|-------|--------|
| **Phase** | 10 — Label-First Triage |
| **Sprint** | 16 |
| **SP** | 21 |
| **Objective** | Replace hardcoded default labels with a user-driven label wizard. Users create all labels themselves via a guided multi-step flow. Backend auto-generates AI classification prompts from structured label metadata. No defaults — empty inbox until user configures. |
| **Addresses** | LFT-A1, LFT-A2, LFT-C2 |
| **Replaces** | Previous Sprint 16 ("Onboarding UI & Label Prompt Authoring") — fully superseded |

---

## Design Decisions (from research)

### Architecture: No Default Labels
- `DEFAULT_AI_USER_LABELS` array removed. `ensureDefaultUserLabels()` removed.
- Fresh tenants start with **zero labels**. Triage is disabled until user creates at least 1 label.
- `email-analysis.service.ts` must gracefully handle zero-label state (skip label assignment, still produce summary/sentiment/intent).

### Label Wizard (Competitor-Informed)
Inspired by Superhuman's Auto Labels (structured creation + live preview) and the `email-label-wizard.jsx` prototype:

**4-step MUI Stepper in Dialog:**
1. **Name & Color** — label name + ColorPickerPopover + category (workflow/semantic/suppression)
2. **Classification** — structured fields: "Who sends?" (roles multi-select) + "What content?" (content multi-select) + optional freeform refinement
3. **Behavior** — action type (immediate/review-later/organize-only) + mutual exclusions + suppressUrgency toggle
4. **Review** — summary card showing all fields + generated AI prompt preview

### Structured Label Metadata
New fields on `UserLabel` model:
- `roles: String[]` — e.g. `["customer", "supplier", "internal"]`
- `contents: String[]` — e.g. `["invoice", "order", "complaint"]`
- `actionType: String` — `"urgent"` | `"followup"` | `"decide"` | `"none"`

Backend composes `aiPrompt` automatically from these structured fields. Power users can still edit the raw `aiPrompt` via an "Advanced" toggle.

### Dynamic System Prompt Generation
- Labels grouped by category in prompt (workflow > semantic > suppression)
- Explicit `<MUTUAL_EXCLUSION_RULES>` block
- `reasoning` field moved to first position in JSON output schema (chain-of-thought before classification)
- "Fewer labels is better" instruction added
- Works with 0 labels (produces summary/sentiment only, skips label assignment)

### Predefined Options (i18n)
Role options (translated EN+IT):
`supplier`, `customer`, `internal`, `finance`, `legal`, `tech`, `logistics`, `any`

Content options (translated EN+IT):
`quote`, `order`, `invoice`, `complaint`, `info-request`, `contract`, `delivery`, `meeting`, `newsletter`, `support`, `system-alert`, `personal`

Action options (translated EN+IT):
`none` (no action needed), `followup` (requires follow-up), `urgent` (respond within 24h), `decide` (requires a decision)

### Competitor Insights (from research)

| Competitor | Approach | Key Takeaway for PMSync |
|------------|----------|------------------------|
| **Superhuman** | 4 preset + custom AI-prompt labels (max 10, Business plan). No wizard — raw prompt writing. | PMSync's structured wizard is better UX than raw prompts. Cap at 20 labels. |
| **Shortwave** | 8 preset bundles + "Magic Labels" (sender-to-label memory). No user prompts — learns from actions. | Add sender override table in Sprint 18 for correction-driven learning. |
| **SaneBox** | Zero-config. Scans 4-6 weeks of headers (never body). 98% accuracy in 1-2 weeks. | Best bootstrap accuracy. PMSync should offer "Scan inbox" as optional quick-start. |
| **HEY** | Binary screener (yes/no per sender) + 3 fixed lanes (Imbox/Feed/Paper Trail). No AI. | The "first-time sender gate" concept is useful but too rigid for PMSync. |
| **Spark** | 3 fixed categories (People/Notifications/Newsletters). Zero-config ML. | Too simple for business use. PMSync's flexible labels are a differentiator. |

**Critical pitfalls to avoid (from PITFALLS.md):**
1. **Don't retroactively label all emails on first activation** — new emails only. Retroactive is opt-in, limited (last 14 days max).
2. **Batch all labels in single LLM call** — PMSync already does this. Don't break it.
3. **Max 2-3 labels per email** — enforce via `mutuallyExclusiveWith` + hard cap.
4. **Wizard must be short** — 4 steps max. Quick setup (name + who + what) should be possible in under 60 seconds.
5. **Show classification reason** — PMSync already stores `reasoning` field. Surface it in UI (Sprint 17).

---

## Sprint Backlog

### T-1601: Add structured label fields to Prisma schema [2 SP]
- [ ] Add to `UserLabel` model in `backend/prisma/schema.prisma`:
  - `roles String[] @default([])` — sender role tags
  - `contents String[] @default([])` — content type tags
  - `actionType String @default("none")` — `"urgent"` | `"followup"` | `"decide"` | `"none"`
- [ ] Create migration: `npx prisma migrate dev --name add-label-wizard-fields`
- [ ] Review generated SQL — must NOT contain DROP statements
- [ ] Run `npx prisma generate`
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1602: Remove default labels system [3 SP]
- [ ] Delete `DEFAULT_AI_USER_LABELS` array from `backend/src/modules/labels/default-user-labels.ts`
- [ ] Delete `ensureDefaultUserLabels()` function
- [ ] Keep `DefaultLabelDef` interface (rename to `LabelDef`) — still useful for typing
- [ ] Update `email-analysis.service.ts` `getUserLabels()`:
  - Remove call to `ensureDefaultUserLabels()`
  - Remove fallback to `DEFAULT_AI_USER_LABELS`
  - Return empty array if tenant has no labels
- [ ] Update `analyzeEmailUnified()` to handle zero-label case:
  - If no labels: skip label assignment, set `labels: []`, still produce summary/sentiment/intent/actionability
  - If no labels: set `lane` to null, skip label-based scoring
- [ ] Grep for all usages of `ensureDefaultUserLabels` and `DEFAULT_AI_USER_LABELS` — update or remove each
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1603: Create aiPrompt auto-generation from structured fields [2 SP]
- [ ] Create `backend/src/modules/labels/label-prompt-builder.ts` (max 150 lines)
- [ ] Implement `buildAiPromptFromMetadata(label: { name, roles, contents, actionType, aiPrompt? }): string`:
  - If `aiPrompt` is set (power user override), return it as-is
  - Otherwise compose from structured fields:
    ```
    Use for emails from [roles]. Content typically includes [contents]. Action: [actionType description].
    ```
  - Map role IDs to human descriptions (e.g. `"customer"` -> `"customers, clients, or paying accounts"`)
  - Map content IDs to descriptions (e.g. `"invoice"` -> `"invoices, billing, and payments"`)
  - Map action types to prompt instructions:
    - `"urgent"` -> `"Requires immediate attention. Mark as high priority."`
    - `"followup"` -> `"Requires follow-up. Set needsFollowUp=true."`
    - `"decide"` -> `"Requires a decision. Mark as actionable."`
    - `"none"` -> `"Informational only. No action needed."`
- [ ] Export role/content/action option definitions for frontend reuse
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1604: Update system prompt builder for dynamic labels [3 SP]
- [ ] Edit `email-analysis.service.ts` `buildLabelPromptBlock()`:
  - Group labels by `category` (workflow > semantic > suppression) with section headers
  - Use `buildAiPromptFromMetadata()` for each label's prompt text
  - Add `<MUTUAL_EXCLUSION_RULES>` block built from `mutuallyExclusiveWith` fields
  - Add instruction: "Assign 1-3 labels. Fewer is better — only assign when confident."
- [ ] Handle zero-labels case: return empty string (no `<LABEL_RULES>` block)
- [ ] Move `reasoning` to first field in JSON output schema in `en.ts` and `it.ts` prompt templates
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1605: Create label wizard REST endpoints [2 SP]
- [ ] Add to `backend/src/modules/labels/` controller (or create if not exists):
  - `GET /labels/wizard-options` — returns translated role/content/action options for the wizard
  - `POST /labels/wizard` — creates a label from wizard data: `{ name, color, category, roles, contents, actionType, mutuallyExclusiveWith?, suppressUrgency? }`
    - Auto-generates `aiPrompt` via `buildAiPromptFromMetadata()`
    - Auto-derives `defaultLane` from actionType:
      - `"urgent"` -> `"action-now"`
      - `"followup"` -> `"waiting-on-reply"`
      - `"decide"` -> `"action-now"`
      - `"none"` -> `"review-later"`
    - Validates name uniqueness per tenant
    - Max 20 labels per tenant
  - `PUT /labels/:id/wizard` — updates a label from wizard data (same fields)
  - `POST /labels/:id/preview` — given an email ID, shows what this label would match (dry-run using the generated aiPrompt)
- [ ] Add DTO validation with class-validator
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1606: Add translations for label wizard [2 SP]
- [ ] Add to `frontend/locales/en.ts` under `labels.wizard` namespace:
  - Wizard titles: `title`, `subtitle`, `stepName`, `stepClassify`, `stepBehavior`, `stepReview`
  - Step 1: `nameLabel`, `namePlaceholder`, `colorLabel`, `categoryLabel`
  - Step 2: `whoSends`, `whoSendsHelp`, `whatContains`, `whatContainsHelp`
  - Role options: `roles.supplier`, `roles.customer`, `roles.internal`, `roles.finance`, `roles.legal`, `roles.tech`, `roles.logistics`, `roles.any`
  - Content options: `contents.quote`, `contents.order`, `contents.invoice`, `contents.complaint`, `contents.infoRequest`, `contents.contract`, `contents.delivery`, `contents.meeting`, `contents.newsletter`, `contents.support`, `contents.systemAlert`, `contents.personal`
  - Step 3: `actionNeeded`, `action.none`, `action.followup`, `action.urgent`, `action.decide`
  - Behavior: `suppressUrgency`, `suppressUrgencyHelp`, `conflictsWith`, `conflictsWithHelp`
  - Step 4: `reviewTitle`, `generatedPrompt`, `editPromptAdvanced`
  - Actions: `createLabel`, `updateLabel`, `back`, `next`, `cancel`
  - Empty state: `emptyTitle`, `emptyDescription`, `createFirst`
  - Validation: `nameRequired`, `nameExists`, `rolesRequired`, `contentsRequired`, `actionRequired`, `maxLabels`
- [ ] Add same keys to `frontend/locales/it.ts` with Italian translations
- [ ] Add types to `frontend/locales/index.ts`
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1607: Create label wizard query hooks [1 SP]
- [ ] Create `frontend/hooks/queries/use-label-wizard.ts`:
  - `useLabelWizardOptions()` — fetches `GET /labels/wizard-options` with `staleTime: Infinity` (options don't change)
  - `useCreateLabelWizard()` — mutation for `POST /labels/wizard`
  - `useUpdateLabelWizard(id)` — mutation for `PUT /labels/:id/wizard`
  - `useLabelPreview(id, emailId)` — query for `POST /labels/:id/preview`
- [ ] Export from `frontend/hooks/queries/index.ts`
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1608: Create LabelWizardDialog component [3 SP]
- [ ] Create `frontend/src/components/labels/LabelWizardDialog.tsx` (max 400 lines)
- [ ] Use MUI `Stepper` (horizontal, `alternativeLabel`) inside `Dialog` (maxWidth `md`)
- [ ] 4 steps:
  - **Step 1 — Name & Color**: `TextField` for name, `ColorPickerPopover` for color, `Select` for category
  - **Step 2 — Classification**: Two `Autocomplete` (multi-select, chips) for roles and contents. Options from `useLabelWizardOptions()`. Chips with icons.
  - **Step 3 — Behavior**: `RadioGroup` for action type (4 options with icons). `Switch` for suppressUrgency. `Autocomplete` for mutuallyExclusiveWith (existing labels).
  - **Step 4 — Review**: Summary card showing all selections. Collapsible "Generated AI Prompt" preview. Edit buttons per section.
- [ ] Validation per step (React Hook Form or manual):
  - Step 1: name required, unique per tenant
  - Step 2: at least 1 role and 1 content
  - Step 3: action type required
- [ ] `DialogActions`: Back / Next / Create Label buttons
- [ ] Props: `open`, `onClose`, `onCreated`, `editLabel?` (for edit mode)
- [ ] All strings via translations (`t.labels.wizard.*`)
- [ ] Mobile: at `xs` breakpoint, use `MobileStepper` with dots
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1609: Create labels empty state & list integration [2 SP]
- [ ] Create `frontend/src/components/labels/LabelsEmptyState.tsx` (max 100 lines)
  - Illustration area (MUI `InboxOutlined` icon, large)
  - Title + description from translations
  - Primary CTA: "Create your first label" (opens wizard)
- [ ] Integrate into existing labels settings page:
  - Show `LabelsEmptyState` when label count is 0
  - Add "Create Label" button to labels list header (opens wizard)
  - Show label cards with role/content badges + action badge (like the example file)
  - Edit button on each label card (opens wizard in edit mode)
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1610: Validation & integration test [1 SP]
- [ ] Verify full flow manually:
  - Fresh tenant: sees empty state
  - Create label via wizard: name + roles + contents + action -> label appears in list
  - Generated `aiPrompt` is coherent
  - Edit label via wizard: changes persist
  - `analyzeEmailUnified()` uses wizard-created labels in prompt
  - Zero labels: analysis produces summary/sentiment but no label assignment
- [ ] `cd backend && npx tsc --noEmit` — PASS
- [ ] `cd frontend && npx tsc --noEmit` — PASS
- [ ] No circular dependencies: `npx madge --circular backend/src/modules/ai/ backend/src/modules/labels/`
- [ ] `email-analysis.service.ts` stays under 500 lines

---

## Dependencies

- Sprint 14 complete (schema fields, triage rules)
- Sprint 15 should be adjusted: `LabelResolutionService` must handle zero-labels case and use `buildAiPromptFromMetadata()` for prompt composition

## Risks

1. **Removing default labels breaks existing tenants** — existing tenants already have labels in DB (created by `ensureDefaultUserLabels`). Those labels stay, they just won't be auto-created for NEW tenants anymore. Existing labels are unaffected.
2. **Zero-label state in triage pipeline** — `email-analysis.service.ts` and all downstream services (scoring, lane assignment, follow-up) must gracefully handle `labels: []`. Test this explicitly.
3. **Migration safety** — Adding new columns with defaults is safe. No DROP statements expected.
4. **aiPrompt generation quality** — Auto-generated prompts from structured fields may be less nuanced than hand-written ones. The "Advanced" toggle lets power users override.

## Definition of Done

- [ ] `npx prisma migrate dev` succeeds with new fields
- [ ] `cd backend && npx tsc --noEmit` passes
- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] `DEFAULT_AI_USER_LABELS` and `ensureDefaultUserLabels` fully removed
- [ ] Fresh tenant sees empty state, can create label via wizard
- [ ] Created label has auto-generated `aiPrompt` from structured metadata
- [ ] `analyzeEmailUnified()` works with 0, 1, and 3+ user labels
- [ ] System prompt groups labels by category with mutual exclusion rules
- [ ] All strings translated EN + IT
- [ ] No files over 500 lines
