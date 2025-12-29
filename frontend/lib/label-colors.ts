/**
 * Label Colors Configuration
 *
 * Uses MUI theme-friendly colors with both light and dark variants.
 * Includes support for custom color picker.
 *
 * @see D:\MailAgent\frontend\components\calendar\CalendarColorPicker.tsx
 */

export interface LabelColor {
  /** Display color (background) */
  backgroundColor: string;
  /** Text color for contrast */
  textColor: string;
  /** Optional theme palette key */
  themeKey?: string;
}

/**
 * Preset label colors using MUI-friendly palette
 * These work well in both light and dark themes
 */
export const LABEL_COLORS: readonly LabelColor[] = [
  // Primary colors
  { backgroundColor: '#1976D2', textColor: '#FFFFFF', themeKey: 'primary' },
  { backgroundColor: '#9C27B0', textColor: '#FFFFFF', themeKey: 'secondary' },
  // Success/Error/Warning/Info
  { backgroundColor: '#2E7D32', textColor: '#FFFFFF', themeKey: 'success' },
  { backgroundColor: '#D32F2F', textColor: '#FFFFFF', themeKey: 'error' },
  { backgroundColor: '#ED6C02', textColor: '#FFFFFF', themeKey: 'warning' },
  { backgroundColor: '#0288D1', textColor: '#FFFFFF', themeKey: 'info' },
  // Extended palette
  { backgroundColor: '#7B1FA2', textColor: '#FFFFFF' }, // Deep Purple
  { backgroundColor: '#C2185B', textColor: '#FFFFFF' }, // Pink
  { backgroundColor: '#00796B', textColor: '#FFFFFF' }, // Teal
  { backgroundColor: '#5D4037', textColor: '#FFFFFF' }, // Brown
  { backgroundColor: '#455A64', textColor: '#FFFFFF' }, // Blue Grey
  { backgroundColor: '#F57C00', textColor: '#FFFFFF' }, // Orange
] as const;

/**
 * Default color for new labels
 */
export const DEFAULT_LABEL_COLOR: LabelColor = LABEL_COLORS[0];

/**
 * Get background colors only (for quick access)
 */
export const LABEL_BACKGROUND_COLORS = LABEL_COLORS.map(
  (color) => color.backgroundColor
);

/**
 * Validate if a color is a valid hex color
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Find matching preset color or return null
 */
export function findLabelColor(backgroundColor: string): LabelColor | null {
  return (
    LABEL_COLORS.find(
      (color) =>
        color.backgroundColor.toLowerCase() === backgroundColor.toLowerCase()
    ) || null
  );
}

/**
 * Get contrasting text color for any background
 * Uses relative luminance calculation
 */
export function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');

  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return white for dark backgrounds, dark for light backgrounds
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Create a LabelColor from a hex background color
 */
export function createLabelColor(backgroundColor: string): LabelColor {
  return {
    backgroundColor,
    textColor: getContrastColor(backgroundColor),
  };
}
