/**
 * Label Color Picker Component
 *
 * Wrapper around the reusable ColorPicker for label-specific functionality.
 * Converts between LabelColor objects and hex strings.
 *
 * @see frontend/components\common\ColorPicker.tsx
 */

import React from 'react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ColorPicker, DEFAULT_PRESET_COLORS } from '@/components/common/ColorPicker';
import {
  createLabelColor,
  type LabelColor,
} from '@/lib/label-colors';

interface LabelColorPickerProps {
  /** Currently selected color */
  selectedColor: LabelColor;
  /** Callback when a color is selected */
  onColorSelect: (color: LabelColor) => void;
  /** Show custom color input (default: true) */
  showCustom?: boolean;
}

/**
 * LabelColorPicker - Color picker for email labels
 *
 * Uses the reusable ColorPicker component and converts
 * hex colors to LabelColor objects with proper contrast.
 *
 * Features:
 * - 12 preset theme-friendly colors
 * - Native HTML5 color picker for custom colors
 * - Hex input field for precise color entry
 * - Auto-calculates contrast text color
 */
export function LabelColorPicker({
  selectedColor,
  onColorSelect,
  showCustom = false,
}: LabelColorPickerProps) {
  const t = useTranslations();

  // Convert LabelColor to hex for the reusable picker
  const hexColor = selectedColor?.backgroundColor || '#1976D2';

  // Handle color selection - convert hex to LabelColor
  const handleColorSelect = (color: string) => {
    onColorSelect(createLabelColor(color));
  };

  return (
    <ColorPicker
      selectedColor={hexColor}
      onColorSelect={handleColorSelect}
      presetColors={DEFAULT_PRESET_COLORS}
      columns={6}
      showCustom={showCustom}
      swatchSize={32}
      presetLabel={t.email?.labels?.presetColors || 'Preset colors'}
      customLabel={t.email?.labels?.customColor || 'Custom color'}
    />
  );
}

export default LabelColorPicker;
