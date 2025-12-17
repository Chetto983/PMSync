/**
 * PMSync Design Tokens - 2025 Modern Theme
 * Based on Logo PMSync.svg brand colors + TailAdmin patterns
 */

// =============================================================================
// BRAND COLORS (from Logo PMSync.svg)
// =============================================================================

export const brand = {
  // Primary cyan tones
  cyan: '#55cae5',
  cyanBright: '#36e3ed',
  cyanVibrant: '#00aced',
  cyanLight: '#96d6e9',

  // Purple tones
  purple: '#7650ce',
  purpleDeep: '#452077',
  purpleLight: '#9068d8',

  // Magenta/Pink tones
  magenta: '#b43db6',
  magentaBright: '#bc4fc2',
  magentaLight: '#b64cb3',

  // Navy/Blue tones
  navy: '#303e75',
  navyLight: '#354c7d',
  navyDark: '#38387f',

  // Gradients
  gradient: 'linear-gradient(135deg, #55cae5 0%, #7650ce 100%)',
  gradientReverse: 'linear-gradient(135deg, #7650ce 0%, #55cae5 100%)',
  gradientFull: 'linear-gradient(135deg, #55cae5 0%, #7650ce 50%, #b43db6 100%)',
  gradientPurple: 'linear-gradient(135deg, #7650ce 0%, #b43db6 100%)',
  gradientCyan: 'linear-gradient(135deg, #00aced 0%, #55cae5 100%)',
} as const;

// =============================================================================
// SPACING SCALE (8px base, Tailwind-inspired)
// =============================================================================

export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,      // Base unit
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,     // Common padding
  5: 20,
  6: 24,     // Card padding
  7: 28,
  8: 32,     // Section spacing
  9: 36,
  10: 40,
  11: 44,
  12: 48,    // Large section
  14: 56,
  16: 64,    // Header height
  20: 80,
  24: 96,
} as const;

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const fontFamily = {
  sans: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
} as const;

export const fontSize = {
  xs: '0.75rem',      // 12px
  sm: '0.8125rem',    // 13px
  base: '0.875rem',   // 14px - default body
  md: '1rem',         // 16px
  lg: '1.125rem',     // 18px
  xl: '1.25rem',      // 20px
  '2xl': '1.5rem',    // 24px
  '3xl': '1.875rem',  // 30px
  '4xl': '2.25rem',   // 36px
  '5xl': '3rem',      // 48px
} as const;

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export const lineHeight = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
} as const;

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const borderRadius = {
  none: 0,
  sm: 4,
  DEFAULT: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
} as const;

// =============================================================================
// SHADOWS
// =============================================================================

export const shadows = {
  dark: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
    DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.5)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.5)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.3)',
    glow: `0 0 20px rgba(85, 202, 229, 0.3)`,
    glowPurple: `0 0 20px rgba(118, 80, 206, 0.3)`,
  },
  light: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    glow: `0 0 20px rgba(85, 202, 229, 0.15)`,
    glowPurple: `0 0 20px rgba(118, 80, 206, 0.15)`,
  },
} as const;

// =============================================================================
// TRANSITIONS
// =============================================================================

export const transitions = {
  duration: {
    fast: 150,
    DEFAULT: 200,
    slow: 300,
    slower: 500,
  },
  easing: {
    DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

// =============================================================================
// GLASSMORPHISM
// =============================================================================

export const glass = {
  dark: {
    background: 'rgba(19, 26, 36, 0.8)',
    backgroundStrong: 'rgba(19, 26, 36, 0.95)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.12)',
  },
  light: {
    background: 'rgba(255, 255, 255, 0.8)',
    backgroundStrong: 'rgba(255, 255, 255, 0.95)',
    border: 'rgba(0, 0, 0, 0.05)',
    borderStrong: 'rgba(0, 0, 0, 0.1)',
  },
  blur: {
    sm: 'blur(8px)',
    DEFAULT: 'blur(12px)',
    lg: 'blur(20px)',
    xl: 'blur(40px)',
  },
} as const;

// =============================================================================
// DARK THEME COLORS
// =============================================================================

export const darkColors = {
  // Backgrounds - Dark navy with blue undertone
  background: {
    base: '#070a0d',
    default: '#0c1017',
    paper: '#131a24',
    elevated: '#1a2332',
    subtle: '#1f2937',
    hover: '#243244',
  },

  // Text
  text: {
    primary: '#f8fafc',
    secondary: '#94a3b8',
    tertiary: '#64748b',
    disabled: '#475569',
    inverse: '#0f172a',
  },

  // Borders
  border: {
    default: '#1e293b',
    subtle: '#172033',
    strong: '#334155',
  },

  // Primary (Cyan from logo)
  primary: {
    main: '#55cae5',
    light: '#36e3ed',
    dark: '#00aced',
    contrastText: '#0c1017',
    hover: 'rgba(85, 202, 229, 0.08)',
    selected: 'rgba(85, 202, 229, 0.16)',
    focus: 'rgba(85, 202, 229, 0.24)',
  },

  // Secondary (Purple from logo)
  secondary: {
    main: '#7650ce',
    light: '#9068d8',
    dark: '#452077',
    contrastText: '#ffffff',
    hover: 'rgba(118, 80, 206, 0.08)',
    selected: 'rgba(118, 80, 206, 0.16)',
  },

  // Semantic
  success: {
    main: '#22c55e',
    light: '#4ade80',
    dark: '#16a34a',
    contrastText: '#ffffff',
    subtle: 'rgba(34, 197, 94, 0.12)',
  },
  warning: {
    main: '#f59e0b',
    light: '#fbbf24',
    dark: '#d97706',
    contrastText: '#0c1017',
    subtle: 'rgba(245, 158, 11, 0.12)',
  },
  error: {
    main: '#ef4444',
    light: '#f87171',
    dark: '#dc2626',
    contrastText: '#ffffff',
    subtle: 'rgba(239, 68, 68, 0.12)',
  },
  info: {
    main: '#55cae5',
    light: '#36e3ed',
    dark: '#00aced',
    contrastText: '#0c1017',
    subtle: 'rgba(85, 202, 229, 0.12)',
  },

  // Action states
  action: {
    active: 'rgba(248, 250, 252, 0.56)',
    hover: 'rgba(248, 250, 252, 0.08)',
    selected: 'rgba(248, 250, 252, 0.16)',
    disabled: 'rgba(248, 250, 252, 0.3)',
    disabledBackground: 'rgba(248, 250, 252, 0.12)',
    focus: 'rgba(85, 202, 229, 0.24)',
  },
} as const;

// =============================================================================
// LIGHT THEME COLORS
// =============================================================================

export const lightColors = {
  // Backgrounds
  background: {
    base: '#ffffff',
    default: '#f8fafc',
    paper: '#ffffff',
    elevated: '#ffffff',
    subtle: '#f1f5f9',
    hover: '#e2e8f0',
  },

  // Text
  text: {
    primary: '#0f172a',
    secondary: '#475569',
    tertiary: '#64748b',
    disabled: '#94a3b8',
    inverse: '#f8fafc',
  },

  // Borders
  border: {
    default: '#e2e8f0',
    subtle: '#f1f5f9',
    strong: '#cbd5e1',
  },

  // Primary (Cyan from logo - slightly darker for light mode)
  primary: {
    main: '#00aced',
    light: '#55cae5',
    dark: '#0891b2',
    contrastText: '#ffffff',
    hover: 'rgba(0, 172, 237, 0.08)',
    selected: 'rgba(0, 172, 237, 0.16)',
    focus: 'rgba(0, 172, 237, 0.24)',
  },

  // Secondary (Purple from logo)
  secondary: {
    main: '#7650ce',
    light: '#9068d8',
    dark: '#452077',
    contrastText: '#ffffff',
    hover: 'rgba(118, 80, 206, 0.08)',
    selected: 'rgba(118, 80, 206, 0.16)',
  },

  // Semantic (same as dark)
  success: {
    main: '#16a34a',
    light: '#22c55e',
    dark: '#15803d',
    contrastText: '#ffffff',
    subtle: 'rgba(22, 163, 74, 0.12)',
  },
  warning: {
    main: '#d97706',
    light: '#f59e0b',
    dark: '#b45309',
    contrastText: '#ffffff',
    subtle: 'rgba(217, 119, 6, 0.12)',
  },
  error: {
    main: '#dc2626',
    light: '#ef4444',
    dark: '#b91c1c',
    contrastText: '#ffffff',
    subtle: 'rgba(220, 38, 38, 0.12)',
  },
  info: {
    main: '#00aced',
    light: '#55cae5',
    dark: '#0891b2',
    contrastText: '#ffffff',
    subtle: 'rgba(0, 172, 237, 0.12)',
  },

  // Action states
  action: {
    active: 'rgba(15, 23, 42, 0.56)',
    hover: 'rgba(15, 23, 42, 0.04)',
    selected: 'rgba(15, 23, 42, 0.08)',
    disabled: 'rgba(15, 23, 42, 0.26)',
    disabledBackground: 'rgba(15, 23, 42, 0.12)',
    focus: 'rgba(0, 172, 237, 0.24)',
  },
} as const;

// =============================================================================
// LAYOUT CONSTANTS
// =============================================================================

export const layout = {
  sidebar: {
    expanded: 240,
    collapsed: 72,
  },
  header: {
    height: 64,
  },
  content: {
    maxWidth: 1400,
    padding: {
      xs: 16,
      sm: 24,
      md: 32,
    },
  },
  card: {
    padding: {
      sm: 16,
      md: 20,
      lg: 24,
    },
  },
} as const;

// =============================================================================
// Z-INDEX SCALE
// =============================================================================

export const zIndex = {
  mobileStepper: 1000,
  fab: 1050,
  speedDial: 1050,
  appBar: 1100,
  drawer: 1200,
  modal: 1300,
  snackbar: 1400,
  tooltip: 1500,
} as const;

// =============================================================================
// BREAKPOINTS
// =============================================================================

export const breakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// Export all tokens as default
const tokens = {
  brand,
  spacing,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  borderRadius,
  shadows,
  transitions,
  glass,
  darkColors,
  lightColors,
  layout,
  zIndex,
  breakpoints,
} as const;

export default tokens;
