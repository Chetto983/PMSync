import React from 'react';
import {
  Box,
  Typography,
  Switch,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
  Slider,
  Chip,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import { MessageSquare, FileText, Calendar, Trash2, RotateCcw, ExternalLink } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { SettingRow } from './SettingRow';
import type { JobRole, CommunicationStyle, ResponseLength, ProactivityLevel } from '@/lib/api/personalization';

export interface AiSettingsProps {
  loading: boolean;
  saveLoading: boolean;
  dataLoading: boolean;
  success: string;
  error: string;
  onClearSuccess: () => void;
  onClearError: () => void;
  // AI Features
  smartRepliesEnabled: boolean;
  setSmartRepliesEnabled: (v: boolean) => void;
  summarizationEnabled: boolean;
  setSummarizationEnabled: (v: boolean) => void;
  schedulingEnabled: boolean;
  setSchedulingEnabled: (v: boolean) => void;
  // Personalization
  jobRole: JobRole;
  setJobRole: (v: JobRole) => void;
  communicationStyle: CommunicationStyle;
  setCommunicationStyle: (v: CommunicationStyle) => void;
  responseLength: ResponseLength;
  setResponseLength: (v: ResponseLength) => void;
  proactivityLevel: ProactivityLevel;
  setProactivityLevel: (v: ProactivityLevel) => void;
  autoApproveThreshold: number;
  setAutoApproveThreshold: (v: number) => void;
  // Actions
  onSave: () => void;
  onClearMemory: () => void;
  onResetLearning: () => void;
  onOpenAssistant: () => void;
  // Copy
  copy: {
    title: string;
    description: string;
    featuresTitle: string;
    featuresDescription: string;
    smartRepliesTitle: string;
    smartRepliesDescription: string;
    summarizationTitle: string;
    summarizationDescription: string;
    schedulingTitle: string;
    schedulingDescription: string;
    personalizationTitle: string;
    personalizationDescription: string;
    roleLabel: string;
    communicationLabel: string;
    responseLengthLabel: string;
    proactivityLabel: string;
    autoApproveLabel: string;
    autoApproveHint: string;
    savePreferences: string;
    saving: string;
    openAssistant: string;
    dataManagementTitle: string;
    dataManagementDescription: string;
    clearMemory: string;
    resetLearning: string;
  };
}

export function AiSettings({
  loading,
  saveLoading,
  dataLoading,
  success,
  error,
  onClearSuccess,
  onClearError,
  smartRepliesEnabled,
  setSmartRepliesEnabled,
  summarizationEnabled,
  setSummarizationEnabled,
  schedulingEnabled,
  setSchedulingEnabled,
  jobRole,
  setJobRole,
  communicationStyle,
  setCommunicationStyle,
  responseLength,
  setResponseLength,
  proactivityLevel,
  setProactivityLevel,
  autoApproveThreshold,
  setAutoApproveThreshold,
  onSave,
  onClearMemory,
  onResetLearning,
  onOpenAssistant,
  copy,
}: AiSettingsProps) {
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {copy.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {copy.description || 'Customize how AI assists you with emails, calendar, and more.'}
      </Typography>

      {(error || success) && (
        <Box sx={{ mb: 3 }}>
          {error && <Alert severity="error" onClose={onClearError}>{error}</Alert>}
          {success && <Alert severity="success" onClose={onClearSuccess}>{success}</Alert>}
        </Box>
      )}

      {loading ? (
        <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <SectionCard
            title={copy.featuresTitle || 'AI Features'}
            description={copy.featuresDescription || 'Enable or disable AI capabilities'}
          >
            <SettingRow
              icon={<MessageSquare size={18} />}
              title={copy.smartRepliesTitle || 'Smart Replies'}
              description={copy.smartRepliesDescription || 'AI-generated response suggestions'}
            >
              <Switch checked={smartRepliesEnabled} onChange={(e) => setSmartRepliesEnabled(e.target.checked)} />
            </SettingRow>
            <SettingRow
              icon={<FileText size={18} />}
              title={copy.summarizationTitle || 'Email Summarization'}
              description={copy.summarizationDescription || 'Automatic summaries for long emails'}
            >
              <Switch checked={summarizationEnabled} onChange={(e) => setSummarizationEnabled(e.target.checked)} />
            </SettingRow>
            <SettingRow
              icon={<Calendar size={18} />}
              title={copy.schedulingTitle || 'Smart Scheduling'}
              description={copy.schedulingDescription || 'AI-assisted meeting scheduling'}
              noBorder
            >
              <Switch checked={schedulingEnabled} onChange={(e) => setSchedulingEnabled(e.target.checked)} />
            </SettingRow>
          </SectionCard>

          <SectionCard
            title={copy.personalizationTitle || 'Personalization'}
            description={copy.personalizationDescription || 'Customize AI behavior to match your work style'}
          >
            <Stack spacing={3}>
              <FormControl fullWidth size="small">
                <InputLabel>{copy.roleLabel || 'Your Role'}</InputLabel>
                <Select value={jobRole} onChange={(e) => setJobRole(e.target.value as JobRole)} label={copy.roleLabel || 'Your Role'}>
                  <MenuItem value="EXECUTIVE">Executive</MenuItem>
                  <MenuItem value="MANAGER">Manager</MenuItem>
                  <MenuItem value="IC">Individual Contributor</MenuItem>
                  <MenuItem value="FREELANCER">Freelancer</MenuItem>
                  <MenuItem value="STUDENT">Student</MenuItem>
                  <MenuItem value="SUPPORT">Support</MenuItem>
                  <MenuItem value="SALES">Sales</MenuItem>
                  <MenuItem value="TECHNICAL">Technical</MenuItem>
                </Select>
              </FormControl>

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  {copy.communicationLabel || 'Communication Style'}
                </Typography>
                <ToggleButtonGroup
                  value={communicationStyle}
                  exclusive
                  onChange={(_, v) => v && setCommunicationStyle(v)}
                  fullWidth
                  size="small"
                >
                  <ToggleButton value="FORMAL">Formal</ToggleButton>
                  <ToggleButton value="CASUAL">Casual</ToggleButton>
                  <ToggleButton value="TECHNICAL">Technical</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  {copy.responseLengthLabel || 'Response Length'}
                </Typography>
                <ToggleButtonGroup
                  value={responseLength}
                  exclusive
                  onChange={(_, v) => v && setResponseLength(v)}
                  fullWidth
                  size="small"
                >
                  <ToggleButton value="CONCISE">Concise</ToggleButton>
                  <ToggleButton value="MODERATE">Moderate</ToggleButton>
                  <ToggleButton value="DETAILED">Detailed</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  {copy.proactivityLabel || 'Proactivity'}
                </Typography>
                <ToggleButtonGroup
                  value={proactivityLevel}
                  exclusive
                  onChange={(_, v) => v && setProactivityLevel(v)}
                  fullWidth
                  size="small"
                >
                  <ToggleButton value="LOW">Low</ToggleButton>
                  <ToggleButton value="MEDIUM">Medium</ToggleButton>
                  <ToggleButton value="HIGH">High</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {copy.autoApproveLabel}
                  </Typography>
                  <Chip label={`${autoApproveThreshold}%`} size="small" />
                </Box>
                <Slider
                  value={autoApproveThreshold}
                  onChange={(_, v) => setAutoApproveThreshold(v as number)}
                  min={50}
                  max={100}
                  step={5}
                />
                <Typography variant="caption" color="text.secondary">
                  {copy.autoApproveHint}
                </Typography>
              </Box>
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button variant="contained" onClick={onSave} disabled={saveLoading}>
                {saveLoading ? copy.saving : copy.savePreferences}
              </Button>
              <Button variant="text" endIcon={<ExternalLink size={14} />} onClick={onOpenAssistant}>
                {copy.openAssistant}
              </Button>
            </Box>
          </SectionCard>

          <SectionCard
            title={copy.dataManagementTitle}
            description={copy.dataManagementDescription}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<Trash2 size={16} />}
                onClick={onClearMemory}
                disabled={dataLoading}
              >
                {copy.clearMemory}
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<RotateCcw size={16} />}
                onClick={onResetLearning}
                disabled={dataLoading}
              >
                {copy.resetLearning}
              </Button>
            </Stack>
          </SectionCard>
        </>
      )}
    </Box>
  );
}
