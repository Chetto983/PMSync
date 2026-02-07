# Phase 05: Nested Labels Frontend - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Tree view UI in the sidebar for managing hierarchical label nesting. Users can visualize, reorder, nest/unnest, create, edit, and delete labels via drag-drop and context menu. Search that includes child labels is in scope. Backend API already shipped in v2.1 (API-01). Max depth: 5 levels.

</domain>

<decisions>
## Implementation Decisions

### Tree visual design
- Vertical guide lines connecting parent to children (VS Code file tree style), 16px indent per level
- First 2 levels at 16px indent, levels 3+ at 8px indent to keep sidebar tight
- Small chevron arrow for expand/collapse. Clicking the label name navigates (filters emails by that label).
- Colored left border on each label row (uses label's assigned color)
- Aggregate unread count on parent labels (sum of all children's counts)
- Collapsed by default on page load. Remembers expansion state across sessions.
- Empty parent labels (no direct emails, only children) are dimmed/muted visually
- Auto-expand parent labels when a nested label is selected (e.g., from search or URL navigation)

### Drag-drop behavior
- Zone-based: dropping ON a label nests it as a child; dropping BETWEEN labels reorders at the same level (Notion sidebar pattern)
- Semi-transparent ghost preview of the label follows the cursor during drag, target area highlights
- Dragging a parent moves the entire subtree (all children travel with it)
- Attempting to drop beyond 5-level max depth: drop zone turns red/disabled, label snaps back. No toast needed.

### Label management actions
- "+" New Label" button opens a modal dialog with: name, color picker, optional parent dropdown
- Renaming opens the same modal, pre-filled with current name/color/parent
- "Add child label" available via context menu (pre-selects parent in modal) AND via the modal parent dropdown
- Right-click context menu for desktop: Edit, Add child label, Change color, Move to..., Delete
- Three-dot icon on hover for discoverability and mobile. Same actions as context menu.
- Deleting a label with children: entire subtree deleted. Confirmation dialog warns about this.
- Emails tagged with deleted labels simply lose the label (no reassignment to parent)
- No undo snackbar after deletion — confirmation dialog is the safety net
- Color picker: preset palette of 12-16 colors as clickable swatches (Gmail style). No custom hex.

### Claude's Discretion
- Exact preset color palette selection (align with MUI theme)
- Loading skeleton design for tree
- Error state handling for failed API calls
- Animation timing for expand/collapse transitions
- Exact ghost preview opacity and drag threshold

</decisions>

<specifics>
## Specific Ideas

- Guide lines like VS Code file tree for visual hierarchy
- Zone-based drag like Notion sidebar (ON = nest, BETWEEN = reorder)
- Modal-based creation/editing (not inline) for consistency
- Gmail-like preset color swatches

</specifics>

<deferred>
## Deferred Ideas

- Email triage integration with labels (connect priority scoring to label organization) — belongs in Phase 03 or future phase linking triage + labels

</deferred>

---

*Phase: 05-nested-labels-frontend*
*Context gathered: 2026-02-07*
