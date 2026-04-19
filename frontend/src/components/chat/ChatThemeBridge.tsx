'use client';

/**
 * ChatThemeBridge
 *
 * Maps MUI theme palette values → CSS custom properties consumed by the three
 * chat CSS files (chat-layout.css, chat-sidebar.css, chat-thread.css).
 *
 * This decouples the chat UI from the Tailwind/shadcn CSS variables in
 * globals.css.  All --chat-* and base HSL-component variables are derived
 * directly from the active MUI theme, ensuring dark/light mode reactivity.
 */

import { useMemo } from 'react';
import { useTheme, alpha } from '@mui/material';

// ---------------------------------------------------------------------------
// Hex → HSL component string  (e.g. "#55cae5" → "189 70% 50%")
// The chat CSS expects `hsl(var(--name))` where var is "H S% L%".
// ---------------------------------------------------------------------------

function hexToHsl(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '0 0% 0%';

  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return `0 0% ${Math.round(l * 100)}%`;

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChatThemeBridgeProps {
  children: React.ReactNode;
}

export function ChatThemeBridge({ children }: ChatThemeBridgeProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const cssVars = useMemo(() => {
    const p = theme.palette;

    // ----- Base HSL-component variables (used as `hsl(var(--name))`) -----
    const vars: Record<string, string> = {
      '--background': hexToHsl(p.background.default),
      '--foreground': hexToHsl(p.text.primary),
      '--card': hexToHsl(p.background.paper),
      '--card-foreground': hexToHsl(p.text.primary),
      '--muted': hexToHsl(isDark ? '#1f2937' : '#f1f5f9'),
      '--muted-foreground': hexToHsl(p.text.secondary),
      '--primary': hexToHsl(p.primary.main),
      '--primary-foreground': hexToHsl(p.primary.contrastText),
      '--destructive': hexToHsl(p.error.main),
      '--destructive-foreground': hexToHsl(p.error.contrastText),
      '--border': hexToHsl(p.divider),

      // Semantic module colors
      '--color-email': isDark ? '210 100% 60%' : '210 100% 56%',
      '--color-calendar': isDark ? '28 100% 58%' : '28 100% 54%',
      '--color-contacts': isDark ? '258 55% 60%' : '258 55% 57%',

      // ----- Resolved --chat-* variables (full CSS color values) -----
      '--chat-bg': p.background.default,
      '--chat-surface': p.background.paper,
      '--chat-thread-bg': isDark ? p.background.paper : p.background.default,
      '--chat-border': isDark
        ? 'rgba(30, 41, 59, 0.9)'
        : alpha(p.divider, 1),
      '--chat-border-strong': isDark
        ? 'rgba(51, 65, 85, 0.95)'
        : '#cbd5e1',
      '--chat-sidebar-bg': isDark
        ? '#111827'
        : alpha('#e2e8f0', 0.4),
      '--chat-muted-bg': isDark
        ? 'rgba(31, 41, 55, 0.78)'
        : alpha('#cbd5e1', 0.35),
      '--chat-elev-1': isDark
        ? '0 8px 24px rgba(0, 0, 0, 0.28)'
        : '0 2px 10px hsl(0 0% 0% / 0.05)',
      '--chat-elev-2': isDark
        ? '0 16px 34px rgba(0, 0, 0, 0.35)'
        : '0 10px 28px hsl(220 40% 5% / 0.08)',
    };

    return vars as unknown as React.CSSProperties;
  }, [theme, isDark]);

  return (
    <div
      style={{
        ...cssVars,
        height: '100%',
        display: 'flex',
        flex: '1 1 0%',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}
