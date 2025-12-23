import React, { useState, useCallback } from 'react';
import { Box, Typography, TextField, Button, Popover, InputAdornment } from '@mui/material';
import { Check, Palette } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Preset color palette for calendars
 * These colors are chosen for good visibility and accessibility
 */
const PRESET_COLORS = [
  '#0B7EFF', // Blue
  '#9C27B0', // Purple
  '#00C853', // Green
  '#FF9800', // Orange
  '#E91E63', // Pink
  '#3F51B5', // Indigo
  '#009688', // Teal
  '#795548', // Brown
  '#607D8B', // Blue Grey
  '#FF5722', // Deep Orange
  '#4CAF50', // Light Green
  '#00BCD4', // Cyan
];

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
 * CalendarColorPicker - Enhanced color picker for calendar customization
 *
 * Features:
 * - Preset color palette for quick selection
 * - Native HTML5 color picker for custom colors
 * - Hex input field for precise color entry
 * - MUI theme integration
 * - Follows dashboard UI/UX patterns
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
  const labels = t.calendar.colorPicker;

  // Local state for custom color input
  const [customColor, setCustomColor] = useState(selectedColor);
  const [hexInput, setHexInput] = useState(selectedColor);

  // Handle preset color click
  const handlePresetClick = useCallback(
    (color: string) => {
      onColorSelect(color);
      onClose();
    },
    [onColorSelect, onClose],
  );

  // Handle custom color picker change
  const handleCustomColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const color = e.target.value;
      setCustomColor(color);
      setHexInput(color);
    },
    [],
  );

  // Handle hex input change
  const handleHexInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;
      // Ensure it starts with #
      if (!value.startsWith('#')) {
        value = '#' + value;
      }
      setHexInput(value);
      // Validate hex color
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        setCustomColor(value);
      }
    },
    [],
  );

  // Apply custom color
  const handleApplyCustom = useCallback(() => {
    if (/^#[0-9A-Fa-f]{6}$/.test(customColor)) {
      onColorSelect(customColor);
      onClose();
    }
  }, [customColor, onColorSelect, onClose]);

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            p: 2,
            width: 240,
            borderRadius: 2,
          },
        },
      }}
    >
      {/* Title */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
        {labels.title}
      </Typography>

      {/* Preset Colors Section */}
      <Typography variant="caption" color="text.secondary" gutterBottom>
        {labels.presetColors}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 0.75,
          mt: 0.5,
          mb: 2,
        }}
      >
        {PRESET_COLORS.map((color) => (
          <Box
            key={color}
            onClick={() => handlePresetClick(color)}
            sx={{
              width: 28,
              height: 28,
              bgcolor: color,
              borderRadius: '50%',
              cursor: 'pointer',
              border: '2px solid',
              borderColor: selectedColor === color ? 'grey.900' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
              '&:hover': {
                transform: 'scale(1.1)',
                boxShadow: 2,
              },
            }}
          >
            {selectedColor === color && <Check size={14} color="#fff" />}
          </Box>
        ))}
      </Box>

      {/* Custom Color Section */}
      <Typography variant="caption" color="text.secondary" gutterBottom>
        {labels.customColor}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        {/* Native Color Picker */}
        <Box
          component="input"
          type="color"
          value={customColor}
          onChange={handleCustomColorChange}
          sx={{
            width: 40,
            height: 40,
            border: 'none',
            borderRadius: 1,
            cursor: 'pointer',
            p: 0,
            '&::-webkit-color-swatch-wrapper': { padding: 0 },
            '&::-webkit-color-swatch': {
              borderRadius: 4,
              border: '1px solid',
              borderColor: 'divider',
            },
            '&::-moz-color-swatch': {
              borderRadius: 4,
              border: '1px solid',
              borderColor: 'divider',
            },
          }}
        />

        {/* Hex Input */}
        <TextField
          size="small"
          value={hexInput}
          onChange={handleHexInputChange}
          placeholder="#000000"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Palette size={16} />
              </InputAdornment>
            ),
            sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
          }}
          sx={{ flex: 1 }}
        />
      </Box>

      {/* Apply Button */}
      <Button
        fullWidth
        variant="contained"
        size="small"
        onClick={handleApplyCustom}
        disabled={!/^#[0-9A-Fa-f]{6}$/.test(customColor)}
        sx={{ mt: 1.5 }}
      >
        {labels.apply}
      </Button>
    </Popover>
  );
}

export default CalendarColorPicker;
