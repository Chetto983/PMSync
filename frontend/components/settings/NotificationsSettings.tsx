import React from 'react';
import { Box, Typography, Switch, Button, Alert } from '@mui/material';
import { Mail, Calendar, Bell } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { SettingRow } from './SettingRow';

export interface NotificationsSettingsProps {
  newEmailNotif: boolean;
  setNewEmailNotif: (v: boolean) => void;
  calendarNotif: boolean;
  setCalendarNotif: (v: boolean) => void;
  aiActionsNotif: boolean;
  setAiActionsNotif: (v: boolean) => void;
  saveLoading: boolean;
  onSave: () => void;
  success: string;
  error: string;
  onClearSuccess: () => void;
  onClearError: () => void;
  copy: {
    title: string;
    description: string;
    emailTitle: string;
    newEmailsTitle: string;
    newEmailsDesc: string;
    calendarTitle: string;
    calendarDesc: string;
    aiActionsTitle: string;
    aiActionsDesc: string;
    save: string;
    saving: string;
  };
}

export function NotificationsSettings({
  newEmailNotif,
  setNewEmailNotif,
  calendarNotif,
  setCalendarNotif,
  aiActionsNotif,
  setAiActionsNotif,
  saveLoading,
  onSave,
  success,
  error,
  onClearSuccess,
  onClearError,
  copy,
}: NotificationsSettingsProps) {
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {copy.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {copy.description}
      </Typography>

      {(error || success) && (
        <Box sx={{ mb: 3 }}>
          {error && <Alert severity="error" onClose={onClearError}>{error}</Alert>}
          {success && <Alert severity="success" onClose={onClearSuccess}>{success}</Alert>}
        </Box>
      )}

      <SectionCard title={copy.emailTitle || copy.newEmailsTitle}>
        <SettingRow
          icon={<Mail size={18} />}
          title={copy.newEmailsTitle}
          description={copy.newEmailsDesc}
        >
          <Switch checked={newEmailNotif} onChange={(e) => setNewEmailNotif(e.target.checked)} />
        </SettingRow>
        <SettingRow
          icon={<Calendar size={18} />}
          title={copy.calendarTitle}
          description={copy.calendarDesc}
        >
          <Switch checked={calendarNotif} onChange={(e) => setCalendarNotif(e.target.checked)} />
        </SettingRow>
        <SettingRow
          icon={<Bell size={18} />}
          title={copy.aiActionsTitle}
          description={copy.aiActionsDesc}
          noBorder
        >
          <Switch checked={aiActionsNotif} onChange={(e) => setAiActionsNotif(e.target.checked)} />
        </SettingRow>
      </SectionCard>

      <Button variant="contained" onClick={onSave} disabled={saveLoading}>
        {saveLoading ? copy.saving : copy.save}
      </Button>
    </Box>
  );
}
