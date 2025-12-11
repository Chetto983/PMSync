import React, { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Checkbox,
  FormControlLabel,
  Alert,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
} from '@mui/material';
import { Mail, CheckCircle, XCircle, Wifi } from 'lucide-react';
import { providersApi, ConnectGenericDto, TestCredentialsResult } from '@/lib/api/providers';
import { useTranslations } from '@/lib/hooks/use-translations';

// Provider presets with common IMAP/SMTP settings
const PROVIDER_PRESETS = {
  yahoo: {
    name: 'Yahoo Mail',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapUseTls: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpUseTls: true,
  },
  icloud: {
    name: 'iCloud Mail',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapUseTls: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpUseTls: true,
  },
  fastmail: {
    name: 'Fastmail',
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    imapUseTls: true,
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 465,
    smtpUseTls: true,
  },
  aol: {
    name: 'AOL Mail',
    imapHost: 'imap.aol.com',
    imapPort: 993,
    imapUseTls: true,
    smtpHost: 'smtp.aol.com',
    smtpPort: 465,
    smtpUseTls: true,
  },
  zoho: {
    name: 'Zoho Mail',
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    imapUseTls: true,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpUseTls: true,
  },
  gmx: {
    name: 'GMX',
    imapHost: 'imap.gmx.com',
    imapPort: 993,
    imapUseTls: true,
    smtpHost: 'mail.gmx.com',
    smtpPort: 587,
    smtpUseTls: true,
  },
  aruba: {
    name: 'Aruba PEC',
    imapHost: 'imaps.pec.aruba.it',
    imapPort: 993,
    imapUseTls: true,
    smtpHost: 'smtps.pec.aruba.it',
    smtpPort: 465,
    smtpUseTls: true,
  },
} as const;

interface GenericProviderCardProps {
  onSuccess: () => void;
}

export function GenericProviderCard({ onSuccess }: GenericProviderCardProps) {
  const t = useTranslations();
  const genericCopy = t.providers.genericCard;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCalDAV, setShowCalDAV] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestCredentialsResult | null>(null);

  const [formData, setFormData] = useState<ConnectGenericDto>({
    email: '',
    displayName: '',
    imapHost: '',
    imapPort: 993,
    imapUsername: '',
    imapPassword: '',
    imapUseTls: true,
    smtpHost: '',
    smtpPort: 587,
    smtpUsername: '',
    smtpPassword: '',
    smtpUseTls: true,
    caldavUrl: '',
    caldavUsername: '',
    caldavPassword: '',
    supportsCalendar: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const submitData = {
        ...formData,
        smtpUsername: formData.smtpUsername || formData.imapUsername,
        smtpPassword: formData.smtpPassword || formData.imapPassword,
        supportsCalendar: showCalDAV && !!formData.caldavUrl,
      };

      await providersApi.connectGeneric(submitData);
      setOpen(false);
      onSuccess();
      // Reset form
      setFormData({
        email: '',
        displayName: '',
        imapHost: '',
        imapPort: 993,
        imapUsername: '',
        imapPassword: '',
        imapUseTls: true,
        smtpHost: '',
        smtpPort: 587,
        smtpUsername: '',
        smtpPassword: '',
        smtpUseTls: true,
        caldavUrl: '',
        caldavUsername: '',
        caldavPassword: '',
        supportsCalendar: false,
      });
      setShowCalDAV(false);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Failed to connect provider');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof ConnectGenericDto, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePresetChange = (presetKey: string) => {
    setSelectedPreset(presetKey);
    setTestResult(null);

    if (presetKey && presetKey !== 'custom') {
      const preset = PROVIDER_PRESETS[presetKey as keyof typeof PROVIDER_PRESETS];
      if (preset) {
        setFormData((prev) => ({
          ...prev,
          imapHost: preset.imapHost,
          imapPort: preset.imapPort,
          imapUseTls: preset.imapUseTls,
          smtpHost: preset.smtpHost,
          smtpPort: preset.smtpPort,
          smtpUseTls: preset.smtpUseTls,
        }));
      }
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');

    try {
      const result = await providersApi.testGenericCredentials({
        imapHost: formData.imapHost,
        imapPort: formData.imapPort,
        imapUsername: formData.imapUsername,
        imapPassword: formData.imapPassword,
        imapUseTls: formData.imapUseTls,
        smtpHost: formData.smtpHost || undefined,
        smtpPort: formData.smtpPort,
        smtpUsername: formData.smtpUsername || undefined,
        smtpPassword: formData.smtpPassword || undefined,
        smtpUseTls: formData.smtpUseTls,
      });
      setTestResult(result);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || genericCopy.testFailed);
    } finally {
      setTesting(false);
    }
  };

  const canTest = formData.imapHost && formData.imapUsername && formData.imapPassword;

  return (
    <>
      <Card
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          border: 1,
          borderColor: 'divider',
        }}
      >
        <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Mail size={24} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {genericCopy.title}
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {genericCopy.description}
          </Typography>

          <Stack spacing={1.5} sx={{ flex: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {genericCopy.subtitle}
            </Typography>

            <Box
              component="ul"
              sx={{
                pl: 3,
                m: 0,
                listStyle: 'disc',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                color: 'text.secondary',
                fontSize: '0.875rem',
              }}
            >
              <li>{genericCopy.feature1}</li>
              <li>{genericCopy.feature2}</li>
              <li>{genericCopy.feature3}</li>
            </Box>
          </Stack>

          <Button
            variant="outlined"
            fullWidth
            onClick={() => setOpen(true)}
            sx={{ mt: 2 }}
          >
            {genericCopy.configureButton}
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}
      >
        <form onSubmit={handleSubmit}>
          <DialogTitle>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {genericCopy.dialogTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {genericCopy.dialogSubtitle}
            </Typography>
          </DialogTitle>

          <DialogContent dividers sx={{ pt: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* Test Connection Results */}
            {testResult && (
              <Alert
                severity={testResult.imap.success && (testResult.smtp.skipped || testResult.smtp.success) ? 'success' : 'warning'}
                sx={{ mb: 3 }}
                onClose={() => setTestResult(null)}
              >
                <Stack spacing={0.5}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {testResult.imap.success ? (
                      <CheckCircle size={16} color="green" />
                    ) : (
                      <XCircle size={16} color="red" />
                    )}
                    <Typography variant="body2">
                      {testResult.imap.success ? genericCopy.imapSuccess : `${genericCopy.imapFailed}: ${testResult.imap.message}`}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {testResult.smtp.skipped ? (
                      <Wifi size={16} color="gray" />
                    ) : testResult.smtp.success ? (
                      <CheckCircle size={16} color="green" />
                    ) : (
                      <XCircle size={16} color="red" />
                    )}
                    <Typography variant="body2">
                      {testResult.smtp.skipped
                        ? genericCopy.smtpSkipped
                        : testResult.smtp.success
                          ? genericCopy.smtpSuccess
                          : `${genericCopy.smtpFailed}: ${testResult.smtp.message}`}
                    </Typography>
                  </Box>
                </Stack>
              </Alert>
            )}

            {/* Provider Presets */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              {genericCopy.presets}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {genericCopy.presetsDescription}
            </Typography>
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>{genericCopy.selectProvider}</InputLabel>
              <Select
                value={selectedPreset}
                label={genericCopy.selectProvider}
                onChange={(e) => handlePresetChange(e.target.value)}
              >
                <MenuItem value="">{genericCopy.selectProvider}</MenuItem>
                <MenuItem value="custom">{genericCopy.customProvider}</MenuItem>
                {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                  <MenuItem key={key} value={key}>
                    {preset.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Divider sx={{ my: 3 }} />

            {/* Basic Info */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
              {genericCopy.basicInfo}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <TextField
                fullWidth
                label={genericCopy.emailAddress}
                type="email"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                required
              />
              <TextField
                fullWidth
                label={genericCopy.displayName}
                value={formData.displayName}
                onChange={(e) => updateField('displayName', e.target.value)}
              />
            </Stack>

            <Divider sx={{ my: 3 }} />

            {/* IMAP Settings */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
              {genericCopy.imapSettings}
            </Typography>
            <Stack spacing={2} sx={{ mb: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label={genericCopy.imapHost}
                  placeholder={genericCopy.imapHostPlaceholder}
                  value={formData.imapHost}
                  onChange={(e) => updateField('imapHost', e.target.value)}
                  required
                  sx={{ flex: 2 }}
                />
                <TextField
                  fullWidth
                  label={genericCopy.port}
                  type="number"
                  value={formData.imapPort}
                  onChange={(e) => updateField('imapPort', parseInt(e.target.value))}
                  required
                  sx={{ flex: 1 }}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label={genericCopy.username}
                  value={formData.imapUsername}
                  onChange={(e) => updateField('imapUsername', e.target.value)}
                  required
                />
                <TextField
                  fullWidth
                  label={genericCopy.password}
                  type="password"
                  value={formData.imapPassword}
                  onChange={(e) => updateField('imapPassword', e.target.value)}
                  required
                />
              </Stack>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.imapUseTls}
                    onChange={(e) => updateField('imapUseTls', e.target.checked)}
                  />
                }
                label={genericCopy.useTls}
              />
            </Stack>

            <Divider sx={{ my: 3 }} />

            {/* SMTP Settings */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              {genericCopy.smtpSettings}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {genericCopy.smtpSubtitle}
            </Typography>
            <Stack spacing={2} sx={{ mb: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label={genericCopy.smtpHost}
                  placeholder={genericCopy.smtpHostPlaceholder}
                  value={formData.smtpHost}
                  onChange={(e) => updateField('smtpHost', e.target.value)}
                  sx={{ flex: 2 }}
                />
                <TextField
                  fullWidth
                  label={genericCopy.port}
                  type="number"
                  value={formData.smtpPort}
                  onChange={(e) => updateField('smtpPort', parseInt(e.target.value))}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.smtpUseTls}
                    onChange={(e) => updateField('smtpUseTls', e.target.checked)}
                  />
                }
                label={genericCopy.useTls}
              />
            </Stack>

            <Divider sx={{ my: 3 }} />

            {/* CalDAV Settings */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {genericCopy.caldavSettings}
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showCalDAV}
                    onChange={(e) => setShowCalDAV(e.target.checked)}
                  />
                }
                label={genericCopy.enableCalendar}
              />
            </Box>

            {showCalDAV && (
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  label={genericCopy.caldavUrl}
                  placeholder={genericCopy.caldavUrlPlaceholder}
                  value={formData.caldavUrl}
                  onChange={(e) => updateField('caldavUrl', e.target.value)}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    label={genericCopy.username}
                    value={formData.caldavUsername}
                    onChange={(e) => updateField('caldavUsername', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    label={genericCopy.password}
                    type="password"
                    value={formData.caldavPassword}
                    onChange={(e) => updateField('caldavPassword', e.target.value)}
                  />
                </Stack>
              </Stack>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
            <Button
              onClick={handleTestConnection}
              disabled={testing || !canTest}
              startIcon={testing ? <CircularProgress size={16} /> : <Wifi size={16} />}
              variant="outlined"
            >
              {testing ? genericCopy.testing : genericCopy.testConnection}
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={() => setOpen(false)} disabled={loading}>
                {genericCopy.cancel}
              </Button>
              <Button type="submit" variant="contained" disabled={loading}>
                {loading ? genericCopy.connecting : genericCopy.connectProvider}
              </Button>
            </Box>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
