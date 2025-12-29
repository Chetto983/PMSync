/**
 * Calendar Color Picker Component
 *
 * Wrapper around the reusable ColorPicker for calendar-specific styling.
 * Uses ColorPickerPopover with calendar translations and apply button.
 *
 * @see D:\MailAgent\frontend\components\common\ColorPicker.tsx
 */

import React from 'react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ColorPickerPopover, DEFAULT_PRESET_COLORS } from '@/components/common/ColorPicker';

interface CalendarColorPickerProps {
  /** Currently selected color (hex format) */
  selectedColor: string;
  /** Callback when a color is selected */
  onColorSelect: (color: string) => void;
  /** Callback when picker is closed */
  onClose: () => void;
  /** Anchor element for popover positioning */
  anchorEl: HTMLElement | null;
}

/**
 * CalendarColorPicker - Color picker for calendar customization
 *
 * Uses the reusable ColorPickerPopover component with:
 * - Calendar-specific translations
 * - Apply button for confirmation
 * - 12 preset theme-friendly colors
 *
 * @see https://fullcalendar.io/docs/eventColor
 */
export function CalendarColorPicker({
  selectedColor,
  onColorSelect,
  onClose,
  anchorEl,
}: CalendarColorPickerProps) {
  const t = useTranslations();

  return (
    <ColorPickerPopover
      anchorEl={anchorEl}
      onClose={onClose}
      selectedColor={selectedColor}
      onColorSelect={onColorSelect}
      presetColors={DEFAULT_PRESET_COLORS}
      title={t.calendar?.colorPicker?.title || 'Colore calendario'}
      presetLabel={t.calendar?.colorPicker?.presetColors || 'Colori predefiniti'}
      customLabel={t.calendar?.colorPicker?.customColor || 'Colore personalizzato'}
      showApplyButton={true}
    />
  );
}

export default CalendarColorPicker;
