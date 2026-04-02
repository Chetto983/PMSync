import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { labelsApi, type TriageOnboardingContractResponse, type TriageOnboardingPreviewResponse } from '@/lib/api/labels';
import { labelKeys } from '@/hooks/queries/use-labels';
import { useTranslations } from '@/lib/hooks/use-translations';

interface TriageSetupFormProps {
  onApplied?: () => void;
  onSkip?: () => void;
  submitLabel?: string;
  compact?: boolean;
}

export function TriageSetupForm({
  onApplied,
  onSkip,
  submitLabel,
  compact = false,
}: TriageSetupFormProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const copy = t.triageSetup;

  const [contract, setContract] = useState<TriageOnboardingContractResponse | null>(null);
  const [preview, setPreview] = useState<TriageOnboardingPreviewResponse | null>(null);
  const [loadingContract, setLoadingContract] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  const [customerDomains, setCustomerDomains] = useState('');
  const [importantSenders, setImportantSenders] = useState('');
  const [projectTopics, setProjectTopics] = useState('');
  const [systemAlertSources, setSystemAlertSources] = useState('');
  const [billingTopics, setBillingTopics] = useState('');
  const [reviewLaterTopics, setReviewLaterTopics] = useState('');
  const [followUpSlaHours, setFollowUpSlaHours] = useState('24');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoadingContract(true);
      try {
        const next = await labelsApi.getTriageOnboardingContract();
        if (mounted) {
          setContract(next);
        }
      } catch (err) {
        if (mounted) {
          setError((err as Error).message || copy.genericError);
        }
      } finally {
        if (mounted) {
          setLoadingContract(false);
        }
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [copy.genericError]);

  const input = useMemo(
    () => ({
      customerDomains: parseList(customerDomains),
      importantSenders: parseList(importantSenders),
      projectTopics: parseList(projectTopics),
      systemAlertSources: parseList(systemAlertSources),
      billingTopics: parseList(billingTopics),
      reviewLaterTopics: parseList(reviewLaterTopics),
      followUpSlaHours: parsePositiveInt(followUpSlaHours),
    }),
    [
      customerDomains,
      importantSenders,
      projectTopics,
      systemAlertSources,
      billingTopics,
      reviewLaterTopics,
      followUpSlaHours,
    ],
  );

  const handlePreview = async () => {
    setPreviewing(true);
    setError('');
    try {
      const next = await labelsApi.previewTriageOnboarding(input);
      setPreview(next);
    } catch (err) {
      setError((err as Error).message || copy.genericError);
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setError('');
    try {
      await labelsApi.applyTriageOnboarding(input);
      queryClient.invalidateQueries({ queryKey: labelKeys.all });
      onApplied?.();
    } catch (err) {
      setError((err as Error).message || copy.genericError);
    } finally {
      setApplying(false);
    }
  };

  if (loadingContract) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: compact ? 2 : 4 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">{copy.loading}</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant={compact ? 'h6' : 'h5'} sx={{ fontWeight: 700, mb: 0.5 }}>
          {copy.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {copy.description}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {!error && preview && (
        <Alert severity="success">
          {copy.applyReady}
        </Alert>
      )}

      <Stack spacing={2}>
        <TextField
          label={copy.customerDomains}
          placeholder={copy.customerPlaceholder}
          value={customerDomains}
          onChange={(event) => setCustomerDomains(event.target.value)}
          helperText={copy.helper}
          multiline
          minRows={2}
          fullWidth
        />
        <TextField
          label={copy.importantSenders}
          placeholder={copy.senderPlaceholder}
          value={importantSenders}
          onChange={(event) => setImportantSenders(event.target.value)}
          helperText={copy.helper}
          multiline
          minRows={2}
          fullWidth
        />
        <TextField
          label={copy.projectTopics}
          placeholder={copy.topicPlaceholder}
          value={projectTopics}
          onChange={(event) => setProjectTopics(event.target.value)}
          helperText={copy.helper}
          multiline
          minRows={2}
          fullWidth
        />
        <TextField
          label={copy.systemAlerts}
          placeholder={copy.systemPlaceholder}
          value={systemAlertSources}
          onChange={(event) => setSystemAlertSources(event.target.value)}
          helperText={copy.helper}
          multiline
          minRows={2}
          fullWidth
        />
        <TextField
          label={copy.billingTopics}
          placeholder={copy.billingPlaceholder}
          value={billingTopics}
          onChange={(event) => setBillingTopics(event.target.value)}
          helperText={copy.helper}
          multiline
          minRows={2}
          fullWidth
        />
        <TextField
          label={copy.reviewLaterTopics}
          placeholder={copy.reviewLaterPlaceholder}
          value={reviewLaterTopics}
          onChange={(event) => setReviewLaterTopics(event.target.value)}
          helperText={copy.helper}
          multiline
          minRows={2}
          fullWidth
        />
        <TextField
          label={copy.followUpSla}
          value={followUpSlaHours}
          onChange={(event) => setFollowUpSlaHours(event.target.value)}
          type="number"
          inputProps={{ min: 4, max: 240 }}
          fullWidth
        />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button
          variant="outlined"
          onClick={handlePreview}
          disabled={previewing || applying}
          startIcon={previewing ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {copy.previewButton}
        </Button>
        <Button
          variant="contained"
          onClick={handleApply}
          disabled={applying}
          startIcon={applying ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {submitLabel || copy.applyButton}
        </Button>
        {onSkip && (
          <Button variant="text" onClick={onSkip} disabled={previewing || applying}>
            {copy.skipButton}
          </Button>
        )}
      </Stack>

      {contract && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {copy.currentLabels}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {contract.currentLabels.slice(0, 10).map((label) => (
                <Chip key={label.id} label={label.name} size="small" variant="outlined" />
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              {copy.preview}
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {copy.willCreate}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
              {preview.recommendedLabels.map((label) => (
                <Chip
                  key={label.slug}
                  label={label.name}
                  size="small"
                  sx={{
                    bgcolor: label.color.backgroundColor,
                    color: label.color.textColor,
                    borderColor: 'transparent',
                  }}
                />
              ))}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {copy.catchTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {preview.examples.customerRule}
            </Typography>

            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {copy.avoidTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {preview.examples.reviewLaterRule}
            </Typography>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInt(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default TriageSetupForm;
