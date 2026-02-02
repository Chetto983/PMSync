# Phase 4: Email Composer - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Build core email writing experience with TipTap rich text editor (FE-03) and AI compose integration (FE-10). This includes the composer dialog, formatting toolbar, draft auto-save, attachments, and AI-assisted writing. Reply/forward threading is included. Search, filters, and kanban views are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Codebase Discovery (90% Already Implemented)
- Full TipTap integration exists via mui-tiptap (`ComposeEditor.tsx`)
- Comprehensive toolbar with 30+ formatting options (`EditorMenuControls.tsx`)
- AI compose menu with quick actions, tones, templates (`AiComposeMenu.tsx`)
- Inline AI result panel with accept/reject/modify flow (`AIInlineMenu.tsx`)
- Draft auto-save with 2-second debounce
- Undo send with 30-second countdown
- Schedule send functionality
- Default signature auto-insertion
- Attachments via react-dropzone (`ComposeAttachments.tsx`)
- Full i18n support

### Gap 1: AI Keyboard Shortcut
- Add `Cmd+J` (Mac) / `Ctrl+J` (Windows) to trigger AI compose menu
- Pattern from Superhuman - instant AI access without mouse
- Should open the existing `AiComposeMenu` popover

### Gap 2: Mobile Responsive Toolbar
- Current toolbar not responsive (30+ buttons on all screens)
- **Decision**: Collapsed toolbar on mobile (< 768px)
- Primary 5 buttons visible: Bold, Italic, Link, Attach, AI
- "More" button expands to full toolbar
- Bottom placement on mobile for thumb reach
- Touch targets: 44-48px minimum

### Gap 3: Mobile Compose View
- Full-screen compose on mobile (not dialog modal)
- Sticky header with Send/Cancel
- Floating bottom toolbar
- Swipe-to-dismiss option

### Spell Check & Grammar
- Use browser native spell check (already works with TipTap)
- Red underline on typos via contenteditable
- No custom grammar enhancement (complexity not justified)

### Claude's Discretion
- Tab-to-autocomplete (Gmail Smart Compose) - evaluate post-MVP, complex feature
- AI tone detection - nice-to-have, not required
- Attachment size limits - follow backend constraints
- Draft recovery UI on crash - standard browser warning sufficient

</decisions>

<specifics>
## Specific Ideas

**Competitor Research References:**
- "Superhuman Cmd+J pattern - muscle memory for power users"
- "Gmail mobile: bottom toolbar, collapsed by default, thumb-friendly"
- "Gmail Smart Compose: gray text suggestions, Tab to accept" (deferred)
- "100ms rule - AI must feel instant or show loading state"

**Touch Target Standards (Apple/Google HIG):**
- Minimum 44x44px (Apple) / 48x48dp (Material)
- 8px spacing between targets
- Bottom navigation for thumb zone

**Existing Patterns to Follow:**
- Use existing `aiApi.composeEmail` backend
- Follow `AIInlineMenu.tsx` animation patterns (framer-motion)
- Match existing i18n structure in `locales/en.ts`

</specifics>

<deferred>
## Deferred Ideas

- **Tab-to-autocomplete (Gmail Smart Compose)** - Complex real-time prediction, evaluate post-MVP
- **AI grammar suggestions** - Beyond spell check, would need backend integration
- **Voice-to-text compose** - Future accessibility feature
- **Collaborative editing** - Real-time multi-user, separate phase entirely
- **Template library management** - User-saved templates, could be Phase 6

</deferred>

---

*Phase: 04-email-composer*
*Context gathered: 2026-02-02*
