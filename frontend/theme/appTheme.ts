/**
 * PMSync Theme - 2025 Modern Design System
 * Based on Logo PMSync.svg brand colors + TailAdmin patterns
 *
 * This is the main entry point for the theme system.
 * Theme is split into modular files for maintainability:
 * - tokens.ts: Design tokens (colors, spacing, typography scales)
 * - typography.ts: Shared typography configuration
 * - darkTheme.ts: Dark mode theme and component overrides
 * - lightTheme.ts: Light mode theme and component overrides
 */

import { createTheme } from '@mui/material/styles';
import { brand, darkColors, lightColors } from './tokens';
import { createPmSyncDarkTheme } from './darkTheme';
import { createPmSyncLightTheme } from './lightTheme';

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Re-export tokens for direct access
export * from './tokens';
export { typography, shape } from './typography';
export { createPmSyncDarkTheme } from './darkTheme';
export { createPmSyncLightTheme } from './lightTheme';

// =============================================================================
// LEGACY EXPORTS (for backward compatibility)
// =============================================================================

export const pmSyncColors = {
  brand,
  semantic: {
    email: brand.cyanVibrant,
    calendar: '#FF9800',
    contacts: brand.purple,
    tasks: '#22c55e',
    important: '#f59e0b',
    attachment: '#64748b',
  },
  dark: darkColors,
  light: lightColors,
};

// =============================================================================
// THEME INSTANCES
// =============================================================================

export const darkTheme = createTheme(createPmSyncDarkTheme());
export const lightTheme = createTheme(createPmSyncLightTheme());

// Default export for convenience
export default darkTheme;
