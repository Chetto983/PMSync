import React, { useMemo } from 'react';
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
  Autocomplete,
  TextField,
} from '@mui/material';
import { Moon, Sun, Monitor } from 'lucide-react';
import { SectionCard } from './SectionCard';
import type { ThemeMode } from '@/hooks/use-theme-persistence';
import { useTimezoneSelect, allTimezones } from 'react-timezone-select';

export interface GeneralSettingsProps {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => Promise<void>;
  language: string;
  setLanguage: (lang: string) => void;
  timezone: string;
  setTimezone: (tz: string) => void;
  emailDensity: string;
  setEmailDensity: (density: string) => void;
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
    emailDensityLabel?: string;
    emailDensityDescription?: string;
    emailDensities?: { comfortable: string; compact: string; spacious: string };
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
  emailDensity,
  setEmailDensity,
  saveLoading,
  onSave,
  success,
  error,
  onClearSuccess,
  onClearError,
  copy,
}: GeneralSettingsProps) {
  // Get all timezones with proper formatting
  const { options } = useTimezoneSelect({
    labelStyle: 'original',
    timezones: allTimezones,
  });

  // Find the current timezone option
  const selectedTimezone = useMemo(() => {
    return options.find((opt) => opt.value === timezone) || null;
  }, [options, timezone]);

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
            fullWidth
          >
            <ToggleButton value="light" sx={{ px: { xs: 1.5, sm: 3 } }}>
              <Sun size={16} style={{ marginRight: 6 }} /> {copy.themeOptions?.light || 'Light'}
            </ToggleButton>
            <ToggleButton value="dark" sx={{ px: { xs: 1.5, sm: 3 } }}>
              <Moon size={16} style={{ marginRight: 6 }} /> {copy.themeOptions?.dark || 'Dark'}
            </ToggleButton>
            <ToggleButton value="system" sx={{ px: { xs: 1.5, sm: 3 } }}>
              <Monitor size={16} style={{ marginRight: 6 }} /> {copy.themeOptions?.system || 'System'}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Email List Density */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
            {copy.emailDensityLabel || 'Email List Density'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {copy.emailDensityDescription || 'Adjust spacing in email lists'}
          </Typography>
          <ToggleButtonGroup
            value={emailDensity}
            exclusive
            onChange={(_, v) => v && setEmailDensity(v)}
            size="small"
            fullWidth
          >
            <ToggleButton value="comfortable">
              {copy.emailDensities?.comfortable || 'Comfortable'}
            </ToggleButton>
            <ToggleButton value="compact">
              {copy.emailDensities?.compact || 'Compact'}
            </ToggleButton>
            <ToggleButton value="spacious">
              {copy.emailDensities?.spacious || 'Spacious'}
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
          <Autocomplete
            size="small"
            options={options}
            value={selectedTimezone}
            onChange={(_, newValue) => {
              if (newValue) {
                setTimezone(newValue.value);
              }
            }}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) => option.value === value.value}
            renderInput={(params) => (
              <TextField {...params} label={copy.timezoneLabel || 'Timezone'} />
            )}
            ListboxProps={{ style: { maxHeight: 300 } }}
          />
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
