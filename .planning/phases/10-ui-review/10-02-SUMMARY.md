---
phase: 10-ui-review
plan: 02
subsystem: frontend-theme
tags: [mui, theme, light-mode, dark-mode, tokens, design-system]

dependency-graph:
  requires: [10-01]
  provides: ["light-dark-theme-parity", "theme-token-consistency"]
  affects: []

tech-stack:
  added: []
  patterns: ["theme-palette-colors", "semantic-color-tokens"]

key-files:
  created: []
  modified:
    - frontend/theme/lightTheme.ts
    - frontend/components/ui/ConfirmDialog.tsx
    - frontend/components/billing/SubscriptionCard.tsx
    - frontend/components/calendar/AttendeesPicker.tsx
    - frontend/components/dashboard/AnalyticsChart.tsx
    - frontend/components/ai/MemoryBrowser/PatternsTab.tsx

decisions:
  - key: theme-parity-approach
    choice: Transform darkTheme.ts via sed to create lightTheme.ts
    rationale: Ensures structural parity; adapt colors programmatically
  - key: intentional-hardcoded-colors
    choice: Keep brand/flag/file-type/provider colors as hex
    rationale: These are visual constants not semantic UI colors

metrics:
  duration: ~45 minutes
  completed: 2026-02-08
---

# Phase 10 Plan 02: Light/Dark Theme Parity Summary

Light theme component overrides at full parity with dark theme, plus hardcoded hex colors replaced with theme tokens.

## What Was Built

### Task 1: Light Theme Component Override Parity

**lightTheme.ts** now has the same ~40 MUI component overrides as darkTheme.ts:

| Component Category | Components Added |
|-------------------|------------------|
| Input controls | MuiIconButton, MuiInputBase, MuiOutlinedInput, MuiInputLabel, MuiSelect, MuiAutocomplete |
| Lists | MuiList, MuiListItemIcon, MuiListItemText |
| Cards | MuiCardHeader, MuiCardContent, MuiCardActions |
| Tables | MuiTableContainer, MuiTableHead, MuiTableRow, MuiTableCell |
| Dialogs | MuiDialogTitle, MuiDialogContent, MuiDialogActions, MuiBackdrop |
| Menus | MuiPopover, MuiMenu, MuiMenuItem |
| Navigation | MuiTabs, MuiTab, MuiBreadcrumbs, MuiPaginationItem |
| Feedback | MuiSnackbar, MuiBadge |
| Display | MuiAvatar, MuiAvatarGroup, MuiLinearProgress, MuiCircularProgress, MuiDivider |
| Inputs | MuiSwitch, MuiCheckbox, MuiRadio |
| Surfaces | MuiAccordion, MuiAccordionSummary, MuiAccordionDetails, MuiToolbar, MuiAppBar |

**Light-mode adaptations applied:**
- Colors: `darkColors` -> `lightColors`
- Shadows: `shadows.dark` -> `shadows.light`
- Backdrop opacity: 0.7 -> 0.4 (lighter overlay)
- Selection alpha: 0.3 -> 0.2 (subtler in light mode)
- AppBar glass: 0.7 -> 0.8 opacity
- Chip/Alert text: Use `.dark` variants for contrast on light backgrounds
- Tooltip: Dark background with light text (inverted from dark mode)

### Task 2: Hardcoded Hex Color Cleanup

**Files fixed (5):**

| File | Change |
|------|--------|
| PatternsTab.tsx | `#eee` border -> `divider` token |
| ConfirmDialog.tsx | `#f44336` etc icon colors -> `theme.palette[variant].main` |
| AttendeesPicker.tsx | RSVP status colors -> `theme.palette.success/error/warning/text.disabled` |
| AnalyticsChart.tsx | Chart line colors -> `theme.palette.primary/success` |
| SubscriptionCard.tsx | Plan tier colors -> `theme.palette.grey/info/secondary/warning` |

**Intentional hardcoded colors preserved (documented):**
- Brand tokens: `#55cae5`, `#7650ce`, `#b43db6` (logo colors)
- Flag gradients: UK/Italy country colors in Header.tsx
- Provider logos: Google/Microsoft SVG brand colors
- File type icons: PDF red, video purple, etc.
- Color picker presets: Full palette for label/calendar coloring
- Calendar event palette: 10-color scheme for events
- Star fill: `#FFB300` (universal amber star color)
- Shadow in dark mode: `#000` with alpha (appropriate for dark backgrounds)

## Technical Details

### Theme File Parity Verification

```
lightTheme.ts: 577 lines
darkTheme.ts:  577 lines
```

Both files have identical structure and component coverage.

### Color Token Usage Pattern

```typescript
// Before (hardcoded)
const VARIANT_CONFIG = {
  danger: { iconColor: '#f44336' },
  warning: { iconColor: '#ff9800' },
};

// After (theme-aware)
const VARIANT_CONFIG = {
  danger: { paletteKey: 'error' },
  warning: { paletteKey: 'warning' },
};

// Usage
const iconColor = theme.palette[config.paletteKey].main;
```

## Commits

| Hash | Description |
|------|-------------|
| 8a6441a2 | feat(10-02): bring light theme MUI component overrides to parity with dark theme |
| 061d60c5 | feat(10-02): replace hardcoded hex colors with theme tokens |

## Verification Results

- [x] lightTheme.ts component override count matches darkTheme.ts (577 lines each)
- [x] `npm run type-check` passes with no theme-related errors
- [x] No unintentional hardcoded hex values in fixed components
- [x] Remaining hardcoded colors documented as intentional

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Completed for 10-ui-review:**
- 10-01: Icon migration + accessibility (COMPLETE)
- 10-02: Theme parity + hex cleanup (COMPLETE)

**Remaining 10-ui-review plans:** 10-03 through 10-08 (spacing, typography, glass effects, mobile, visual QA, cleanup)
