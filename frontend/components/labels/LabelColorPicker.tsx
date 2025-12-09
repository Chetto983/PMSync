import React from 'react';
import { Box, Typography } from '@mui/material';
import { Check } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface LabelColorPickerProps {
  selectedColor: string;
  colors: string[];
  onColorSelect: (color: string) => void;
}

/**
 * LabelColorPicker - Color picker for label selection
 *
 * Shows a grid of color options with selected state
 */
export const LabelColorPicker: React.FC<LabelColorPickerProps> = ({
  selectedColor,
  colors,
  onColorSelect,
}) => {
  const t = useTranslations();

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" gutterBottom>
        {t.email.labels.chooseColor}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(32px, 1fr))',
          gap: 1,
          mt: 1,
        }}
      >
        {colors.map((color) => (
          <Box
            key={color}
            onClick={() => onColorSelect(color)}
            sx={{
              width: 32,
              height: 32,
              bgcolor: color,
              borderRadius: '50%',
              cursor: 'pointer',
              border: '2px solid',
              borderColor: selectedColor === color ? 'grey.900' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              '&:hover': {
                transform: 'scale(1.1)',
                boxShadow: 2,
              },
            }}
          >
            {selectedColor === color && <Check size={16} color="#fff" />}
          </Box>
        ))}
      </Box>
    </Box>
  );
};
