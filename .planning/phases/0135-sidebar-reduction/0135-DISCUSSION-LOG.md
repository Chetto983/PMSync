# Phase 135: Sidebar Reduction & Route Preservation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 135-sidebar-reduction
**Areas discussed:** Pillar mapping, Hidden route discovery, Sidebar density, Migration cleanup

---

## Pillar Mapping

### Q1: What happens to Dashboard/Home?

| Option | Description | Selected |
|--------|-------------|----------|
| Tasks becomes home | /dashboard redirects to /dashboard/tasks. Tasks is new landing after login. | |
| Mail becomes home | /dashboard redirects to /dashboard/email. Email-first app. | |
| Keep Home as-is | Home stays as a 5th pillar showing existing dashboard widgets. | ✓ |

**User's choice:** Keep Home as-is
**Notes:** Home remains a 5th pillar. This means 5 pillars, not the 4 originally stated in requirements.

### Q2: Follow-ups, Reminders, AI Assistant in the gap?

| Option | Description | Selected |
|--------|-------------|----------|
| URLs still work, no sidebar entry | Routes remain functional via direct URL. Cmd+K restores discoverability. | ✓ |
| Collapse into 'More' overflow menu | Subtle '...' or 'More apps' link at sidebar bottom. | |
| Keep them visible under Tasks pillar | Show as sub-items under Tasks icon. | |

**User's choice:** URLs still work, no sidebar entry

### Q3: Tasks pillar link before Phase 138?

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder page | /dashboard/tasks shows 'Coming soon' or empty state. | ✓ |
| Link to Follow-ups for now | Temporarily links to /dashboard/ai/follow-ups. | |
| Don't show Tasks yet | Only show 4 pillars until Phase 138. | |

**User's choice:** Placeholder page

### Q4: Tasks pillar icon?

| Option | Description | Selected |
|--------|-------------|----------|
| CheckSquare | Classic task/to-do icon. Clear, distinct. | ✓ |
| ListTodo | Lucide list-todo icon. | |
| ClipboardList | Clipboard with list. | |

**User's choice:** CheckSquare

### Q5: Home pillar icon order?

| Option | Description | Selected |
|--------|-------------|----------|
| Home first (keep current) | Home > Mail > Calendar > Contacts > Tasks. | ✓ |
| Mail first | Mail > Calendar > Contacts > Tasks > Home. | |
| You decide | Claude picks. | |

**User's choice:** Home first

### Q6: Should Home content change?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave Home content as-is | Only sidebar changes. Phase 145 redesigns Home. | ✓ |
| Strip to minimal landing | Simplify Home to basic welcome + quick links. | |
| Remove Home page entirely | Delete Home. Users land on Mail. | |

**User's choice:** Leave Home content as-is

### Q7: Section headers?

| Option | Description | Selected |
|--------|-------------|----------|
| No section headers | Flat list of pillar icons/labels. | ✓ |
| Keep a single header | One "Navigation" header above pillars. | |
| You decide | Claude picks. | |

**User's choice:** No section headers

---

## Hidden Route Discovery

### Q1: Any hint that hidden routes exist?

| Option | Description | Selected |
|--------|-------------|----------|
| URL-only, no hints | Clean break. Cmd+K comes right after. | ✓ |
| Temporary 'More' menu | '...' link at sidebar bottom listing hidden routes. | |
| Footer links in Home dashboard | Quick-link tiles on Home page for CRM routes. | |

**User's choice:** URL-only, no hints

### Q2: Should removed routes return 404?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep all page files | Don't delete any pages. Routes render normally when visited. | ✓ |
| Add redirect middleware | Keep pages but redirect old CRM routes to hub page. | |
| Hide pages behind feature flag | Pages show 'Feature moved' message. | |

**User's choice:** Keep all page files

---

## Sidebar Density

### Q1: Empty space approach?

| Option | Description | Selected |
|--------|-------------|----------|
| Icon rail only | Always 64px icon rail. No expanded text mode. Remove toggle. Superhuman-like. | ✓ |
| Keep expand/collapse | Preserve current 64px/220px toggle behavior. | |
| Slim labeled sidebar | ~140px always-expanded with small icon+label rows. | |

**User's choice:** Icon rail only

### Q2: DnD reordering?

| Option | Description | Selected |
|--------|-------------|----------|
| Remove DnD | 5 fixed pillars don't need reordering. Simplifies code. | |
| Keep DnD | Users can reorder even 5 items. | ✓ |

**User's choice:** Keep DnD

### Q3: Mobile sidebar?

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom tab bar | Fixed bottom bar with 5 pillar icons + Settings. Native app feel. | ✓ |
| Keep mobile drawer | Temporary overlay Drawer with hamburger menu. | |
| You decide | Claude picks. | |

**User's choice:** Bottom tab bar

### Q4: Logo in rail?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep logo in rail | Small 32px logo icon at top. | ✓ |
| Remove logo from rail | No logo in sidebar, move to header. | |
| You decide | Claude picks. | |

**User's choice:** Keep logo in rail

---

## Migration Cleanup

### Q1: Stale localStorage keys?

| Option | Description | Selected |
|--------|-------------|----------|
| Clean up on load | Detect and remove old keys. Main key auto-invalidated by existing validation. | ✓ |
| Leave them | Old keys sit unused. No cleanup code. | |
| Version the storage keys | Change prefix to v2. Old keys never collide. | |

**User's choice:** Clean up on load

### Q2: useSidebarOrder hook refactor?

| Option | Description | Selected |
|--------|-------------|----------|
| Simplify to single section | Remove section concept. One 'pillars' list. | ✓ |
| Keep multi-section hook | Leave as-is, call once with 'pillars'. | |
| You decide | Claude picks. | |

**User's choice:** Simplify to single section

---

## Claude's Discretion

- Icon rail spacing, active indicator style, tooltip behavior
- Bottom tab bar styling and animation
- Tasks placeholder page design

## Deferred Ideas

None — discussion stayed within phase scope
