# Phase 153 - Label Hardening Improvement Spec

## Purpose

This document turns the audit into execution streams so label hardening can ship without re-deciding the core architecture.

It is not the fix phase itself.

## Stream A - Authoritative label definition path

### Goal

Collapse semantic label creation and semantic label editing to one authoritative backend path.

### Required outcomes

- the same invariants apply no matter how a semantic label is created
- raw CRUD no longer bypasses wizard hardening
- active frontend label-definition surfaces point at the same semantic API

### Implementation direction

- introduce one shared persistence helper for semantic label writes
- have both wizard and any retained non-wizard semantic flows call that helper
- keep raw update only for structural operations that legitimately need it:
  - `parentId`
  - `orderIndex`
  - possibly color-only changes if intentionally supported
- either remove or clearly demote legacy raw semantic create/edit clients:
  - `LabelDialog`
  - `useCreateLabel`
  - label-store create/update paths

### Acceptance

- no semantic label can be created without the same validation set
- move/reorder still works without forcing the full wizard path

## Stream B - Exclusivity hardening and rename safety

### Goal

Make `mutuallyExclusiveWith` deterministic, valid, and safe under rename.

### Required outcomes

- exclusions only reference real labels
- exclusivity is bidirectional
- rename cannot silently leave stale exclusion metadata behind
- contradiction resolution does not depend on accidental label order

### Implementation direction

- choose one model:
  1. migrate exclusivity references from names to stable ids, or
  2. keep names but add fan-out repair on rename and strict validation
- validate exclusions on create/update
- automatically apply the reverse exclusion edge
- add regression tests for:
  - A excludes B -> B excludes A
  - rename of excluded label
  - contradiction resolution with reversed label order

### Acceptance

- exclusivity remains correct after rename
- asymmetric exclusion inputs cannot persist as live state

## Stream C - Onboarding contract reconciliation

### Goal

Make triage onboarding unambiguous about whether it creates labels or only stores rules.

### Required outcomes

- preview/apply behavior matches controller docs and frontend copy
- `willCreate` semantics are either real or removed
- onboarding no longer feels like a broken label wizard

### Implementation direction

- decide explicitly:
  - `rules-only onboarding` is the cleaner choice if stock labels remain intentionally removed, or
  - `materializing onboarding` if recommended labels must become real labels
- then align:
  - `TriageSetupForm`
  - controller descriptions
  - preview response shape
  - integration tests

### Acceptance

- no onboarding surface implies label creation when labels are not created
- tests assert the chosen contract, not a mixture of two contracts

## Stream D - Duplicate and prompt-quality hardening

### Goal

Prevent label overlap and poor prompt definitions at creation time instead of relying on later cleanup.

### Required outcomes

- near-duplicate labels are warned or blocked
- low-quality `aiPrompt` content is surfaced to the user
- manual overrides still exist, but they are not completely ungoverned

### Implementation direction

- keep exact slug uniqueness, but add:
  - Levenshtein / near-name duplicate checks
  - semantic overlap checks for prompt meaning
  - prompt quality scoring
- decide whether prompt quality is:
  - blocking on fail, or
  - warning-only with override
- ensure wizard-generated prompts and manual overrides both pass through the same evaluator

### Acceptance

- creating two semantically overlapping labels produces a warning or rejection
- obviously weak prompts do not pass silently

## Stream E - Test and docs hardening

### Goal

Make label hardening verification trustworthy enough that future changes do not reintroduce duplicate systems.

### Required outcomes

- backend integration specs match real mocked behavior
- label hardening debug commands are documented and reproducible
- frontend/backend label tests clearly map to the active architecture

### Implementation direction

- fix stale expectations in `labels.service.spec.ts`
- document which label tests are Jest-based vs Vitest-based
- reduce backend label-spec memory pressure where practical
- update phase docs as the architecture is consolidated

### Acceptance

- the canonical backend label integration spec passes for the right reason
- engineers can run a small supported label-hardening suite without rediscovering the workflow

## Suggested execution order

1. Consolidate the authoritative semantic write path.
2. Make exclusivity rename-safe and bidirectional.
3. Reconcile onboarding contract language and behavior.
4. Add duplicate/prompt hardening.
5. Clean up tests, retained legacy clients, and docs.
