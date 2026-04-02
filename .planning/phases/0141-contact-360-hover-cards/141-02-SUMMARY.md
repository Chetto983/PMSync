---
phase: "0141-contact-360-hover-cards"
plan: "02"
subsystem: "frontend"
tags: [hover-card, crm-context, popover, contacts]
dependency_graph:
  requires: [crm-context-api, use-crm-context-hook]
  provides: [useHoverPopover, ContactHoverCard, ContactName]
  affects: [ThreadListItem, ExpandedMessage, ContactListItem]
tech_stack:
  added: []
  patterns: [hover-popover-delay, pointer-events-none-popover]
key_files:
  created:
    - frontend/hooks/use-hover-popover.ts
    - frontend/components/contacts/ContactHoverCard.tsx
    - frontend/components/contacts/ContactName.tsx
  modified:
    - frontend/components/email/list/ThreadListItem.tsx
    - frontend/components/email/thread/ExpandedMessage.tsx
    - frontend/components/contacts/ContactListItem.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts
decisions:
  - "pointer-events none/auto pattern on MUI Popover for flicker-free hover cards"
  - "extractEmailAddress reused from existing email-formatters utility"
  - "ContactName as inline span to avoid layout disruption in existing surfaces"
metrics:
  duration: "172s"
  completed: "2026-04-02"
  tasks_completed: 2
  tasks_total: 3
  checkpoint_pending: true
---

# Phase 141 Plan 02: Contact Hover Card System Summary

Reusable hover card system with useHoverPopover hook, ContactHoverCard (CRM context popover), and ContactName wrapper integrated into email list, thread view, and contacts list.

## What Was Done

### Task 1: Hover popover hook, ContactHoverCard, and ContactName components (9118c728)

- Created `useHoverPopover` hook with configurable open/close delays (300ms/200ms), flicker prevention via timer cancellation when mouse enters popover content
- Created `ContactHoverCard` component showing CRM context (name, company, up to 2 deals with stage chips, email count, last interaction as relative date, "View profile" link)
- Created `ContactName` as a drop-in Typography replacement that adds hover card behavior when an email is provided
- Added i18n keys for en (deals, last interaction, emails, no deals, view profile, no data) and it translations
- Uses existing `useCrmContextByEmail` hook (TanStack Query cached, staleTime 5min) -- no new API endpoints needed

### Task 2: Integrate ContactName into three surfaces (6cdd09ab)

- **ThreadListItem**: Replaced plain sender name Typography with ContactName using extractEmailAddress utility
- **ExpandedMessage**: Replaced sender name in expanded email header with ContactName
- **ContactListItem**: Replaced contact display name with ContactName using primaryEmail

All integrations preserve existing layout, spacing, and click handlers. ContactName renders as inline span to avoid disrupting flex layouts.

## Deviations from Plan

None -- plan executed exactly as written.

## Checkpoint Pending

Task 3 (human-verify) requires manual verification of hover card behavior across all three surfaces. Automated tasks complete; awaiting user approval.

## Known Stubs

None -- all components are fully wired to the CRM context API.

## Self-Check: PASSED

- [x] frontend/hooks/use-hover-popover.ts exists
- [x] frontend/components/contacts/ContactHoverCard.tsx exists
- [x] frontend/components/contacts/ContactName.tsx exists
- [x] Commit 9118c728 exists
- [x] Commit 6cdd09ab exists
- [x] TypeScript type-check passes (no new errors)
