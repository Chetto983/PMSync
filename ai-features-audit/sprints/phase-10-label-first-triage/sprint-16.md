# Sprint 16 — Onboarding UI & Label Prompt Authoring

| Campo | Valore |
|-------|--------|
| **Phase** | 10 — Label-First Triage |
| **Sprint** | 16 |
| **SP** | 14 |
| **Objective** | Build the first-run triage onboarding flow and label prompt editing UI so users can teach the system their rules |
| **Addresses** | LFT-A1, LFT-A2, LFT-C2 |

---

## Sprint Backlog

### T-1601: Add translations for triage onboarding [1 SP]
- [ ] Add to `frontend/locales/en.ts` under `triage` namespace:
  - `triage.onboarding.title`, `triage.onboarding.subtitle`
  - `triage.onboarding.step1Title` ("Your important contacts")
  - `triage.onboarding.step1Description` ("Add domains or senders that matter most")
  - `triage.onboarding.step2Title` ("Your projects & topics")
  - `triage.onboarding.step2Description` ("Add keywords or phrases that identify your work")
  - `triage.onboarding.step3Title` ("System alerts")
  - `triage.onboarding.step3Description` ("Which services send you automated alerts?")
  - `triage.onboarding.complete`, `triage.onboarding.skip`, `triage.onboarding.back`, `triage.onboarding.next`
  - `triage.labels.editPrompt`, `triage.labels.promptGuidance`, `triage.labels.promptExample`
  - `triage.labels.suppressUrgency`, `triage.labels.defaultLane`
  - `triage.rules.domain`, `triage.rules.sender`, `triage.rules.keyword`, `triage.rules.phrase`
  - `triage.rules.addRule`, `triage.rules.removeRule`, `triage.rules.maxRules`
- [ ] Add same keys to `frontend/locales/it.ts`
- [ ] Add types to `frontend/locales/index.ts`
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1602: Create triage rules API hooks [2 SP]
- [ ] Create `frontend/hooks/queries/use-triage-rules.ts`
- [ ] Add API module `frontend/lib/api/triage.ts`:
  - `getTriageRules()` → `GET /ai/triage-rules`
  - `updateTriageRules(rules)` → `PUT /ai/triage-rules`
  - `previewTriageRule(emailId)` → `POST /ai/triage-rules/preview`
- [ ] Create query hooks:
  - `useTriageRules()` with `queryOptions({ staleTime: 5 * 60_000, gcTime: 30 * 60_000 })`
  - `useUpdateTriageRules()` mutation with cache invalidation
- [ ] Export from hooks index
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1603: Build onboarding stepper component [4 SP]
- [ ] Create `frontend/src/components/triage/OnboardingStepper.tsx` (max 300 lines)
- [ ] 3-step MUI Stepper:
  - **Step 1: Important Contacts** — domain/sender chip input, e.g. `acme.com`, `boss@company.com`
  - **Step 2: Projects & Topics** — phrase input, e.g. `Project Alpha`, `Q2 planning`
  - **Step 3: System Alerts** — checkboxes for common services (GitHub, Vercel, Railway, Sentry, AWS) + custom input
- [ ] Each step maps to triage rules (`type: 'domain'/'sender'/'keyword'/'phrase'`)
- [ ] On complete: call `useUpdateTriageRules()` mutation
- [ ] Show success state with "Your inbox is learning" message
- [ ] Handle loading/error/empty states per CLAUDE.md rules
- [ ] Use MUI theme colors only, no hardcoded CSS
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1604: Build label prompt editor [3 SP]
- [ ] Create `frontend/src/components/triage/LabelPromptEditor.tsx` (max 250 lines)
- [ ] For each user label, show:
  - Label name + color chip
  - `aiPrompt` text field (multiline, max 300 chars)
  - Guidance tooltip: "Describe when to use this label using phrases like 'Use when the email...'"
  - `suppressUrgency` toggle with explanation
  - `defaultLane` dropdown (optional)
- [ ] Inline save per label (optimistic update via TanStack Query)
- [ ] Show "Examples: *Use when the email is from a paying customer asking for help*" below each prompt field
- [ ] Use existing label CRUD hooks if available, else create `useUpdateLabel()` mutation
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1605: Wire onboarding into settings and first-run detection [2 SP]
- [ ] Add onboarding entry point in settings page (existing settings layout)
- [ ] Add "Triage Setup" section or tab linking to onboarding stepper
- [ ] Add first-run detection: if `triageRules` is empty for tenant, show banner in email list view:
  - "Set up smart triage to organize your inbox" → links to onboarding
- [ ] Add "Edit label rules" link in label management UI (existing labels page)
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1606: Add label prompt editor to existing labels management page [2 SP]
- [ ] Find existing labels management page/component
- [ ] Add `aiPrompt` editing inline (use `LabelPromptEditor` component or integrate directly)
- [ ] Add `suppressUrgency` toggle and `defaultLane` picker per label
- [ ] Ensure existing label CRUD (create/edit/delete/reorder) still works
- [ ] Verify with `cd frontend && npx tsc --noEmit`

---

## Dependencies

- Sprint 14 complete (backend API endpoints for triage rules)
- Sprint 15 complete (label metadata fields in schema)

## Risks

1. Onboarding stepper must stay under 3 steps — resist scope creep.
2. Label prompt editor could become complex if it tries to preview LLM behavior inline. Keep it simple: edit prompt, save, see results on next triage.
3. First-run detection must not block email list loading — show as non-blocking banner.

## Definition of Done

- [ ] `cd frontend && npx tsc --noEmit` passes
- [ ] Onboarding stepper creates triage rules via API
- [ ] Label prompt editor saves `aiPrompt`, `suppressUrgency`, `defaultLane`
- [ ] First-run banner appears when no rules exist
- [ ] Settings page has "Triage Setup" entry point
- [ ] All strings use translations (en + it)
- [ ] All components use MUI theme colors
