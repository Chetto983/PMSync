# Phase 4: Email Composer - Research

**Researched:** 2026-02-02
**Domain:** Mobile responsive rich text editor, TipTap keyboard shortcuts, fullscreen compose UX
**Confidence:** HIGH (codebase analysis + official TipTap docs + established MUI patterns)

## Summary

Phase 04 is 90% implemented. Research focused on the THREE specific gaps identified in CONTEXT.md:

1. **AI Keyboard Shortcut (Cmd/Ctrl+J)** - TipTap provides `addKeyboardShortcuts()` method for custom extensions. Use `Mod-j` syntax for cross-platform support.

2. **Mobile Responsive Toolbar** - Codebase already uses `useMediaQuery(theme.breakpoints.down('md'))` pattern consistently. mui-tiptap provides `isTouchDevice()` utility already imported in `EditorMenuControls.tsx`. Implement toolbar collapse with MUI `Collapse` + overflow menu pattern.

3. **Mobile Fullscreen Compose** - Use MUI Dialog with `fullScreen` prop conditionally based on breakpoint. Add CSS safe area insets for iOS notch handling. SwipeableDrawer is available but Dialog with fullScreen is simpler and matches existing ComposeDialog pattern.

**Primary recommendation:** Create a single custom TipTap extension for the Cmd+J shortcut, wrap EditorMenuControls in responsive logic using existing `useMediaQuery` pattern, and add `fullScreen={isMobile}` prop to ComposeDialog.

## Standard Stack

Since 90% is implemented, the stack is LOCKED to what exists in codebase.

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mui-tiptap | Current | MUI-styled TipTap wrapper | Already integrated in ComposeEditor.tsx |
| @tiptap/core | Current | Rich text editor core | Base for keyboard shortcut extension |
| @mui/material | Current | UI components | Dialog fullScreen prop, useMediaQuery |
| framer-motion | Current | Animations | Already used in AIInlineMenu.tsx |

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| use-debounce | Current | Input debouncing | Already used for draft autosave |
| react-dropzone | Current | File upload | Already in ComposeAttachments.tsx |

### No New Dependencies Required
All gaps can be implemented with existing libraries. Do NOT add new packages.

## Architecture Patterns

### Pattern 1: TipTap Custom Keyboard Shortcut Extension

**What:** Create a minimal extension that registers Cmd/Ctrl+J to trigger AI menu
**When to use:** For the AI keyboard shortcut gap
**Confidence:** HIGH (verified via TipTap official docs)

```typescript
// Source: https://tiptap.dev/docs/editor/core-concepts/keyboard-shortcuts
import { Extension } from '@tiptap/core';

export const AiShortcutExtension = Extension.create({
  name: 'aiShortcut',

  addKeyboardShortcuts() {
    return {
      // 'Mod' = Cmd on Mac, Ctrl on Windows/Linux
      'Mod-j': () => {
        // Emit custom event that ComposeEditor listens to
        this.editor.commands.focus();
        // Trigger AI menu via callback passed during extension creation
        this.options.onTriggerAi?.();
        return true; // Prevent default browser behavior
      },
    };
  },
});
```

**Integration approach:**
1. Create extension in `useExtensions.ts` or new file `aiShortcutExtension.ts`
2. Pass callback via extension options: `AiShortcutExtension.configure({ onTriggerAi: handleOpenAiMenu })`
3. The callback uses a ref to a fake DOM element or creates anchor element for Popover positioning

### Pattern 2: Responsive Toolbar with Overflow Menu

**What:** Collapse toolbar to 5 primary buttons on mobile, show "More" button for rest
**When to use:** For mobile responsive toolbar gap
**Confidence:** HIGH (follows existing codebase patterns)

```typescript
// Pattern from existing codebase: useMediaQuery + conditional render
import { useMediaQuery, useTheme } from '@mui/material';
import { useState } from 'react';

export default function EditorMenuControls({ onAiCompose, onAttach }: EditorMenuControlsProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md')); // < 768px
  const [showMore, setShowMore] = useState(false);

  // Primary controls always visible
  const PrimaryControls = () => (
    <>
      <MenuButtonBold />
      <MenuButtonItalic />
      <MenuButtonEditLink />
      {onAttach && <AttachButton onClick={onAttach} />}
      {onAiCompose && <AiButton onClick={onAiCompose} />}
    </>
  );

  // Secondary controls in overflow
  const SecondaryControls = () => (
    <>
      <MenuButtonUnderline />
      <MenuButtonStrikethrough />
      {/* ... all other buttons ... */}
    </>
  );

  if (isMobile) {
    return (
      <MenuControlsContainer>
        <PrimaryControls />
        <MenuDivider />
        <IconButton onClick={() => setShowMore(!showMore)}>
          <MoreIcon />
        </IconButton>
        <Collapse in={showMore}>
          <SecondaryControls />
        </Collapse>
      </MenuControlsContainer>
    );
  }

  return (
    <MenuControlsContainer>
      {/* Full toolbar for desktop */}
    </MenuControlsContainer>
  );
}
```

### Pattern 3: Mobile Fullscreen Compose Dialog

**What:** Render Dialog in fullscreen mode on mobile
**When to use:** For mobile fullscreen compose gap
**Confidence:** HIGH (MUI Dialog has native fullScreen prop)

```typescript
// Source: MUI Dialog documentation
export default function ComposeDialog({ open, onClose, ... }: ComposeDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}  // <-- Key change
      maxWidth={isMobile ? false : 'md'}
      fullWidth
      PaperProps={{
        sx: {
          // iOS safe area handling
          ...(isMobile && {
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }),
        },
      }}
    >
      {/* Mobile sticky header */}
      {isMobile && (
        <AppBar position="sticky" color="default" elevation={0}>
          <Toolbar>
            <IconButton onClick={onClose}><CloseIcon /></IconButton>
            <Typography sx={{ flex: 1 }}>New Message</Typography>
            <Button onClick={handleSend}>Send</Button>
          </Toolbar>
        </AppBar>
      )}
      {/* ... rest of dialog content ... */}
    </Dialog>
  );
}
```

### Anti-Patterns to Avoid

- **Don't create new npm packages for keyboard shortcuts** - TipTap has built-in `addKeyboardShortcuts()` method
- **Don't use CSS media queries for toolbar logic** - Use MUI's `useMediaQuery` hook for React-aware responsive behavior
- **Don't build custom swipe-to-dismiss** - MUI Dialog already handles backdrop click dismiss; SwipeableDrawer adds complexity
- **Don't hand-roll touch detection** - mui-tiptap exports `isTouchDevice()` utility, already imported in EditorMenuControls.tsx

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform keyboard shortcuts | Manual `keydown` event listener | TipTap `addKeyboardShortcuts()` with `Mod-j` | Handles Mac/Windows automatically |
| Touch device detection | `window.matchMedia('(pointer: coarse)')` | `isTouchDevice()` from mui-tiptap | Already imported in codebase |
| Responsive breakpoint detection | Manual `window.innerWidth` checks | `useMediaQuery(theme.breakpoints.down('md'))` | Consistent with codebase pattern |
| iOS safe area handling | Manual viewport calculations | `env(safe-area-inset-*)` CSS | Browser-native, 96.78% support |
| Fullscreen dialog on mobile | Custom overlay implementation | MUI Dialog `fullScreen={true}` prop | Native MUI capability |

**Key insight:** All three gaps can be solved with EXISTING patterns and APIs. No new libraries or complex custom code needed.

## Common Pitfalls

### Pitfall 1: Keyboard Shortcut Not Triggering Popover Correctly

**What goes wrong:** `handleOpenAiMenu` expects a `MouseEvent` with `currentTarget` for Popover anchor positioning, but keyboard shortcut has no mouse event
**Why it happens:** Popover needs anchor element reference; keyboard events don't provide one
**How to avoid:** Create a ref to the AI button element, use that ref as anchor when triggered via keyboard
**Warning signs:** Popover appears at (0,0) or doesn't appear at all

```typescript
// Solution: Use ref-based anchor
const aiButtonRef = useRef<HTMLButtonElement>(null);

const handleOpenAiMenu = useCallback((fromKeyboard = false) => {
  if (fromKeyboard && aiButtonRef.current) {
    setAiMenuAnchor(aiButtonRef.current);
  }
  // ... rest of logic
}, []);
```

### Pitfall 2: Toolbar Overflow Menu Z-Index Issues

**What goes wrong:** Overflow menu appears behind editor content or other UI elements
**Why it happens:** TipTap editor has its own stacking context; MUI Collapse/Popover needs proper z-index
**How to avoid:** Use MUI Popover for overflow menu (not Collapse), ensure z-index matches dialog context
**Warning signs:** Menu items not clickable, menu appears clipped or hidden

### Pitfall 3: iOS Safe Area Not Applied

**What goes wrong:** Content hidden behind iPhone notch or home indicator
**Why it happens:** Missing `viewport-fit=cover` in viewport meta tag
**How to avoid:** Verify `<meta name="viewport" content="..., viewport-fit=cover">` exists in `_document.tsx`
**Warning signs:** Padding env() values are always 0

### Pitfall 4: Mobile Keyboard Pushes Content Up

**What goes wrong:** When virtual keyboard opens, toolbar or content scrolls out of view
**Why it happens:** Mobile browsers resize viewport when keyboard appears
**How to avoid:** Use `position: sticky` for bottom toolbar, ensure content area is scrollable
**Warning signs:** Users can't see what they're typing on mobile

### Pitfall 5: Focus Lost After AI Menu Closes

**What goes wrong:** After using AI compose, cursor is no longer in editor
**Why it happens:** Popover takes focus, doesn't return it to editor
**How to avoid:** Call `editor.commands.focus()` in `handleCloseAiMenu` callback
**Warning signs:** Users have to click back into editor after every AI action

## Code Examples

### Example 1: Complete AI Shortcut Extension

```typescript
// Source: TipTap keyboard shortcuts documentation
// File: frontend/components/email/compose/aiShortcutExtension.ts

import { Extension } from '@tiptap/core';

export interface AiShortcutOptions {
  onTriggerAi: () => void;
}

export const AiShortcutExtension = Extension.create<AiShortcutOptions>({
  name: 'aiShortcut',

  addOptions() {
    return {
      onTriggerAi: () => {},
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-j': () => {
        this.options.onTriggerAi();
        return true; // Prevent browser default (Chrome bookmark shortcut)
      },
    };
  },
});
```

### Example 2: Responsive Toolbar Container

```typescript
// File: frontend/components/email/compose/ResponsiveMenuControls.tsx

import { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Box from '@mui/material/Box';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import {
  MenuControlsContainer,
  MenuButtonBold,
  MenuButtonItalic,
  MenuButtonEditLink,
  MenuDivider,
  // ... other imports
} from 'mui-tiptap';

export type ResponsiveMenuControlsProps = {
  onAiCompose?: (event: React.MouseEvent<HTMLElement>) => void;
  onAttach?: () => void;
};

export default function ResponsiveMenuControls({
  onAiCompose,
  onAttach,
}: ResponsiveMenuControlsProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);

  const handleOpenMore = (event: React.MouseEvent<HTMLElement>) => {
    setMoreAnchor(event.currentTarget);
  };

  const handleCloseMore = () => {
    setMoreAnchor(null);
  };

  // Primary actions visible on all screens
  const PrimaryActions = () => (
    <>
      {onAiCompose && (
        <IconButton size="small" onClick={onAiCompose} sx={{ color: 'primary.main' }}>
          <AutoAwesomeIcon fontSize="small" />
        </IconButton>
      )}
      <MenuDivider />
      <MenuButtonBold />
      <MenuButtonItalic />
      <MenuButtonEditLink />
      {onAttach && (
        <IconButton size="small" onClick={onAttach}>
          <AttachFileIcon fontSize="small" />
        </IconButton>
      )}
    </>
  );

  // Secondary actions in overflow menu on mobile
  const SecondaryActions = () => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, p: 1 }}>
      <MenuButtonUnderline />
      <MenuButtonStrikethrough />
      {/* ... remaining toolbar buttons ... */}
    </Box>
  );

  if (isMobile) {
    return (
      <MenuControlsContainer
        sx={{
          position: 'sticky',
          bottom: 0,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          minHeight: 48, // Touch target
        }}
      >
        <PrimaryActions />
        <MenuDivider />
        <IconButton
          size="small"
          onClick={handleOpenMore}
          sx={{ minWidth: 44, minHeight: 44 }} // Touch target
        >
          <MoreHorizIcon />
        </IconButton>
        <Popover
          open={Boolean(moreAnchor)}
          anchorEl={moreAnchor}
          onClose={handleCloseMore}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <SecondaryActions />
        </Popover>
      </MenuControlsContainer>
    );
  }

  // Desktop: full toolbar (existing implementation)
  return (
    <MenuControlsContainer>
      <PrimaryActions />
      <MenuDivider />
      <SecondaryActions />
    </MenuControlsContainer>
  );
}
```

### Example 3: iOS Safe Area CSS

```css
/* Add to ComposeDialog PaperProps.sx or global styles */
/* Source: https://webkit.org/blog/7929/designing-websites-for-iphone-x/ */

.mobile-compose-dialog {
  /* Ensure content doesn't go behind notch */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

.mobile-bottom-toolbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  /* Account for home indicator */
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  background-color: var(--background-paper);
  border-top: 1px solid var(--divider);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global keydown listeners | TipTap `addKeyboardShortcuts()` | TipTap v2+ | Cleaner, integrated with editor state |
| CSS media queries for responsive | MUI `useMediaQuery` hook | MUI v5 | React-aware, theme-integrated |
| Inline styles for safe area | `env()` CSS function | iOS 11+ (2017) | 96.78% browser support |

**Not deprecated but avoid:**
- Manual touch detection - use mui-tiptap's `isTouchDevice()`
- Custom modal implementations - MUI Dialog handles all cases

## Open Questions

1. **Popover anchor for keyboard shortcut**
   - What we know: Need a DOM element for Popover anchorEl
   - What's unclear: Best UX - anchor to AI button, or show at cursor position?
   - Recommendation: Anchor to AI button ref for consistency with click behavior

2. **Toolbar position on mobile**
   - What we know: Context says "bottom placement for thumb reach"
   - What's unclear: Should it be fixed bottom or scroll with content?
   - Recommendation: Fixed bottom (sticky) - matches Gmail pattern and CONTEXT.md decision

3. **Swipe-to-dismiss scope**
   - What we know: Context mentions "swipe-to-dismiss option"
   - What's unclear: Full swipe gesture implementation vs backdrop dismiss
   - Recommendation: Start with backdrop dismiss (Dialog default), add SwipeableDrawer if users request

## Sources

### Primary (HIGH confidence)
- TipTap keyboard shortcuts documentation: https://tiptap.dev/docs/editor/core-concepts/keyboard-shortcuts
- TipTap custom extension API: https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension
- MUI Dialog API: https://mui.com/material-ui/react-drawer/ (fullScreen prop)
- Codebase analysis: `ComposeEditor.tsx`, `EditorMenuControls.tsx`, `AiComposeMenu.tsx`

### Secondary (MEDIUM confidence)
- MUI SwipeableDrawer: https://mui.com/material-ui/api/swipeable-drawer/
- iOS safe area CSS: https://webkit.org/blog/7929/designing-websites-for-iphone-x/
- Zendesk rich text editor patterns: https://garden.zendesk.com/patterns/rich-text-editor/

### Tertiary (LOW confidence)
- Gmail mobile UX patterns - observation-based, not documented

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Already implemented in codebase
- Architecture patterns: HIGH - TipTap docs verified, MUI patterns established in codebase
- Pitfalls: MEDIUM - Based on common React/TipTap issues, some unverified edge cases

**Research date:** 2026-02-02
**Valid until:** 30 days (stable libraries, no breaking changes expected)
