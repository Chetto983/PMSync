# Phase 19: AI Draft Generation - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

AI generates full reply drafts in the user's writing style when replying to emails. User can accept, edit, or regenerate drafts. System learns from user edits to improve future drafts. Depends on Phase 13 (tokenized PII) and Phase 18 (triage context). New compose and forwarding are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Draft Trigger & Flow
- Auto-suggest on reply: when user hits Reply, AI pre-fills a full draft automatically
- Full reply draft generated (greeting, body, sign-off) — not short suggestions or multiple options
- Replies only — no draft generation for new compose or forwards
- Cursor lands at end of draft for quick-send power-user flow
- User can always clear the draft and write manually

### Writing Style Capture
- Auto-analyze last 50 sent emails per account to extract style patterns
- User can also provide manual writing samples as override
- Style profile is per email account (work = formal, personal = casual)
- Tone selector available: "More formal", "More casual", "Shorter", "More detailed" adjustments
- Visible style summary in settings showing extracted patterns (greeting, tone, sign-off) — user can correct
- Weekly auto-refresh of style profile from new sent emails
- Language detection: draft matches incoming email language (e.g., Italian email → Italian reply using Italian style)
- Signature/sign-off handled separately from body style — signature comes from account settings, not AI-generated

### Review & Edit Experience
- Draft appears inline in the composer, not side-by-side or ghost text
- Subtle "AI Draft" badge above composer — disappears once user starts editing
- Regenerate button with optional instruction field ("make it shorter", "more formal", etc.)
- "Restore original AI draft" link available after user edits — recoverable until send

### Learning from Edits
- Track accept/edit/reject for every AI draft generated
- Learn from diffs: compare AI draft vs what user actually sent, extract correction patterns
- Improvements take effect on the very next draft (immediate feedback loop)
- Draft quality stats visible in settings: accept rate, average edits, total drafts generated

### Claude's Discretion
- Loading/generating animation while draft is being created
- Exact keyboard shortcuts for accept/regenerate/clear
- Error state handling when AI generation fails
- How diff-based learning is stored and applied (embedding approach, storage format)

</decisions>

<specifics>
## Specific Ideas

- Flow should feel like Superhuman's AI draft — instant, in-place, minimal friction
- Tone selector inspired by LinkedIn's message tone feature — quick toggle, not a settings page
- Style summary should be concise like "Greeting: Hi [name], Tone: semi-formal, Sign-off: Best regards" — not a wall of text
- Badge behavior like GitHub Copilot: present but non-intrusive, gone once you engage

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-ai-draft-generation*
*Context gathered: 2026-02-26*
