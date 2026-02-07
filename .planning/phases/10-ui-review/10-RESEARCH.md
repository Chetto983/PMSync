# Phase 10: UI Review - Research

**Researched:** 2026-02-07
**Domain:** Frontend visual polish, accessibility, responsive design, icon standardization
**Confidence:** HIGH (based on direct codebase analysis + verified external sources)

## Summary

This research covers the full scope of a visual polish pass across the MailAgent frontend. The codebase is a Next.js Pages Router app with a dual styling system: MUI for layout/structure components and Tailwind CSS + Radix UI primitives (shadcn-style) for `ai-elements` components. The theme system is well-architected with `frontend/theme/` files (tokens, light/dark themes, typography) and Tailwind CSS variables in `globals.css`. However, a systematic audit reveals several categories of issues to fix: 11 files still import `@mui/icons-material` instead of Lucide, ~32 files have hardcoded hex colors, no `prefers-reduced-motion` support exists anywhere, skip navigation links are absent, the existing accessibility E2E tests exclude 7 WCAG rule categories, and there is zero use of `framer-motion` micro-interactions outside one file.

The frontend has 16 auditable page routes, ~160 component files across 16 directories, and a mature theme system that needs enforcement rather than redesign. The primary work is: (1) standardize all icons to Lucide, (2) replace hardcoded hex values with theme tokens, (3) add missing WCAG AA compliance, (4) add micro-interactions via framer-motion, and (5) ensure consistent spacing/radius/shadows across all components.

**Primary recommendation:** Audit page-by-page using Playwright MCP screenshots at 4 breakpoints (375/768/1024/1440), fix all findings systematically, and use the existing accessibility E2E infrastructure (axe-core) to verify WCAG fixes.

## Standard Stack

The project already uses all necessary libraries. No new dependencies are needed.

### Core (Already Installed)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@mui/material` | ^7.3.7 | Layout, structure, form components | Main component library |
| `@mui/icons-material` | ^7.3.7 | Legacy icons (TO REMOVE) | 11 files still use this |
| `lucide-react` | ^0.563.0 | Icon library (TARGET) | 136 files already use this |
| `framer-motion` | ^12.29.0 | Micro-interactions, animations | Installed but barely used (1 file) |
| `tailwindcss` | ^4.1.18 | Utility CSS for ai-elements | Tailwind v4 with CSS variables |
| `@axe-core/playwright` | ^4.11.1 | Accessibility testing | Already in devDependencies |
| `@playwright/test` | ^1.58.0 | E2E visual testing | Already configured with breakpoints |
| `@radix-ui/*` | Various | Headless UI primitives | Used by `components/ui/` |
| `@assistant-ui/react` | ^0.12.1 | AI chat primitives (REFERENCE) | Installed but not yet imported in components |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-mui` | N/A | Bridge: Lucide icons in MUI components | NOT needed - just use `lucide-react` directly |
| `next-themes` | ^0.4.6 | Theme persistence (light/dark/system) | Already integrated via `useThemePersistence` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `framer-motion` for animations | CSS `@keyframes` / Tailwind `animate-*` | framer-motion is already installed, gives better control for micro-interactions |
| Manual accessibility fixes | `eslint-plugin-jsx-a11y` for static analysis | Complement axe-core E2E tests with build-time checks |

## Architecture Patterns

### Current Frontend Structure

```
frontend/
├── pages/                    # 16 routes (Next.js Pages Router)
│   ├── auth/                 # login, register, reset-password, forgot-password, oauth-callback
│   ├── dashboard/            # index (home), email, calendar, contacts, settings, profile, ai, tasks, analytics
│   │   ├── ai/              # follow-ups, memories
│   │   └── email/           # compose, thread/[threadId]
│   ├── index.tsx            # Landing page
│   ├── privacy.tsx          # Static page
│   └── terms.tsx            # Static page
├── components/               # ~160 files across 16 directories
│   ├── layout/              # Layout.tsx, Header.tsx, Sidebar.tsx, ThemeToggle.tsx
│   ├── email/               # 6 subdirs: compose, folders, keyboard, labels, layout, list, sidebar, thread
│   ├── ai/                  # AiDashboard/, MemoryBrowser/, CommandPalette/, DailyBriefing/, FollowUpTracker/
│   ├── dashboard/           # DashboardContainer, widgets/ (11 widget components)
│   ├── calendar/            # CalendarHeader, CalendarSidebar, EventDialog, ai/
│   ├── contacts/            # ContactLayout, ContactList, ContactDetail, ContactSidebar
│   ├── settings/            # 7 settings panel components + SectionCard, SettingRow
│   ├── billing/             # 7 billing components
│   ├── productivity/        # DeadlineWidget, KanbanBoard/
│   ├── ui/                  # 20+ shadcn-style Radix primitives
│   ├── common/              # ColorPicker, ErrorBoundary
│   ├── crm/                 # CrmAlertsWidget
│   ├── icons/               # FileIcons (custom SVG)
│   ├── landing/             # hero, features, cta, modules, testimonial, footer
│   ├── mfa/                 # MfaSettings, TotpSetupWizard, PasskeyCard, BackupCodesCard, TrustedDevicesList
│   └── providers/           # Google/Microsoft/Generic provider cards
├── src/components/ai-elements/  # 46+ Tailwind-based AI elements (shadcn style)
│   └── tool-renderers/      # 10 smart tool renderers + shared components
├── theme/                   # MUI theme system
│   ├── tokens.ts            # Design tokens (colors, spacing, shadows, glass, etc.)
│   ├── typography.ts        # Shared typography config
│   ├── lightTheme.ts        # Light theme + MUI component overrides
│   ├── darkTheme.ts         # Dark theme + MUI component overrides (~580 lines)
│   └── appTheme.ts          # Entry point, exports both themes
├── styles/globals.css       # Tailwind base + CSS custom properties
├── locales/                 # en.ts, it.ts, index.ts
└── tailwind.config.ts       # Tailwind v4 config with CSS variables
```

### Pattern 1: Page-by-Page Audit Workflow

**What:** Audit one page completely (all states, all breakpoints, both themes) before moving to the next.
**When to use:** For every page in the application.
**Procedure:**

```
For each page:
1. Screenshot at 4 breakpoints (375, 768, 1024, 1440) in light mode
2. Screenshot at 4 breakpoints in dark mode
3. Catalog all findings (P0/P1/P2)
4. Fix all findings for that page
5. Re-screenshot to verify fixes (before/after)
```

### Pattern 2: Icon Migration (MUI -> Lucide)

**What:** Replace `@mui/icons-material` imports with `lucide-react` equivalents.
**When to use:** For the 11 files that still import from `@mui/icons-material`.

**Files requiring migration:**
1. `components/email/compose/ComposeDialog.tsx` (7 imports: Close, Send, Schedule, OpenInFull, CloseFullscreen, ExpandMore, ExpandLess)
2. `components/email/compose/EditorMenuControls.tsx` (3 imports: AutoAwesome, AttachFile, MoreHoriz)
3. `components/email/compose/ComposeEditor.tsx` (3 imports: Close, Check, AutoAwesome)
4. `components/email/compose/ComposeRecipients.tsx` (3 imports: ExpandMore, ExpandLess, Person)
5. `components/email/compose/AIInlineMenu.tsx` (4 imports: Close, Check, Send, AutoAwesome)
6. `components/email/compose/AiComposeMenu.tsx` (1 import block)
7. `components/email/thread/AiActionButtons.tsx` (3 imports: Summarize, PriorityHigh, SentimentSatisfiedAlt)
8. `components/email/thread/AttachmentCard.tsx` (1 import: Download)
9. `components/email/thread/AiInsightsPanel.tsx` (1 import: AutoAwesome)
10. `components/contacts/ContactList.tsx` (1 import: People)
11. `components/contacts/ContactListItem.tsx` (1 import block)

**Mapping table (MUI -> Lucide):**

| MUI Icon | Lucide Equivalent |
|----------|-------------------|
| `CloseIcon` | `X` |
| `SendIcon` | `Send` |
| `ScheduleIcon` | `Clock` |
| `OpenInFullIcon` | `Maximize2` |
| `CloseFullscreenIcon` | `Minimize2` |
| `ExpandMoreIcon` | `ChevronDown` |
| `ExpandLessIcon` | `ChevronUp` |
| `AutoAwesomeIcon` | `Sparkles` |
| `AttachFileIcon` | `Paperclip` |
| `MoreHorizIcon` | `MoreHorizontal` |
| `CheckIcon` | `Check` |
| `PersonIcon` | `User` |
| `DownloadIcon` | `Download` |
| `SummarizeIcon` | `FileText` |
| `PriorityHighIcon` | `AlertTriangle` |
| `SentimentSatisfiedAltIcon` | `Smile` |
| `People` (UsersIcon) | `Users` |

**Key difference:** MUI icons use `fontSize` prop, Lucide uses `size` prop (number in px).

### Pattern 3: Hardcoded Color Replacement

**What:** Replace hardcoded hex values (`#012169`, `#C8102E`, `#9E9E9E`, etc.) with theme tokens.
**When to use:** For the ~32 files with hardcoded hex values.

**Categories of hardcoded colors found:**
- **Flag patterns (Header.tsx):** CSS gradient flags for EN/IT language selector -- these are intentional and should stay as-is (flag colors are not themeable)
- **Provider brand colors (GoogleProviderCard, MicrosoftProviderCard):** Google/Microsoft brand colors -- intentional, keep
- **Email label fallback (#9E9E9E):** Should use `theme.palette.grey[400]` or `text.disabled`
- **File icon colors (FileIcons.tsx):** 38 occurrences -- file type colors, arguably intentional
- **Landing page colors:** Some hardcoded gradient hex values
- **Editor toolbar colors (EditorMenuControls.tsx):** 32 occurrences -- rich text formatting colors
- **Component-specific hardcoded values:** Various one-off colors in ~15 components

**Decision framework:**
- Brand/flag colors: KEEP (intentional, not themeable)
- File type icon colors: KEEP (standard file associations)
- Rich text formatting palette: KEEP (standard formatting colors)
- Everything else: REPLACE with `theme.palette.*` or Tailwind CSS variables

### Pattern 4: Framer Motion Micro-Interactions

**What:** Add subtle animations using the already-installed `framer-motion`.
**When to use:** For button press effects, card reveals, page transitions, state changes.

```typescript
// Button scale on press
import { motion } from 'framer-motion';

<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ duration: 0.15 }}
>
  {children}
</motion.button>

// Card slide-in on mount
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
/>

// List item stagger
<motion.div
  variants={{
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  }}
  initial="hidden"
  animate="show"
/>
```

### Anti-Patterns to Avoid

- **Don't override MUI theme at component level:** Fix at theme level (`darkTheme.ts`/`lightTheme.ts`) so all consumers benefit
- **Don't add `!important` to fix styling issues:** Trace the specificity chain, fix the root cause
- **Don't mix MUI `sx` prop with Tailwind classes on the same element:** Pick one system per component (MUI components use `sx`, ai-elements use Tailwind)
- **Don't add animations without `prefers-reduced-motion` check:** Always respect user's motion preferences
- **Don't skip dark mode when fixing light mode:** Fix both in the same pass

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessibility auditing | Manual checking | `@axe-core/playwright` (already installed) | Automated, covers 80+ WCAG rules |
| Icon components | Custom SVG wrappers | `lucide-react` (already installed) | 1500+ icons, tree-shakeable, consistent API |
| Animation library | CSS keyframes for complex sequences | `framer-motion` (already installed) | Layout animations, gesture support, `prefers-reduced-motion` |
| Screenshot comparison | Manual screenshots | Playwright MCP `browser_take_screenshot` | Reproducible, scriptable at exact viewports |
| Color contrast checking | Eyeball testing | axe-core `color-contrast` rule | Accurate 4.5:1 AA ratio calculation |
| Focus management | Custom focus trap | MUI Dialog/Drawer built-in focus trap | MUI handles focus trap, restore, and tab order |
| Skip navigation | Custom implementation | Standard `<a href="#main-content">` pattern | Simple, proven, works with all screen readers |

## Common Pitfalls

### Pitfall 1: Dual Theme System Drift

**What goes wrong:** MUI theme defines one visual language, Tailwind CSS variables define another. They can drift out of sync.
**Why it happens:** `globals.css` defines CSS variables (e.g., `--primary: 189 70% 50%`) and `tokens.ts` defines MUI colors (e.g., `primary.main: '#55cae5'`). These are manually kept in sync.
**How to avoid:** When changing any color, update BOTH `tokens.ts` AND `globals.css`. Verify both light and dark mode.
**Warning signs:** ai-elements components look different from MUI components on the same page. Colors don't match between Tailwind and MUI sections.

### Pitfall 2: MUI Dark Theme Component Override Gaps

**What goes wrong:** `darkTheme.ts` has component overrides for ~30 MUI components but `lightTheme.ts` only overrides ~12. Some components look polished in dark mode but plain in light mode.
**Why it happens:** Dark theme was developed more thoroughly. Light theme was added later with fewer overrides.
**How to avoid:** When fixing a component override in one theme, check the other theme too. Parity list:
- Dark has but Light lacks: `MuiIconButton`, `MuiInputBase`, `MuiOutlinedInput`, `MuiInputLabel`, `MuiSelect`, `MuiAutocomplete`, `MuiList`, `MuiListItemIcon`, `MuiListItemText`, `MuiCardHeader`, `MuiCardContent`, `MuiCardActions`, `MuiToolbar`, `MuiTableContainer`, `MuiTableHead`, `MuiTableRow`, `MuiTableCell`, `MuiDialogTitle`, `MuiDialogContent`, `MuiDialogActions`, `MuiBackdrop`, `MuiPopover`, `MuiMenu`, `MuiMenuItem`, `MuiTabs`, `MuiTab`, `MuiSnackbar`, `MuiAvatar`, `MuiAvatarGroup`, `MuiLinearProgress`, `MuiCircularProgress`, `MuiDivider`, `MuiSwitch`, `MuiCheckbox`, `MuiRadio`, `MuiAccordion`, `MuiAccordionSummary`, `MuiAccordionDetails`, `MuiBreadcrumbs`, `MuiPaginationItem`
**Warning signs:** Light mode looks "default MUI" while dark mode looks polished.

### Pitfall 3: Accessibility Exclusion List Masking Real Issues

**What goes wrong:** The existing `e2e/accessibility.spec.ts` excludes 7 WCAG rules (`nested-interactive`, `list`, `aria-prohibited-attr`, `color-contrast`, `button-name`, `label`, `aria-input-field-name`). These are documented as "tech debt" but some are genuine UX issues (button-name, label, color-contrast).
**Why it happens:** They were deferred from earlier phases.
**How to avoid:** This phase MUST fix `button-name` (missing aria-labels on icon buttons), `label` (missing checkbox labels), and `color-contrast` (insufficient contrast ratios). Then remove those from the exclusion list.
**Warning signs:** Accessibility tests pass but screen reader users can't use the app.

### Pitfall 4: Header Height Inconsistency

**What goes wrong:** Header is styled with `minHeight: '64px !important'` in the component but `tokens.ts` defines `layout.header.height: 64`. The `!important` in the Header overrides theme-level toolbar height set in `darkTheme.ts`.
**Why it happens:** Competing style sources: component inline sx vs theme override.
**How to avoid:** Remove `!important` from Header, let theme control toolbar height consistently.
**Warning signs:** Layout calculations using `64px` header height break on some pages.

### Pitfall 5: Missing `prefers-reduced-motion` Support

**What goes wrong:** The app uses CSS transitions (on buttons, cards, list items) and plans to add framer-motion animations, but ZERO files respect `prefers-reduced-motion`.
**Why it happens:** Not implemented in any phase so far.
**How to avoid:** Add a global CSS rule AND framer-motion `ReducedMotion` component:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
```typescript
import { MotionConfig } from 'framer-motion';
// In Layout.tsx or _app.tsx
<MotionConfig reducedMotion="user">
  {children}
</MotionConfig>
```
**Warning signs:** Vestibular disorder users experience motion sickness from animations.

### Pitfall 6: No Skip Navigation Link

**What goes wrong:** Keyboard users must tab through the entire sidebar + header to reach main content.
**Why it happens:** Never implemented.
**How to avoid:** Add a skip link as the first focusable element in `Layout.tsx`:
```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-primary"
>
  Skip to main content
</a>
// ... then on main content area:
<Box component="main" id="main-content" tabIndex={-1}>
```

## Code Examples

### Lucide Icon Migration Pattern

```typescript
// BEFORE (MUI Icons)
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

<IconButton><CloseIcon fontSize="small" /></IconButton>
<Button startIcon={<SendIcon />}>Send</Button>

// AFTER (Lucide)
import { X, Send, Sparkles } from 'lucide-react';

<IconButton><X size={18} /></IconButton>
<Button startIcon={<Send size={18} />}>Send</Button>
```

### Hardcoded Color Fix Pattern

```typescript
// BEFORE (hardcoded)
sx={{ color: '#9E9E9E' }}
sx={{ bgcolor: 'rgba(25, 118, 210, 0.04)' }}

// AFTER (theme tokens)
sx={{ color: 'text.disabled' }}
sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04) }}
```

### Accessibility Fix Pattern - aria-label on IconButton

```typescript
// BEFORE (missing aria-label)
<IconButton onClick={onClose}><X size={18} /></IconButton>

// AFTER (accessible)
<IconButton onClick={onClose} aria-label={t.common.close}>
  <X size={18} />
</IconButton>
```

### Accessibility Fix Pattern - Checkbox Label

```typescript
// BEFORE (missing label)
<Checkbox checked={selected} onChange={onChange} />

// AFTER (accessible)
<Checkbox
  checked={selected}
  onChange={onChange}
  inputProps={{ 'aria-label': t.emailList.selectEmail }}
/>
```

### Framer Motion Micro-Interaction with Reduced Motion

```typescript
import { motion, MotionConfig } from 'framer-motion';

// Wrap in MotionConfig at app level (Layout.tsx)
<MotionConfig reducedMotion="user">
  {/* All motion.* components inside will respect prefers-reduced-motion */}
</MotionConfig>

// Card hover effect
<motion.div
  whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
  transition={{ duration: 0.2 }}
/>

// Page transition
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.15 }}
/>
```

### Playwright MCP Screenshot Pattern

```javascript
// Navigate and resize
mcp__playwright__browser_navigate({ url: "http://localhost:3001/dashboard" })

// Desktop (1440px)
mcp__playwright__browser_resize({ width: 1440, height: 900 })
mcp__playwright__browser_take_screenshot({ filename: "dashboard-desktop-light.png" })

// Tablet (768px)
mcp__playwright__browser_resize({ width: 768, height: 1024 })
mcp__playwright__browser_take_screenshot({ filename: "dashboard-tablet-light.png" })

// Mobile (375px)
mcp__playwright__browser_resize({ width: 375, height: 812 })
mcp__playwright__browser_take_screenshot({ filename: "dashboard-mobile-light.png" })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MUI Icons (tree-shaking issues) | Lucide React (fully tree-shakeable) | 2024 | Smaller bundles, consistent icon style |
| CSS-only animations | framer-motion with `reducedMotion="user"` | 2024-2025 | Accessible by default, gesture support |
| Manual WCAG testing | axe-core + Playwright E2E | 2024 | Automated, catches regressions |
| Single dark/light toggle | Three-way (light/dark/system) | Already implemented | Matches OS preference |
| Monolithic chat component | Composable primitives (assistant-ui pattern) | 2025-2026 | Better customization, accessibility built-in |

## Existing Infrastructure to Leverage

### Already Working

| What | Where | Status |
|------|-------|--------|
| Theme system (dark/light) | `frontend/theme/` | Mature, well-structured |
| Tailwind CSS variables | `frontend/styles/globals.css` | Both light and dark defined |
| Accessibility E2E tests | `frontend/e2e/accessibility.spec.ts` | Exists with axe-core, 7 rules excluded |
| Playwright config | `frontend/playwright.config.ts` | 5 projects (3 desktop + 2 mobile) |
| Keyboard navigation | `frontend/hooks/use-keyboard-navigation.ts` + E2E spec | Implemented for email list |
| ThemeToggle (3-way) | `frontend/components/layout/ThemeToggle.tsx` | Working (light/dark/system) |
| ErrorBoundary | `frontend/components/common/ErrorBoundary.tsx` | Page-level error boundaries |
| Skeleton loading | 27 component files use Skeleton | Inconsistent but present |
| Translation system (i18n) | `frontend/locales/en.ts`, `it.ts` | All user-facing strings |

### Gaps to Fill

| What | Current State | Needed |
|------|--------------|--------|
| Skip navigation | Missing entirely | Add to Layout.tsx |
| `prefers-reduced-motion` | Zero files support it | Add global CSS + MotionConfig |
| Focus indicators | 9 files use `:focus-visible` | Need consistent focus ring across all interactive elements |
| ARIA labels on icon buttons | Excluded from a11y tests | Fix in ~15 components, remove exclusion |
| Color contrast | Excluded from a11y tests | Fix theme palette, verify 4.5:1 ratio |
| Light theme parity | ~40 fewer MUI overrides than dark | Port dark theme overrides to light |
| Framer-motion usage | 1 file (AIInlineMenu) | Expand to cards, buttons, page transitions |
| `@assistant-ui/react` | Installed but not imported | Reference for chat patterns (optional adoption) |

## Complete Page Inventory for Audit

| # | Page | Route | Main Component | Complexity |
|---|------|-------|---------------|------------|
| 1 | Dashboard Home | `/dashboard` | `DashboardContainer` + 11 widgets | HIGH - grid layout, many widgets |
| 2 | Email List | `/dashboard/email` | `EmailLayout` + `ThreadList` | HIGH - 3-panel, drag-drop, virtual scroll |
| 3 | Email Compose | `/dashboard/email/compose` | `ComposeDialog` | MEDIUM - rich text editor |
| 4 | Email Thread | `/dashboard/email/thread/[id]` | `ThreadView` / `ThreadViewOutlook` | HIGH - message cards, attachments |
| 5 | Calendar | `/dashboard/calendar` | `Calendar` (FullCalendar) | MEDIUM - third-party calendar |
| 6 | Contacts | `/dashboard/contacts` | `ContactLayout` + list/detail | MEDIUM - master-detail |
| 7 | AI Chat | `/dashboard/ai` | `AiDashboard` (desktop + mobile layouts) | HIGH - chat, widgets, tool renderers |
| 8 | AI Memories | `/dashboard/ai/memories` | `MemoryBrowser` | LOW - list/detail |
| 9 | AI Follow-ups | `/dashboard/ai/follow-ups` | `KanbanBoard` | MEDIUM - kanban columns |
| 10 | Settings | `/dashboard/settings` | `Settings` (7 tab panels) | MEDIUM - forms, panels |
| 11 | Profile | `/dashboard/profile` | `ProfileSettings` | LOW - form |
| 12 | Tasks | `/dashboard/tasks` | `Tasks` | LOW |
| 13 | Analytics | `/dashboard/analytics` | `AnalyticsChart` | LOW - charts |
| 14 | Login | `/auth/login` | Auth form | LOW |
| 15 | Register | `/auth/register` | Auth form | LOW |
| 16 | Landing | `/` | Hero + Features + CTA | MEDIUM - marketing page |

### Recommended Audit Order

Start with the shell (Layout/Header/Sidebar) since fixes there propagate to all pages. Then high-complexity pages first (where most issues concentrate), then lower complexity:

1. **Shell** (Layout, Header, Sidebar, ThemeToggle) - fixes propagate everywhere
2. **Email List** - most complex page, most user-facing
3. **AI Chat** - second most complex, dual layout (desktop/mobile)
4. **Dashboard Home** - widget grid, many visual elements
5. **Email Thread** - message cards, attachments, AI panels
6. **Contacts** - master-detail layout
7. **Calendar** - third-party component integration
8. **AI Follow-ups** - kanban board
9. **Settings** - form layouts
10. **Email Compose** - dialog-based, rich text
11. **AI Memories** - simple list/detail
12. **Auth pages** (login, register) - simple forms
13. **Landing page** - marketing, separate visual language
14. **Static pages** (profile, tasks, analytics, terms, privacy) - lowest priority

### Screenshot Organization

```
.planning/phases/10-ui-review/screenshots/
├── before/
│   ├── 01-shell/
│   │   ├── header-desktop-1440-light.png
│   │   ├── header-desktop-1440-dark.png
│   │   ├── sidebar-desktop-1440-light.png
│   │   └── ...
│   ├── 02-email-list/
│   │   ├── email-list-desktop-1440-light.png
│   │   ├── email-list-tablet-768-light.png
│   │   ├── email-list-mobile-375-light.png
│   │   └── ...
│   └── ...
└── after/
    └── (same structure)
```

### Dark Mode Strategy

Interleave with light mode - for each page, screenshot and fix BOTH themes before moving to the next page. This prevents drift and ensures both modes get equal treatment. The Theme toggle is already accessible via Playwright MCP clicking or by toggling the `.dark` class.

## Open Questions

1. **Header height 64px vs compact 48-56px from Phase 07 decision**
   - What we know: Current header uses `minHeight: '64px !important'`. CLAUDE.md mentions "Compact header 48-56px (Phase 07)" as a prior decision.
   - What's unclear: Whether 64px was reverted back, or if the 48-56px compact was never fully implemented.
   - Recommendation: Verify visually, keep whatever height is currently deployed. Don't change layout dimensions in a polish phase unless clearly broken.

2. **`@assistant-ui/react` adoption scope**
   - What we know: Package is installed (^0.12.1) but zero imports in component code. The project uses custom ai-elements + MUI for chat.
   - What's unclear: Whether to adopt assistant-ui primitives or just reference their patterns.
   - Recommendation: Reference patterns only. Don't rewrite working chat components. Copy specific UX patterns (e.g., auto-scroll, streaming indicators) if they solve visual problems better than current implementation.

3. **Tailwind v4 vs v3 implications**
   - What we know: Project uses Tailwind v4 (^4.1.18) with `@config` directive in globals.css.
   - What's unclear: Whether any Tailwind v3 patterns are still in use that might cause issues.
   - Recommendation: Verify `@tailwind` directives work correctly with v4. The config file uses `satisfies Config` which is v3/v4 compatible.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `d:\MailAgent\frontend\` - complete component inventory, theme files, icon imports, accessibility patterns
- `frontend/e2e/accessibility.spec.ts` - existing axe-core integration and exclusion list
- `frontend/theme/tokens.ts`, `darkTheme.ts`, `lightTheme.ts` - complete theme system analysis
- `frontend/package.json` - all dependency versions verified

### Secondary (MEDIUM confidence)
- [assistant-ui GitHub](https://github.com/assistant-ui/assistant-ui) - composable primitives approach, shadcn/ui + Tailwind styling
- [Lucide React docs](https://lucide.dev/guide/packages/lucide-react) - icon API, tree-shaking, prop interface
- [WebAIM WCAG Checklist](https://webaim.org/standards/wcag/checklist) - WCAG 2.1 AA requirements
- [A11Y Project Checklist](https://www.a11yproject.com/checklist/) - practical accessibility checklist
- [lucide-mui bridge](https://github.com/a16n-dev/lucide-mui) - MUI compatibility layer (not needed for this project)
- [coder/coder MUI->Lucide migration](https://github.com/coder/coder/issues/19000) - real-world migration example

### Tertiary (LOW confidence)
- WebSearch results for "WCAG AA React MUI accessibility audit" - general patterns, not project-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and in use, versions verified from package.json
- Architecture: HIGH - direct codebase analysis, every file inventoried
- Pitfalls: HIGH - identified from actual code patterns (not theoretical)
- Icon migration: HIGH - every file with MUI icon imports identified and mapped
- Accessibility gaps: HIGH - existing E2E tests document exact exclusions
- Micro-interactions: MEDIUM - framer-motion patterns from docs, not yet validated in this codebase

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable domain, no fast-moving dependencies)
