# Phase 10: UI Review - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Visual polish pass across the entire frontend — ensure all pages, components, and tool renderers meet 2026 design standards with consistent theming, spacing, and responsive behavior. No new features or capabilities.

</domain>

<decisions>
## Implementation Decisions

### Audit scope & priority
- Full sweep: every page, every component, every state — no pages skipped
- Equal treatment across all pages (chat, email, dashboard, follow-ups, etc.) — no section gets extra weight
- Chrome included: sidebar, header, navigation, breadcrumbs — the full shell gets reviewed
- Organized by page: audit one page at a time, fix everything on that page before moving on
- All states included: loading skeletons, empty states, error states — all must be visually polished
- Minor backend changes are acceptable if they unblock a visual fix (e.g., adding a field to an API response)
- Before/after screenshots for every page — stored in `.planning/phases/10-ui-review/`

### Visual standards & reference
- Hybrid vibe: MUI for layout/structure, but chat/ai-elements should feel like shadcn/assistant-ui (clean, modern, minimal)
- Border radius: 8-12px rounded for cards, buttons, inputs — modern SaaS look
- Shadows: soft subtle shadows (shadow-sm/shadow-md) on cards and popovers for gentle depth
- Typography: spacious & readable — generous line heights, 14-16px body text, comfortable padding
- Color palette: enforce existing theme (teal primary, purple secondary, semantic colors) — fix any hardcoded hex values
- assistant-ui: copy patterns where useful — if assistant-ui has a pattern that solves a visual problem better, adopt it
- Icons: standardize on Lucide across the entire app — replace MUI icons with Lucide for visual consistency
- Micro-interactions: noticeable polish — scale effects on buttons, slide-in reveals, smooth state transitions, premium feel

### Finding categories & handling
- Three-tier classification: P0 (breaks UX), P1 (looks bad), P2 (minor polish)
- Fix everything: this is the polish phase — every finding gets resolved, no deferral
- Fix at the source: if a shared component has a visual issue, fix it once — all consumers benefit
- Workflow: audit first, then fix — screenshot every page, catalog all findings, then fix systematically

### Responsive & accessibility
- All four breakpoints: 375px (mobile), 768px (tablet), 1024px (laptop), 1440px (desktop)
- Comprehensive WCAG AA: focus indicators, ARIA roles, skip links, reduced motion, form labels, color contrast, keyboard navigation, screen reader labels
- Dark mode included: dark mode exists and must be polished alongside light mode
- Testing method: Playwright MCP screenshots at each breakpoint — automated and reproducible

### Claude's Discretion
- Exact audit page order (which page to start with)
- How to organize the screenshot catalog
- Specific Playwright viewport configurations
- Whether to split dark mode into a separate plan or interleave with light mode review

</decisions>

<specifics>
## Specific Ideas

- assistant-ui (https://github.com/assistant-ui/assistant-ui) as primary reference for chat UI quality and patterns — copy patterns where they clearly improve quality
- shadcn/ui aesthetic for ai-elements: clean, minimal, lots of white space
- Before/after documentation for every page to track improvement

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-ui-review*
*Context gathered: 2026-02-07*
