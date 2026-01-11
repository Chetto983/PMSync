import React from 'react';
import {
  Box,
  Typography,
  Switch,
  Button,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
  Slider,
  Chip,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import { MessageSquare, FileText, Calendar, Trash2, ExternalLink } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { SettingRow } from './SettingRow';
import type { CommunicationStyle, ResponseLength, ProactivityLevel } from '@/lib/api/ai';

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
  jobRole: string;
  setJobRole: (v: string) => void;
  communicationStyle: CommunicationStyle;
  setCommunicationStyle: (v: CommunicationStyle) => void;
  responseLength: ResponseLength;
  setResponseLength: (v: ResponseLength) => void;
  proactivityLevel: ProactivityLevel;
  setProactivityLevel: (v: ProactivityLevel) => void;
  autoApproveThreshold: number;
  setAutoApproveThreshold: (v: number) => void;
  // Working Hours
  workingHoursStart: string;
  setWorkingHoursStart: (v: string) => void;
  workingHoursEnd: string;
  setWorkingHoursEnd: (v: string) => void;
  workingDays: string[];
  setWorkingDays: (v: string[]) => void;
  // Job Details
  jobTitle: string;
  setJobTitle: (v: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  companySize: string;
  setCompanySize: (v: string) => void;
  // Notification & Display
  notificationFrequency: string;
  setNotificationFrequency: (v: string) => void;
  // Actions
  onSave: () => void;
  onClearMemory: () => void;
  // NOTE: onResetLearning removed - backend has no endpoint (learning is in-memory only)
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
    // NOTE: resetLearning removed - backend has no endpoint
    // Working hours labels
    workingHoursLabel?: string;
    workingHoursDescription?: string;
    startTimeLabel?: string;
    endTimeLabel?: string;
    workingDaysLabel?: string;
    // Day abbreviations
    days?: { MON: string; TUE: string; WED: string; THU: string; FRI: string; SAT: string; SUN: string };
    // Toggle button labels (must match backend enums)
    styles?: { FORMAL: string; CASUAL: string; TECHNICAL: string; CREATIVE: string };
    lengths?: { BRIEF: string; MODERATE: string; DETAILED: string };
    proactivityLevels?: { LOW: string; MEDIUM: string; HIGH: string };
    // Job Details
    jobDetailsTitle?: string;
    jobDetailsDescription?: string;
    jobTitleLabel?: string;
    jobTitlePlaceholder?: string;
    departmentLabel?: string;
    departmentPlaceholder?: string;
    industryLabel?: string;
    industryPlaceholder?: string;
    companySizeLabel?: string;
    companySizes?: { SOLO: string; STARTUP: string; SMB: string; ENTERPRISE: string };
    // Notification Frequency
    notificationFrequencyLabel?: string;
    notificationFrequencyDescription?: string;
    notificationFrequencies?: { IMMEDIATE: string; DIGEST: string; MINIMAL: string };
  };
}

const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

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
  workingHoursStart,
  setWorkingHoursStart,
  workingHoursEnd,
  setWorkingHoursEnd,
  workingDays,
  setWorkingDays,
  jobTitle,
  setJobTitle,
  department,
  setDepartment,
  industry,
  setIndustry,
  companySize,
  setCompanySize,
  notificationFrequency,
  setNotificationFrequency,
  onSave,
  onClearMemory,
  // NOTE: onResetLearning removed - backend has no endpoint
  onOpenAssistant,
  copy,
}: AiSettingsProps) {
  const handleDayToggle = (day: string) => {
    if (workingDays.includes(day)) {
      setWorkingDays(workingDays.filter((d) => d !== day));
    } else {
      setWorkingDays([...workingDays, day]);
    }
  };
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
              <TextField
                fullWidth
                size="small"
                label={copy.roleLabel || 'Your Role'}
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                placeholder="e.g., Developer, Manager, Designer..."
              />

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
                  <ToggleButton value="FORMAL">{copy.styles?.FORMAL || 'Formal'}</ToggleButton>
                  <ToggleButton value="CASUAL">{copy.styles?.CASUAL || 'Casual'}</ToggleButton>
                  <ToggleButton value="TECHNICAL">{copy.styles?.TECHNICAL || 'Technical'}</ToggleButton>
                  <ToggleButton value="CREATIVE">{copy.styles?.CREATIVE || 'Creative'}</ToggleButton>
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
                  <ToggleButton value="BRIEF">{copy.lengths?.BRIEF || 'Brief'}</ToggleButton>
                  <ToggleButton value="MODERATE">{copy.lengths?.MODERATE || 'Moderate'}</ToggleButton>
                  <ToggleButton value="DETAILED">{copy.lengths?.DETAILED || 'Detailed'}</ToggleButton>
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
                  <ToggleButton value="LOW">{copy.proactivityLevels?.LOW || 'Low'}</ToggleButton>
                  <ToggleButton value="MEDIUM">{copy.proactivityLevels?.MEDIUM || 'Medium'}</ToggleButton>
                  <ToggleButton value="HIGH">{copy.proactivityLevels?.HIGH || 'High'}</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Divider />

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                  {copy.workingHoursLabel || 'Working Hours'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  {copy.workingHoursDescription || 'AI will adjust behavior based on your schedule'}
                </Typography>

                <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                  <TextField
                    size="small"
                    type="time"
                    label={copy.startTimeLabel || 'Start'}
                    value={workingHoursStart}
                    onChange={(e) => setWorkingHoursStart(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    type="time"
                    label={copy.endTimeLabel || 'End'}
                    value={workingHoursEnd}
                    onChange={(e) => setWorkingHoursEnd(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                </Stack>

                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  {copy.workingDaysLabel || 'Working Days'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {ALL_DAYS.map((day) => (
                    <Chip
                      key={day}
                      label={copy.days?.[day] || day}
                      size="small"
                      variant={workingDays.includes(day) ? 'filled' : 'outlined'}
                      color={workingDays.includes(day) ? 'primary' : 'default'}
                      onClick={() => handleDayToggle(day)}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </Box>

              <Divider />

              {/* Work Context Section */}
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                  {copy.jobDetailsTitle || 'Work Context'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  {copy.jobDetailsDescription || 'Help AI understand your professional context'}
                </Typography>

                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    size="small"
                    label={copy.jobTitleLabel || 'Job Title'}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder={copy.jobTitlePlaceholder || 'e.g., Software Engineer, Product Manager'}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label={copy.departmentLabel || 'Department'}
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder={copy.departmentPlaceholder || 'e.g., Engineering, Marketing'}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label={copy.industryLabel || 'Industry'}
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder={copy.industryPlaceholder || 'e.g., Technology, Healthcare'}
                    />
                  </Stack>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                      {copy.companySizeLabel || 'Company Size'}
                    </Typography>
                    <ToggleButtonGroup
                      value={companySize}
                      exclusive
                      onChange={(_, v) => v && setCompanySize(v)}
                      fullWidth
                      size="small"
                    >
                      <ToggleButton value="SOLO">{copy.companySizes?.SOLO || 'Solo'}</ToggleButton>
                      <ToggleButton value="STARTUP">{copy.companySizes?.STARTUP || 'Startup'}</ToggleButton>
                      <ToggleButton value="SMB">{copy.companySizes?.SMB || 'SMB'}</ToggleButton>
                      <ToggleButton value="ENTERPRISE">{copy.companySizes?.ENTERPRISE || 'Enterprise'}</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </Stack>
              </Box>

              <Divider />

              {/* Notification & Display Section */}
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  {copy.notificationFrequencyLabel || 'AI Notification Frequency'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {copy.notificationFrequencyDescription || 'How often should AI notify you about insights?'}
                </Typography>
                <ToggleButtonGroup
                  value={notificationFrequency}
                  exclusive
                  onChange={(_, v) => v && setNotificationFrequency(v)}
                  fullWidth
                  size="small"
                >
                  <ToggleButton value="IMMEDIATE">{copy.notificationFrequencies?.IMMEDIATE || 'Immediate'}</ToggleButton>
                  <ToggleButton value="DIGEST">{copy.notificationFrequencies?.DIGEST || 'Daily Digest'}</ToggleButton>
                  <ToggleButton value="MINIMAL">{copy.notificationFrequencies?.MINIMAL || 'Minimal'}</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Divider />

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
{/* NOTE: Reset Learning button removed - backend has no endpoint (learning is in-memory only) */}
            </Stack>
          </SectionCard>
        </>
      )}
    </Box>
  );
}
