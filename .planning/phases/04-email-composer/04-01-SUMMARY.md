---
phase: 04-email-composer
plan: 01
subsystem: frontend/email-composer
tags: [tiptap, keyboard-shortcut, ai-compose, accessibility]
dependency-graph:
  requires: [existing-ai-compose-menu]
  provides: [keyboard-triggered-ai-menu]
  affects: [user-productivity, accessibility]
tech-stack:
  added: []
  patterns: [tiptap-custom-extension, ref-based-popover-anchoring]
key-files:
  created:
    - frontend/components/email/compose/aiShortcutExtension.ts
  modified:
    - frontend/components/email/compose/useExtensions.ts
    - frontend/components/email/compose/ComposeEditor.tsx
    - frontend/components/email/compose/EditorMenuControls.tsx
decisions:
  - "Use Mod-j shortcut (TipTap handles Mac/Windows automatically)"
  - "Ref-based anchor for keyboard-triggered Popover to avoid (0,0) positioning"
  - "Focus returns to editor after AI menu closes"
metrics:
  duration: ~25min
  completed: 2026-02-03
---

# Phase 04 Plan 01: AI Keyboard Shortcut Summary

Custom TipTap extension with Mod-j (Cmd+J Mac / Ctrl+J Windows) keyboard shortcut for AI compose menu.

## What Was Built

### Task 1: AI Shortcut TipTap Extension
Created `aiShortcutExtension.ts` with:
- `AiShortcutExtension` using TipTap Extension.create()
- `AiShortcutOptions` interface with `onTriggerAi` callback
- `Mod-j` keyboard shortcut registration
- Returns `true` to prevent browser default (Chrome downloads bar on Ctrl+J)

### Task 2: Wire Extension to ComposeEditor
Updated three files to integrate the keyboard shortcut:

**useExtensions.ts:**
- Added `onTriggerAi?: () => void` option
- Conditionally includes `AiShortcutExtension` when callback provided

**ComposeEditor.tsx:**
- Added `aiButtonRef` to anchor keyboard-triggered Popover
- Modified `handleOpenAiMenu` to accept `fromKeyboard` parameter
- Added `handleOpenAiMenuFromKeyboard` callback for extension
- Updated `handleCloseAiMenu` to return focus to editor
- Pass `onTriggerAi` to `useExtensions`
- Pass `aiButtonRef` to `EditorMenuControls`

**EditorMenuControls.tsx:**
- Added `aiButtonRef` prop type
- Updated `onAiCompose` prop to accept optional parameters
- Attached ref to AI IconButton in both mobile and desktop views

## Commits

| Commit | Description |
|--------|-------------|
| a5d1c29a | feat(04-01): create AI shortcut TipTap extension |
| 51704cf8 | feat(04-01): wire AI shortcut extension to ComposeEditor |

## Key Technical Decisions

### Mod-j Shortcut
TipTap's `Mod` prefix automatically maps to Cmd on Mac and Ctrl on Windows. Using `Mod-j` provides cross-platform keyboard shortcut without platform detection.

### Ref-Based Popover Anchoring
**Problem:** Keyboard shortcut has no MouseEvent, so no `event.currentTarget` for Popover anchor.
**Solution:** Use `aiButtonRef` attached to AI button as anchor element when triggered via keyboard.

### Focus Return
After AI menu closes, focus returns to editor via `rteRef.current?.editor?.commands.focus()` to maintain keyboard-centric workflow.

## Verification

- TypeScript compilation: Pass
- Lint (our files): Pass
- Pre-existing lint errors in other files (shimmer.tsx, speech-input.tsx) not addressed

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Ready to proceed with remaining Phase 04 plans:
- 04-04: Attachment handling
- 04-05: Draft auto-save
