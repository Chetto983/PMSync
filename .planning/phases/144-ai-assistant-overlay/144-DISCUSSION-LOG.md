# Phase 144: AI Assistant Overlay - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 144-ai-assistant-overlay
**Areas discussed:** Trigger & shortcut, Panel scope, Context injection, Panel behavior

---

## Trigger & Shortcut

| Option | Description | Selected |
|--------|-------------|----------|
| Cmd+J | Adjacent to Cmd+K, easy to remember as a pair. No known conflict. | ✓ |
| Cmd+Shift+A | A for Assistant. More explicit, less discoverable. | |
| Cmd+I | I for Intelligence. May conflict with italic in rich text. | |
| Cmd+. (period) | Used by GitHub Copilot. Unconventional. | |

**User's choice:** Cmd+J
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Header icon button | Top-right header bar, always visible. Industry standard. | ✓ |
| Sidebar bottom icon | AI icon in 64px rail below 4 pillars. | |
| Both header + sidebar | Maximum discoverability. | |
| Keyboard only | Cleanest UI, power-user approach. | |

**User's choice:** Header icon button
**Notes:** User requested web research on 2026 best practices. Research confirmed header icon button is the industry standard (Copilot, Notion, Linear, Superhuman).

---

## Panel Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full chat | Thread list + messages + tool UIs. Reuses ChatPage.tsx. | ✓ |
| Single conversation only | No thread list. Lighter, more focused. | |
| Adaptive | Single-conversation focused with toggle to full thread list. | |

**User's choice:** Full chat
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both (page + overlay) | Overlay for quick access, full page for deep sessions. | |
| Remove the page | Overlay replaces page entirely. | |
| You decide | Claude's discretion. | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on whether to keep or remove /dashboard/ai page.

---

## Context Injection

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-inject on open | Detect current page and inject context into system message. | ✓ |
| Explicit 'Ask about this' button | User clicks button to pass context. | |
| Both auto + explicit | Auto-injects + manual 'Add context' button. | |

**User's choice:** Auto-inject on open
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Update on navigation | Context updates when user navigates. | ✓ |
| Sticky to original context | Locked to page where overlay was opened. | |
| Ask before updating | Banner asks user to confirm context update. | |

**User's choice:** Update on navigation
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Rich context | Subject, sender, body snippet, linked entities per page type. | ✓ |
| Minimal context | Just entity type + ID. AI fetches details via tools. | |
| You decide | Claude's discretion. | |

**User's choice:** Rich context
**Notes:** None

---

## Panel Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed ~420px | Standard sidebar width. Consistent with existing patterns. | |
| Responsive 30-40% viewport | Scales with screen size. | |
| Resizable by user | Drag handle to resize width. | ✓ |

**User's choice:** Resizable by user
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, localStorage | Persists resized width across sessions. | ✓ |
| No, reset each time | Always opens at default width. | |
| You decide | Claude's discretion. | |

**User's choice:** Yes, localStorage
**Notes:** Key: pmsync:ai-overlay-width

| Option | Description | Selected |
|--------|-------------|----------|
| Cmd+J toggle + X + Esc | Standard trifecta for dismissal. | ✓ |
| Cmd+J toggle + X only | No Esc to prevent accidental closure. | |
| You decide | Claude's discretion. | |

**User's choice:** Cmd+J toggle + X button + Esc
**Notes:** None

**Reopen behavior:** User specified "load history from user" — overlay loads full conversation history (thread list) from backend on open. All existing threads accessible.

| Option | Description | Selected |
|--------|-------------|----------|
| Overlay (float on top) | Slides over with backdrop/shadow. Page stays in place. | |
| Push content | Pushes main content narrower. | |
| You decide | Claude's discretion on Drawer variant. | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on MUI Drawer variant (temporary vs persistent).

---

## Claude's Discretion

- Whether to keep or remove /dashboard/ai page (D-04/D-05 scope)
- MUI Drawer variant: temporary (overlay) vs persistent (push content)
- Animation/transition style
- Backdrop overlay vs shadow on panel edge

## Deferred Ideas

- Auto-opening panel based on email content (anti-pattern per 2026 research)
- Voice input for AI overlay
- Multi-panel layout (AI + CRM context simultaneously)
- Mobile bottom sheet variant
