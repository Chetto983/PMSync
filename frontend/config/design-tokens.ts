/**
 * Design Tokens for PMSync
 *
 * Centralized configuration for colors, spacing, typography, and other design values.
 * These tokens are used to generate CSS variables and Tailwind config.
 *
 * Color format: HSL values without the hsl() wrapper for CSS variable compatibility
 * Usage in CSS: hsl(var(--color-name))
 * Usage in Tailwind: colors defined in tailwind.config.ts reference these
 */

export const colors = {
  // Brand colors
  brand: {
    primary: '189 70% 62%', // Cyan - Main brand color
    secondary: '258 55% 57%', // Purple - Secondary brand
    accent: '320 70% 60%', // Magenta - Accent highlights
  },

  // Semantic colors for different modules
  semantic: {
    email: '210 100% 56%', // Blue - Email module
    calendar: '28 100% 54%', // Orange - Calendar module
    contacts: '258 55% 57%', // Purple - Contacts module
    tasks: '142 71% 45%', // Green - Tasks module
    ai: '189 70% 62%', // Cyan - AI features
  },

  // Status colors
  status: {
    success: '142 71% 45%', // Green
    warning: '38 92% 50%', // Amber
    error: '0 84% 60%', // Red
    info: '210 100% 56%', // Blue
  },

  // Neutral palette (for light theme base)
  neutral: {
    50: '0 0% 98%',
    100: '0 0% 96%',
    200: '0 0% 90%',
    300: '0 0% 83%',
    400: '0 0% 64%',
    500: '0 0% 45%',
    600: '0 0% 32%',
    700: '0 0% 25%',
    800: '0 0% 15%',
    900: '0 0% 9%',
    950: '0 0% 4%',
  },
} as const;

export const spacing = {
  px: '1px',
  0: '0',
  0.5: '0.125rem', // 2px
  1: '0.25rem', // 4px
  1.5: '0.375rem', // 6px
  2: '0.5rem', // 8px
  2.5: '0.625rem', // 10px
  3: '0.75rem', // 12px
  3.5: '0.875rem', // 14px
  4: '1rem', // 16px
  5: '1.25rem', // 20px
  6: '1.5rem', // 24px
  7: '1.75rem', // 28px
  8: '2rem', // 32px
  9: '2.25rem', // 36px
  10: '2.5rem', // 40px
  11: '2.75rem', // 44px
  12: '3rem', // 48px
  14: '3.5rem', // 56px
  16: '4rem', // 64px
  20: '5rem', // 80px
  24: '6rem', // 96px
  28: '7rem', // 112px
  32: '8rem', // 128px
} as const;

export const typography = {
  // Font families
  fontFamily: {
    sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
  },

  // Font sizes (rem)
  fontSize: {
    xs: '0.75rem', // 12px
    sm: '0.875rem', // 14px
    base: '1rem', // 16px
    lg: '1.125rem', // 18px
    xl: '1.25rem', // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem', // 48px
  },

  // Font weights
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  // Line heights
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },

  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
  },
} as const;

export const radius = {
  none: '0',
  sm: '0.25rem', // 4px
  DEFAULT: '0.5rem', // 8px
  md: '0.375rem', // 6px
  lg: '0.75rem', // 12px
  xl: '1rem', // 16px
  '2xl': '1.5rem', // 24px
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  none: 'none',
} as const;

export const transitions = {
  // Durations
  duration: {
    fast: '150ms',
    DEFAULT: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  // Timing functions
  timing: {
    DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

export const zIndex = {
  auto: 'auto',
  0: '0',
  10: '10',
  20: '20',
  30: '30',
  40: '40',
  50: '50', // Dropdowns, tooltips
  60: '60', // Modals
  70: '70', // Notifications
  80: '80', // Command palette
  90: '90', // Toast
  100: '100', // Critical overlays
} as const;

// Component-specific tokens
export const components = {
  // Sidebar
  sidebar: {
    width: '280px',
    collapsedWidth: '64px',
  },

  // Email list item
  emailListItem: {
    height: '72px',
    avatarSize: '40px',
  },

  // Header
  header: {
    height: '64px',
  },

  // AI Chat panel
  aiPanel: {
    width: '400px',
    minWidth: '320px',
    maxWidth: '600px',
  },
} as const;

// Export all tokens
export const designTokens = {
  colors,
  spacing,
  typography,
  radius,
  shadows,
  transitions,
  zIndex,
  components,
} as const;

export default designTokens;
