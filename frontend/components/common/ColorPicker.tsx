/**
 * Reusable Color Picker Component
 *
 * A versatile color picker with preset colors and custom color input.
 * Used by Calendar, Labels, and other components that need color selection.
 *
 * Features:
 * - Preset color grid
 * - Native HTML5 color picker
 * - Hex input field
 * - MUI theme integration
 * - Supports both Popover and inline modes
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Popover,
  InputAdornment,
  alpha,
} from '@mui/material';
import { Check, Palette } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface ColorOption {
  /** Background/main color (hex) */
  color: string;
  /** Optional label for the color */
  label?: string;
}

interface ColorPickerProps {
  /** Currently selected color (hex) */
  selectedColor: string;
  /** Callback when a color is selected */
  onColorSelect: (color: string) => void;
  /** Preset colors to display */
  presetColors?: readonly string[];
  /** Number of columns in the grid (default: 6) */
  columns?: number;
  /** Show custom color picker (default: true) */
  showCustom?: boolean;
  /** Size of color swatches (default: 32) */
  swatchSize?: number;
  /** Label for preset colors section */
  presetLabel?: string;
  /** Label for custom color section */
  customLabel?: string;
}

/**
 * Default preset colors - MUI theme-friendly palette
 */
export const DEFAULT_PRESET_COLORS = [
  '#1976D2', // Blue (primary)
  '#9C27B0', // Purple
  '#2E7D32', // Green (success)
  '#D32F2F', // Red (error)
  '#ED6C02', // Orange (warning)
  '#0288D1', // Light Blue (info)
  '#7B1FA2', // Deep Purple
  '#C2185B', // Pink
  '#00796B', // Teal
  '#5D4037', // Brown
  '#455A64', // Blue Grey
  '#F57C00', // Orange
] as const;

/**
 * Get contrasting text color for any background
 */
export function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Validate hex color format
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * ColorPicker - Reusable color selection component
 */
export function ColorPicker({
  selectedColor,
  onColorSelect,
  presetColors = DEFAULT_PRESET_COLORS,
  columns = 6,
  showCustom = true,
  swatchSize = 32,
  presetLabel,
  customLabel,
}: ColorPickerProps) {
  const t = useTranslations();

  // Local state for custom color
  const [customColor, setCustomColor] = useState(selectedColor || '#1976D2');
  const [hexInput, setHexInput] = useState(selectedColor || '#1976D2');

  // Handle preset color click
  const handlePresetClick = useCallback(
    (color: string) => {
      onColorSelect(color);
      setCustomColor(color);
      setHexInput(color);
    },
    [onColorSelect]
  );

  // Handle custom color picker change
  const handleCustomColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const color = e.target.value;
      setCustomColor(color);
      setHexInput(color);
      if (isValidHexColor(color)) {
        onColorSelect(color);
      }
    },
    [onColorSelect]
  );

  // Handle hex input change
  const handleHexInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;
      if (!value.startsWith('#')) {
        value = '#' + value;
      }
      setHexInput(value);
      if (isValidHexColor(value)) {
        setCustomColor(value);
        onColorSelect(value);
      }
    },
    [onColorSelect]
  );

  // Check if a color is selected
  const isSelected = (color: string) =>
    selectedColor?.toLowerCase() === color.toLowerCase();

  // Check if custom color is active
  const isCustomActive =
    selectedColor &&
    !presetColors.some((c) => c.toLowerCase() === selectedColor.toLowerCase());

  return (
    <Box>
      {/* Preset Colors */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1 }}
      >
        {presetLabel || t.calendar?.colorPicker?.presetColors || 'Preset colors'}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 1,
          mb: showCustom ? 2 : 0,
        }}
      >
        {presetColors.map((color) => (
          <Box
            key={color}
            onClick={() => handlePresetClick(color)}
            sx={{
              width: swatchSize,
              height: swatchSize,
              bgcolor: color,
              borderRadius: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid',
              borderColor: isSelected(color)
                ? 'primary.main'
                : alpha('#fff', 0.1),
              transition: 'all 0.15s ease',
              '&:hover': {
                transform: 'scale(1.1)',
                boxShadow: 2,
                borderColor: isSelected(color)
                  ? 'primary.main'
                  : alpha('#fff', 0.3),
              },
            }}
          >
            {isSelected(color) && (
              <Check
                size={Math.round(swatchSize * 0.5)}
                color={getContrastColor(color)}
                strokeWidth={3}
              />
            )}
          </Box>
        ))}
      </Box>

      {/* Custom Color Section */}
      {showCustom && (
        <>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 1 }}
          >
            {customLabel || t.calendar?.colorPicker?.customColor || 'Custom color'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Native Color Picker */}
            <Box
              component="input"
              type="color"
              value={customColor}
              onChange={handleCustomColorChange}
              sx={{
                width: 40,
                height: 40,
                border: isCustomActive ? '2px solid' : '1px solid',
                borderColor: isCustomActive ? 'primary.main' : 'divider',
                borderRadius: 1,
                cursor: 'pointer',
                p: 0,
                '&::-webkit-color-swatch-wrapper': { padding: 2 },
                '&::-webkit-color-swatch': {
                  borderRadius: 4,
                  border: 'none',
                },
                '&::-moz-color-swatch': {
                  borderRadius: 4,
                  border: 'none',
                },
              }}
            />

            {/* Hex Input */}
            <TextField
              size="small"
              value={hexInput}
              onChange={handleHexInputChange}
              placeholder="#000000"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Palette size={16} />
                    </InputAdornment>
                  ),
                  sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
                },
              }}
              sx={{ flex: 1 }}
            />
          </Box>
        </>
      )}
    </Box>
  );
}

/**
 * ColorPickerPopover - Color picker in a Popover
 */
interface ColorPickerPopoverProps extends ColorPickerProps {
  /** Anchor element for popover */
  anchorEl: HTMLElement | null;
  /** Callback when popover closes */
  onClose: () => void;
  /** Popover title */
  title?: string;
  /** Show apply button (default: false - auto-applies) */
  showApplyButton?: boolean;
}

export function ColorPickerPopover({
  anchorEl,
  onClose,
  onColorSelect,
  title,
  showApplyButton = false,
  ...pickerProps
}: ColorPickerPopoverProps) {
  const t = useTranslations();
  const [tempColor, setTempColor] = useState(pickerProps.selectedColor);

  const handleSelect = (color: string) => {
    if (showApplyButton) {
      setTempColor(color);
    } else {
      onColorSelect(color);
      onClose();
    }
  };

  const handleApply = () => {
    onColorSelect(tempColor);
    onClose();
  };

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: { p: 2, width: 260, borderRadius: 2 },
        },
      }}
    >
      {title && (
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
          {title}
        </Typography>
      )}

      <ColorPicker
        {...pickerProps}
        selectedColor={showApplyButton ? tempColor : pickerProps.selectedColor}
        onColorSelect={handleSelect}
      />

      {showApplyButton && (
        <Button
          fullWidth
          variant="contained"
          size="small"
          onClick={handleApply}
          sx={{ mt: 2 }}
        >
          {t.calendar?.colorPicker?.apply || 'Applica'}
        </Button>
      )}
    </Popover>
  );
}

export default ColorPicker;
