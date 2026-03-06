import React from 'react';
import {
  Box,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';

export interface LanguageMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  locale: string;
  onLanguageChange: (newLocale: string) => void;
}

export function LanguageMenu({
  anchorEl,
  onClose,
  locale,
  onLanguageChange,
}: LanguageMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      PaperProps={{
        sx: {
          mt: 1.5,
          minWidth: 160,
          borderRadius: 2,
          boxShadow: 3,
        },
      }}
    >
      <MenuItem
        onClick={() => onLanguageChange('en')}
        selected={locale === 'en'}
        sx={{ py: 1.25 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            component="span"
            role="img"
            aria-label="British flag"
            sx={{
              width: 24,
              height: 16,
              borderRadius: 0.5,
              display: 'inline-block',
              fontSize: '0.875rem',
            }}
          >
            {'\uD83C\uDDEC\uD83C\uDDE7'}
          </Box>
          <Typography variant="body2">English</Typography>
        </Box>
      </MenuItem>
      <MenuItem
        onClick={() => onLanguageChange('it')}
        selected={locale === 'it'}
        sx={{ py: 1.25 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            component="span"
            role="img"
            aria-label="Italian flag"
            sx={{
              width: 24,
              height: 16,
              borderRadius: 0.5,
              display: 'inline-block',
              fontSize: '0.875rem',
            }}
          >
            {'\uD83C\uDDEE\uD83C\uDDF9'}
          </Box>
          <Typography variant="body2">Italiano</Typography>
        </Box>
      </MenuItem>
    </Menu>
  );
}
