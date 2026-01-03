# Dashboard UI/UX Roadmap 2025

## Scope

This roadmap covers the dashboard redesign for MailAgent, including widget layout, customization, widget library, and supporting UX patterns. It integrates current project rules (i18n, TanStack Query, MUI theming) with 2025 UX best practices.

## Goals and KPIs

- Widget customization rate: >60%
- Time to customize: <2 minutes
- Layout save success: >95%
- User satisfaction: >4.5/5
- Page load time: <2 seconds
- First Contentful Paint: <1 second
- Time to Interactive: <2 seconds

## Standards and References

- Material Design 3: https://m3.material.io/
- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Microsoft Fluent 2: https://fluent2.microsoft.design/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- NN/G Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/

## Design Inspiration (2025 Research)

### Premium Email Clients

| Product | Key Features |
|---------|--------------|
| Superhuman | Near-instant actions, keyboard-first, minimal UI, sleek design |
| Spark | Modern streamlined views, multi-account seamless, clean focus |
| Shortwave | AI Bundles (auto-group newsletters), To-Dos system |
| Sortd | Kanban-style boards, pipeline management in Gmail |

### Key Learnings

1. **Speed is UX**: Every action should feel instant (<100ms perceived)
2. **Keyboard-first**: Power users expect Vim-style shortcuts
3. **AI as assistant, not replacement**: Suggest, explain, create, act on behalf
4. **Noise filtering**: Auto-bundle low-priority mail (newsletters, social)
5. **Minimal chrome**: Maximum content, minimal UI clutter

### AI-First Widget Patterns

Based on Gartner 2025 Analytics Report (60%+ analytics workflows now use AI):

| Pattern | Description | Example |
|---------|-------------|---------|
| Predictive Insight Cards | AI surfaces actionable insights proactively | "3 emails need response before EOD" |
| Inline Suggestions | Context-sensitive prompts within content | Grammarly/Notion AI style overlays |
| Explainable Overlays | Show AI reasoning and sources | "Suggested because you searched..." |
| Conversational Interface | Natural language queries | "Show emails from John last week" |
| Recovery Paths | Retry, edit, undo for AI actions | Editable AI-generated drafts |

### Grid Layout Decision

After research, **react-grid-layout** is recommended:
- Built-in drag-and-drop
- Responsive breakpoints
- Active maintenance
- Performance for data-heavy dashboards
- CSS transforms for smooth animations

Alternative: Pure CSS Grid for simpler, non-draggable layouts.

### CRM Dashboard Inspiration

Top patterns from Dribbble/Behance:
- Relationship score visualizations (radial progress)
- Contact timeline cards with interaction history
- Stale contact alerts with one-click reconnect
- Pipeline/funnel visualizations for email campaigns

## Constraints and Rules (Project Specific)

- Translations first: all user-facing strings in `frontend/locales/en.ts`, `frontend/locales/it.ts`, and types in `frontend/locales/index.ts`.
- Use TanStack Query and existing API modules. No raw `apiClient` in components.
- Use MUI theme tokens and components. Avoid hardcoded CSS colors.
- Handle loading, error, and empty states for every widget.

## Roadmap Phases

### Phase 0: Decision Gates and Baseline

Objectives:
- Decide the layout engine (CSS Grid vs react-grid-layout).
- Define accessibility baseline (keyboard navigation for drag/resize, focus order, target sizes).
- Set performance budgets and telemetry goals.

Deliverables:
- Decision document for layout engine and interaction model.
- Accessibility checklist aligned to WCAG 2.2.
- Performance budgets and measurement plan.

### Phase 1: Foundation

Objectives:
- Build the widget registry, metadata, and base widget patterns.
- Implement dashboard preference storage and endpoints.
- Create layout types, breakpoints, validation, and storage utilities.

Deliverables:
- Widget registry types and categories.
- BaseWidget with consistent header, actions, and states.
- Backend preferences model and API wiring.

### Phase 2: Grid System and Interaction

Objectives:
- Implement DashboardGrid with drag and resize (per engine decision).
- Build WidgetContainer handles and interaction affordances.
- Add optimistic layout updates with persistence.

Deliverables:
- Drag and resize interactions (mouse and keyboard).
- Accessible handles with clear focus states.
- Layout persistence with conflict handling.

### Phase 3: Widget Library and Settings

Objectives:
- Refactor existing widgets to the new system.
- Build widget library UI with search, categories, and add flows.
- Add per-widget settings and persistence.

Deliverables:
- Standardized widgets (Briefing, Unread, Events, Follow Ups, etc.).
- Widget library panel with add/remove flows.
- Settings modal and saved configurations.

### Phase 4: Customization UI and Presets

Objectives:
- Add edit mode toolbar and visual feedback.
- Implement preset layouts (Executive, Productivity, Communication, Minimal).
- Provide save, reset, duplicate, and export/import flows.

Deliverables:
- Edit mode with clear entry/exit and safe undo.
- Preset selector with previews.
- User actions for layout management.

### Phase 5: Polish and Experience Layer

Objectives:
- Add motion and transitions with reduced-motion support.
- Implement compact mode and density control.
- Add onboarding, tooltips, and first-run guidance.

Deliverables:
- Responsive animation system.
- Compact layout variants.
- Onboarding and feature tour.

### Phase 6: Accessibility, QA, and Performance

Objectives:
- Validate keyboard access, focus order, and target sizes.
- Test responsiveness across breakpoints and browsers.
- Run performance tests with 5+ widgets.

Deliverables:
- Accessibility report with fixes.
- Cross-browser QA report.
- Performance benchmarks vs budgets.

### Phase 7: Migration and Cleanup

Objectives:
- Launch behind a feature flag with fallback.
- Migrate default layouts for existing users.
- Remove old dashboard code after stable rollout.

Deliverables:
- Feature flag toggle and migration flow.
- Analytics and feedback loop.
- Cleanup plan and execution.

## Design Guidelines to Apply Throughout

- Progressive disclosure: keep default views simple, expand on demand.
- Clarity and hierarchy: strong typography and spacing hierarchy.
- Trust in AI: show rationale, sources, and allow user override.
- Empty and error states: clear next actions and recovery.
- Responsive density: scale content for desktop and mobile.
- Motion as feedback: subtle, purposeful transitions only.

## Risks and Mitigations

- Drag/resize complexity: validate engine choice early and prototype.
- Accessibility gaps: enforce keyboard parity for all interactions.
- Performance regressions: set budgets and measure every phase.
- i18n coverage: add translation keys during every component change.

## Definition of Done for Each Phase

- All user-facing strings are localized.
- Loading, error, and empty states are implemented.
- Accessibility checks pass for the phase scope.
- Performance stays within defined budgets.
- Changes are tested across breakpoints and browsers.
