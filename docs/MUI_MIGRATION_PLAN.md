# MUI Migration Plan — Eliminate Radix/shadcn

**Decision:** ALL components must use MUI. No Radix UI primitives.
**Date:** 2026-03-09

---

## Current State

| Layer | Count | Tech |
|-------|-------|------|
| shadcn primitives in `components/ui/` | 32 files | Radix UI + Tailwind + CVA |
| Radix packages in `package.json` | 18 packages | @radix-ui/* |
| shadcn utilities | 3 packages | clsx, tailwind-merge, CVA |
| Consumer files (importing shadcn) | ~7 files | Low adoption |
| Chat UI (`src/components/chat/`) | 23 files | assistant-ui + Tailwind CSS |
| MUI already used | Everywhere else | @mui/material v7 |

**Key insight:** shadcn primitives are defined but **barely consumed** (~7 files). The app already runs on MUI for all business components. This migration is mostly cleanup + a few rewrites.

---

## Migration Strategy: 4 Waves

### Wave 1 — Drop-in Replacements (1-2 days)

Replace shadcn primitives that have **exact MUI equivalents** with zero API change needed.

| shadcn Component | MUI Replacement | Consumer Impact |
|------------------|-----------------|-----------------|
| `Button` | `@mui/material/Button` | Update imports |
| `Badge` | `@mui/material/Chip` or `Badge` | Update imports + props |
| `Alert` | `@mui/material/Alert` | Update imports |
| `Card` | `@mui/material/Card` + `CardHeader/Content/Actions` | Update imports |
| `Input` | `@mui/material/TextField` | Update imports + props |
| `Textarea` | `@mui/material/TextField multiline` | Update imports + props |
| `Separator` | `@mui/material/Divider` | Update imports |
| `Progress` | `@mui/material/LinearProgress` | Update imports |
| `Switch` | `@mui/material/Switch` | Update imports |
| `Tabs/TabsList/TabsTrigger/TabsContent` | `@mui/material/Tabs/Tab/TabPanel` | Update imports + structure |
| `Accordion` | `@mui/material/Accordion` | Update imports |
| `Avatar` | `@mui/material/Avatar` | Update imports |
| `Tooltip` | `@mui/material/Tooltip` | Update imports |

**Steps:**
1. For each component, grep all imports from `@/components/ui/<name>`
2. Replace with MUI equivalent
3. Delete the shadcn file from `components/ui/`
4. Run `type-check` + `lint` after each batch

### Wave 2 — Behavioral Replacements (2-3 days)

Replace shadcn primitives that need **API adaptation** — MUI equivalents exist but with different prop shapes.

| shadcn Component | MUI Replacement | Notes |
|------------------|-----------------|-------|
| `Dialog` | `@mui/material/Dialog` | Already done for ConfirmDialog/FormDialog — extend pattern |
| `DropdownMenu` | `@mui/material/Menu` + `MenuItem` | Different trigger pattern (anchorEl vs Trigger child) |
| `Select` | `@mui/material/Select` | Different option pattern (MenuItem children vs SelectItem) |
| `Popover` | `@mui/material/Popover` | anchorEl-based positioning vs Radix trigger |
| `HoverCard` | `@mui/material/Popover` with hover triggers | Custom `onMouseEnter/Leave` |
| `Collapsible` | `@mui/material/Collapse` | Controlled expand/collapse |
| `ScrollArea` | CSS `overflow-y: auto` + MUI `Box` | No direct equivalent, simplify |

**Steps:**
1. For each component, identify all consumer files
2. Create MUI wrapper with same external API if possible
3. If not possible, update consumers directly
4. Delete shadcn file + run checks

### Wave 3 — Command Palette (3-5 days)

The `cmdk`-based Command Palette has **no MUI equivalent**. Build a custom one.

**Current:** `components/ai/CommandPalette/index.tsx` uses `cmdk` directly.

**Plan:**
1. Create `components/ai/CommandPalette/MuiCommandPalette.tsx`
2. Use MUI `Dialog` + `TextField` + `List/ListItem` + `ListSubheader`
3. Implement keyboard navigation (ArrowUp/Down/Enter/Escape) manually
4. Keep the same command registry and search logic
5. Match the current keyboard shortcut (Cmd/Ctrl+K)
6. Delete `cmdk` from dependencies

**MUI Structure:**
```tsx
<Dialog open={open} onClose={close} fullWidth maxWidth="sm">
  <TextField autoFocus placeholder="Search..." onChange={onSearch} />
  <List sx={{ maxHeight: 400, overflow: 'auto' }}>
    {groups.map(group => (
      <>
        <ListSubheader>{group.name}</ListSubheader>
        {group.items.map(item => (
          <ListItemButton selected={focused === item.id} onClick={item.action}>
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} secondary={item.shortcut} />
          </ListItemButton>
        ))}
      </>
    ))}
  </List>
</Dialog>
```

### Wave 4 — Chat UI Theme Bridge (5-7 days)

The chat UI uses `assistant-ui` primitives (unstyled) + Tailwind CSS. The primitives themselves are **framework-agnostic** — they don't care about MUI or Radix. The issue is **styling**.

**Strategy: Keep assistant-ui primitives, replace Tailwind styling with MUI `sx` props and theme tokens.**

**Why not replace assistant-ui entirely?**
- It provides streaming, tool registration, HITL, branch picking — all wired to AI SDK
- Rebuilding this on MUI would take weeks and gain nothing
- The primitives are unstyled — they work with any styling system

**Migration steps:**

#### 4a. Bridge CSS variables to MUI theme (1 day)
Create a `ChatThemeBridge` component that injects CSS variables from MUI theme:

```tsx
import { useTheme } from '@mui/material/styles';

export function ChatThemeBridge({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const cssVars = {
    '--chat-bg': theme.palette.background.default,
    '--chat-surface': theme.palette.background.paper,
    '--chat-border': theme.palette.divider,
    '--chat-primary': theme.palette.primary.main,
    '--chat-text': theme.palette.text.primary,
    '--chat-text-secondary': theme.palette.text.secondary,
    // ... map all chat CSS vars to MUI theme
  } as React.CSSProperties;

  return <div style={cssVars}>{children}</div>;
}
```

#### 4b. Convert tool UIs from Tailwind to MUI (3-4 days)
16 tool UI components use Tailwind classes. Convert each to MUI components:

| Current (Tailwind) | MUI Replacement |
|--------------------|-----------------|
| `<div className="chat-tool-card">` | `<Paper variant="outlined" sx={{ p: 2 }}>` |
| `<p className="text-sm text-muted-foreground">` | `<Typography variant="body2" color="text.secondary">` |
| `<div className="flex items-center gap-2">` | `<Stack direction="row" spacing={1} alignItems="center">` |
| `<span className="font-medium">` | `<Typography fontWeight={500}>` |
| Lucide icons with `className="h-4 w-4"` | MUI Icons or Lucide with `sx={{ fontSize: 16 }}` |

**Order (by complexity):**
1. FallbackToolUI (52 lines) — smallest, test the pattern
2. CountToolUI (77 lines)
3. FolderToolUI (82 lines)
4. ContactToolUI (91 lines)
5. EmailListToolUI (98 lines)
6. CrmToolUI (98 lines)
7. TriageToolUI (102 lines)
8. FollowUpToolUI (105 lines)
9. EventToolUI (106 lines)
10. EmailContentToolUI (107 lines)
11. MemoryToolUI (107 lines)
12. AnalysisToolUI (136 lines)
13. BriefingToolUI (141 lines)
14. EmailSearchToolUI (146 lines)

#### 4c. Convert chat layout CSS to MUI `sx` (2 days)
Replace the 3 CSS files (~950 lines total) with MUI-styled components:

| CSS File | Lines | MUI Approach |
|----------|-------|-------------|
| `chat-layout.css` | 344 | MUI `Box`/`Stack` with `sx` props |
| `chat-thread.css` | 501 | MUI `Paper`/`Typography` with `sx` |
| `chat-sidebar.css` | 100+ | MUI `Drawer`/`List` with `sx` |

**Keep Tailwind for:**
- Nothing — full MUI. Remove Tailwind classes from chat components.

---

## Dependency Cleanup (after all waves)

### Remove from `package.json`:

```
@radix-ui/react-accordion
@radix-ui/react-avatar
@radix-ui/react-checkbox
@radix-ui/react-collapsible
@radix-ui/react-context
@radix-ui/react-dialog
@radix-ui/react-dropdown-menu
@radix-ui/react-hover-card
@radix-ui/react-label
@radix-ui/react-popover
@radix-ui/react-primitive
@radix-ui/react-progress
@radix-ui/react-scroll-area
@radix-ui/react-select
@radix-ui/react-separator
@radix-ui/react-slot
@radix-ui/react-switch
@radix-ui/react-tabs
@radix-ui/react-tooltip
@radix-ui/react-use-callback-ref
@radix-ui/react-use-controllable-state
@radix-ui/react-use-layout-effect
class-variance-authority
cmdk
```

### Keep:

```
clsx                    — useful general utility (not shadcn-specific)
tailwind-merge          — REMOVE if Tailwind fully eliminated from components
tailwindcss             — KEEP for now (globals.css still uses it, can remove later)
```

### Delete files:

```
components/ui/accordion.tsx
components/ui/avatar.tsx
components/ui/badge.tsx
components/ui/badge.old.tsx
components/ui/button.tsx
components/ui/button-group.tsx
components/ui/card.tsx
components/ui/carousel.tsx
components/ui/collapsible.tsx
components/ui/command.tsx
components/ui/dialog.tsx
components/ui/dropdown-menu.tsx
components/ui/hover-card.tsx
components/ui/input.tsx
components/ui/input-group.tsx
components/ui/popover.tsx
components/ui/progress.tsx
components/ui/scroll-area.tsx
components/ui/select.tsx
components/ui/separator.tsx
components/ui/switch.tsx
components/ui/tabs.tsx
components/ui/textarea.tsx
components/ui/tooltip.tsx
components/ui/theme-toggle.tsx (rebuild with MUI IconButton)
```

### Keep (already MUI):

```
components/ui/ConfirmDialog.tsx    — already uses MUI
components/ui/FormDialog.tsx       — already uses MUI
components/ui/SearchHighlight.tsx  — framework-agnostic
components/ui/cookie-consent.tsx   — already uses MUI
components/ui/index.ts             — update exports
```

---

## Execution Timeline

| Wave | Scope | Effort | Dependencies |
|------|-------|--------|-------------|
| **Wave 1** | Drop-in replacements (13 components) | 1-2 days | None |
| **Wave 2** | Behavioral replacements (7 components) | 2-3 days | Wave 1 |
| **Wave 3** | Command Palette rebuild | 3-5 days | Wave 1 |
| **Wave 4** | Chat UI theme bridge + tool UIs | 5-7 days | Wave 1-2 |
| **Cleanup** | Remove packages, delete files | 1 day | All waves |
| **Total** | | **12-18 days** | |

---

## Validation Checklist

After each wave:
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Visual regression check on key pages (email, calendar, chat, dashboard)
- [ ] Dark mode toggle works correctly
- [ ] No Radix imports remain (grep `@radix-ui`)
- [ ] No shadcn component imports remain (grep `components/ui/`)

After all waves:
- [ ] `npx knip` shows no unused dependencies
- [ ] Bundle size decreased (no Radix overhead)
- [ ] All 18 Radix packages removed from `package.json`
- [ ] `cmdk` removed
- [ ] `class-variance-authority` removed
- [ ] Chat AI still streams correctly
- [ ] HITL approval still works
- [ ] Tool UIs render correctly
- [ ] Command palette (Ctrl+K) works

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| assistant-ui depends on Radix internally | Verified: it does NOT. Uses its own primitives. |
| Chat streaming breaks during migration | Wave 4 keeps assistant-ui primitives unchanged — only styling changes. |
| Command palette keyboard navigation regresses | Wave 3 builds from scratch with MUI — comprehensive keyboard testing required. |
| Bundle size increases (MUI is heavier than Radix) | MUI is already loaded. Removing Radix reduces total bundle. Net decrease expected. |
| Dark mode breaks | ChatThemeBridge syncs MUI theme to CSS variables. Test both modes. |
| `ai-elements` package depends on Radix | Needs verification. If yes, fork or wrap. |
