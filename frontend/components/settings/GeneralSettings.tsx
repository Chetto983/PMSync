import React from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
  Alert,
} from '@mui/material';
import { Moon, Sun, Monitor } from 'lucide-react';
import { SectionCard } from './SectionCard';
import type { ThemeMode } from '@/hooks/use-theme-persistence';

export interface GeneralSettingsProps {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => Promise<void>;
  language: string;
  setLanguage: (lang: string) => void;
  timezone: string;
  setTimezone: (tz: string) => void;
  saveLoading: boolean;
  onSave: () => void;
  success: string;
  error: string;
  onClearSuccess: () => void;
  onClearError: () => void;
  copy: {
    title: string;
    description: string;
    appearanceTitle: string;
    themeLabel: string;
    themeOptions: { light: string; dark: string; system: string };
    languageTitle: string;
    languageLabel: string;
    timezoneLabel: string;
    saveSuccess: string;
    saveError: string;
    saving: string;
    save: string;
  };
}

export function GeneralSettings({
  theme,
  setTheme,
  language,
  setLanguage,
  timezone,
  setTimezone,
  saveLoading,
  onSave,
  success,
  error,
  onClearSuccess,
  onClearError,
  copy,
}: GeneralSettingsProps) {
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {copy.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {copy.description}
      </Typography>

      {(success || error) && (
        <Box sx={{ mb: 2 }}>
          {success && <Alert severity="success" onClose={onClearSuccess}>{success}</Alert>}
          {error && <Alert severity="error" onClose={onClearError}>{error}</Alert>}
        </Box>
      )}

      <SectionCard title={copy.appearanceTitle || 'Appearance'}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 1.5 }}>
            {copy.themeLabel || 'Theme'}
          </Typography>
          <ToggleButtonGroup
            value={theme}
            exclusive
            onChange={(_, v) => v && setTheme(v)}
            size="small"
          >
            <ToggleButton value="light" sx={{ px: 3 }}>
              <Sun size={16} style={{ marginRight: 8 }} /> {copy.themeOptions?.light || 'Light'}
            </ToggleButton>
            <ToggleButton value="dark" sx={{ px: 3 }}>
              <Moon size={16} style={{ marginRight: 8 }} /> {copy.themeOptions?.dark || 'Dark'}
            </ToggleButton>
            <ToggleButton value="system" sx={{ px: 3 }}>
              <Monitor size={16} style={{ marginRight: 8 }} /> {copy.themeOptions?.system || 'System'}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </SectionCard>

      <SectionCard title={copy.languageTitle || 'Language & Region'}>
        <Stack spacing={2}>
          <FormControl fullWidth size="small">
            <InputLabel>{copy.languageLabel || 'Language'}</InputLabel>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)} label={copy.languageLabel || 'Language'}>
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="it">Italiano</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>{copy.timezoneLabel || 'Timezone'}</InputLabel>
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} label={copy.timezoneLabel || 'Timezone'}>
              <MenuItem value="GMT-08:00">(GMT-08:00) Pacific Time</MenuItem>
              <MenuItem value="GMT-05:00">(GMT-05:00) Eastern Time</MenuItem>
              <MenuItem value="GMT+00:00">(GMT+00:00) London</MenuItem>
              <MenuItem value="GMT+01:00">(GMT+01:00) Rome</MenuItem>
              <MenuItem value="GMT+09:00">(GMT+09:00) Tokyo</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </SectionCard>

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button variant="contained" onClick={onSave} disabled={saveLoading}>
          {saveLoading ? copy.saving : copy.save}
        </Button>
      </Box>
    </Box>
  );
}
