'use client';

import { useState } from 'react';
import {
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useThemePersistence, type ThemeMode } from '@/hooks/use-theme-persistence';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * ThemeToggle - Three-way theme selector (light/dark/system)
 *
 * Uses useThemePersistence hook which syncs theme preference to:
 * - Database (when authenticated)
 * - localStorage (offline fallback)
 * - next-themes (UI rendering)
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useThemePersistence();
  const t = useTranslations();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleThemeSelect = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    handleClose();
  };

  // Show current resolved theme icon (Sun for light, Moon for dark)
  const currentIcon = resolvedTheme === 'dark' ? <Moon size={20} /> : <Sun size={20} />;

  // Theme options with icons and labels from settings translations
  const themeOptions: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
    {
      value: 'light',
      label: t.settings?.generalPanel?.themeOptions?.light || 'Light',
      icon: Sun,
    },
    {
      value: 'dark',
      label: t.settings?.generalPanel?.themeOptions?.dark || 'Dark',
      icon: Moon,
    },
    {
      value: 'system',
      label: t.settings?.generalPanel?.themeOptions?.system || 'System',
      icon: Monitor,
    },
  ];

  return (
    <>
      <Tooltip title={t.common?.toggleTheme || 'Toggle theme'}>
        <IconButton
          onClick={handleClick}
          color="inherit"
          size="small"
          aria-label={t.common?.toggleTheme || 'Toggle theme'}
          aria-controls={open ? 'theme-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          {currentIcon}
        </IconButton>
      </Tooltip>
      <Menu
        id="theme-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 160,
              borderRadius: 2,
              boxShadow: 3,
            },
          },
        }}
      >
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = theme === option.value;
          return (
            <MenuItem
              key={option.value}
              onClick={() => handleThemeSelect(option.value)}
              selected={isSelected}
              sx={{ py: 1.25 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Icon size={18} />
              </ListItemIcon>
              <ListItemText>{option.label}</ListItemText>
              {isSelected && <Check size={16} style={{ marginLeft: 8 }} />}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

export default ThemeToggle;
