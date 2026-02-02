# Phase 02: Frontend Core Setup - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning (RE-SCOPE NEEDED)

<domain>
## Phase Boundary

Establish frontend architecture for email views: shadcn/ui with MUI, routing, component structure, TanStack Query configuration, and base resizable panel layout.

**CRITICAL FINDING:** Codebase audit revealed most roadmap items already implemented. Phase 02 should focus on gaps and standardization, not greenfield setup.

</domain>

<decisions>
## Implementation Decisions

### Component Strategy (MUI + shadcn/ui)
- **Keep MUI** as primary component library (already v7.3.7)
- **shadcn/ui only for new components** that MUI lacks (e.g., Command palette, Combobox)
- 30+ shadcn components already exist in `components/ui/`
- MUI compatibility layer already in shadcn Button (fullWidth, sx props)

### Layout Primitives
- **Keep MUI Box/Stack** for layout (not switching to Tailwind flex utilities)
- Consistent with existing 960-line email page pattern
- Allotment for resizable panels (already implemented in EmailLayout.tsx)

### Import Paths
- **Central `@/components/ui`** for all new shadcn components
- Existing pattern: `import { Button } from '@/components/ui/button'`
- Email-specific: `@/components/email/**`

### Route Structure (Existing)
- Pages Router (not App Router)
- Main email route: `/dashboard/email`
- No nested routes needed - single page with panel-based navigation

### Panel Layout (Existing)
- 3-panel layout using Allotment (not react-resizable-panels)
- Mobile: Bottom navigation, single panel view
- Tablet: Bottom navigation, responsive panels
- Desktop: Full 3-panel with drag-to-resize
- Layout preferences persist to localStorage

### TanStack Query (Existing)
- Already configured with email queries
- Optimistic updates implemented
- Real-time WebSocket integration exists

### Claude's Discretion
- Whether to add react-resizable-panels alongside Allotment or keep Allotment
- Exact folder structure for any new route patterns
- Whether @tanstack/react-virtual needs wrapper components

</decisions>

<specifics>
## Specific Ideas

### Already Implemented (No Work Needed)
- shadcn/ui + Tailwind: Full CSS variable theming in `tailwind.config.ts`
- TipTap: v3.17.1 with StarterKit, Image, Link, Table extensions
- Virtual scroll: @tanstack/react-virtual v3.13.18
- Motion: Both `motion` and `framer-motion` v12.29.2
- 3-panel layout: `EmailLayout.tsx` (516 lines) with Allotment
- TanStack Query: Full CRUD mutations in `email.tsx`
- Keyboard navigation: `useKeyboardNavigation` hook exists
- Drag-drop: dnd-kit integrated for email-to-folder

### Locale System Verified
- Comprehensive TypeScript types in `locales/index.ts` (3136 lines)
- English (`en.ts`) and Italian (`it.ts`) translations
- All email UI strings covered

### Phase 02 Should Focus On
1. **Gap analysis**: What's missing vs roadmap expectations?
2. **Standardization**: Ensure consistent patterns across components
3. **Documentation**: Document existing architecture for team
4. **Verification**: Ensure all dependencies work together correctly

</specifics>

<deferred>
## Deferred Ideas

- App Router migration — Future major version
- Additional locales beyond en/it — User-driven
- Storybook component documentation — Phase 08 (Testing & Polish)

</deferred>

---

*Phase: 02-frontend-core-setup*
*Context gathered: 2026-02-02*
*Note: Extensive codebase audit performed - most roadmap items pre-exist*
