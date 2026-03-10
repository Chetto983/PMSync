import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Alert,
  Divider,
  Switch,
  Stack,
  Skeleton,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLegalStatus, useLegalAcceptMutation } from '@/hooks/queries/use-data-rights';
import { useConsent, useUpdateConsent } from '@/hooks/queries/use-consent';
import type { StepProps } from './types';

const CURRENT_TOS_VERSION = '1.0';
const CURRENT_PP_VERSION = '1.0';

const AI_FEATURES = [
  'ai_email_processing',
  'ai_smart_replies',
  'ai_summarization',
  'ai_scheduling',
  'ai_auto_triage',
];

export function StepLegalConsent({ onComplete, isLast }: StepProps) {
  const t = useTranslations();
  const sc = t.onboarding.stepContent?.legal;
  const consentFeaturesCopy = t.settings.consentPanel?.features as
    | Record<string, { label: string; description: string }>
    | undefined;

  const { data: legalStatus, isLoading: legalLoading } = useLegalStatus();
  const { data: consents, isLoading: consentLoading } = useConsent();
  const acceptDoc = useLegalAcceptMutation();
  const updateConsent = useUpdateConsent();

  const [tosChecked, setTosChecked] = useState(false);
  const [ppChecked, setPpChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Sync checkboxes with server state on load
  useEffect(() => {
    if (legalStatus) {
      if (legalStatus.tosAccepted) setTosChecked(true);
      if (legalStatus.privacyPolicyAccepted) setPpChecked(true);
    }
  }, [legalStatus]);

  const isLoading = legalLoading || consentLoading;
  const canSubmit = tosChecked && ppChecked;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setSubmitting(true);
      setError('');

      try {
        // Accept TOS if not yet accepted
        if (!legalStatus?.tosAccepted) {
          await acceptDoc.mutateAsync({
            documentType: 'TOS',
            documentVersion: CURRENT_TOS_VERSION,
          });
        }

        // Accept PP if not yet accepted
        if (!legalStatus?.privacyPolicyAccepted) {
          await acceptDoc.mutateAsync({
            documentType: 'PRIVACY_POLICY',
            documentVersion: CURRENT_PP_VERSION,
          });
        }

        onComplete({ tosAccepted: true, ppAccepted: true });
      } catch (err) {
        setError((err as Error).message || t.common.genericError);
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, legalStatus, acceptDoc, onComplete, t.common.genericError],
  );

  const handleConsentToggle = (feature: string, granted: boolean) => {
    updateConsent.mutate({ feature, granted });
  };

  const aiConsents = consents?.filter((c) => AI_FEATURES.includes(c.feature)) ?? [];

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto' }}>
        <Skeleton variant="text" width="60%" height={36} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="90%" height={20} sx={{ mb: 3 }} />
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={48} sx={{ mb: 1.5, borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 480, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {sc?.title ?? 'Terms & Privacy'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {sc?.description ?? 'Please review and accept our legal documents to continue'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Legal Documents */}
      <Stack spacing={1} sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={tosChecked}
              onChange={(e) => setTosChecked(e.target.checked)}
              disabled={legalStatus?.tosAccepted}
            />
          }
          label={
            <Typography variant="body2">
              {sc?.acceptTos ?? 'I accept the Terms of Service'}{' '}
              <Typography
                component="span"
                variant="body2"
                color="primary"
                sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  window.open('/legal/terms', '_blank');
                }}
              >
                {sc?.readDocument ?? '(Read)'}
              </Typography>
            </Typography>
          }
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={ppChecked}
              onChange={(e) => setPpChecked(e.target.checked)}
              disabled={legalStatus?.privacyPolicyAccepted}
            />
          }
          label={
            <Typography variant="body2">
              {sc?.acceptPp ?? 'I accept the Privacy Policy'}{' '}
              <Typography
                component="span"
                variant="body2"
                color="primary"
                sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  window.open('/legal/privacy', '_blank');
                }}
              >
                {sc?.readDocument ?? '(Read)'}
              </Typography>
            </Typography>
          }
        />
      </Stack>

      {/* AI Consent Toggles */}
      <Divider sx={{ mb: 2 }} />
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {sc?.aiConsentTitle ?? 'AI Features'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {sc?.aiConsentDescription ?? 'Choose which AI features you want to enable. You can change these later in Settings.'}
      </Typography>

      <Stack spacing={0.5}>
        {aiConsents.map((consent) => (
          <Box
            key={consent.feature}
            role="button"
            tabIndex={0}
            aria-label={consentFeaturesCopy?.[consent.feature]?.label ?? consent.label}
            onClick={() => handleConsentToggle(consent.feature, !consent.granted)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleConsentToggle(consent.feature, !consent.granted);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 0.75,
              px: 1.5,
              borderRadius: 1,
              cursor: updateConsent.isPending ? 'default' : 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 2,
              },
            }}
          >
            <Box sx={{ flex: 1, mr: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {consentFeaturesCopy?.[consent.feature]?.label ?? consent.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {consentFeaturesCopy?.[consent.feature]?.description ?? consent.description}
              </Typography>
            </Box>
            <Switch
              checked={consent.granted}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => handleConsentToggle(consent.feature, event.target.checked)}
              disabled={updateConsent.isPending}
              size="small"
            />
          </Box>
        ))}
      </Stack>

      {updateConsent.isError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {t.common.genericError}
        </Alert>
      )}

      <Button
        type="submit"
        variant="contained"
        fullWidth
        disabled={!canSubmit || submitting}
        sx={{ mt: 3 }}
      >
        {submitting ? (
          <CircularProgress size={20} color="inherit" />
        ) : isLast ? (
          t.onboarding.finish
        ) : (
          t.onboarding.next
        )}
      </Button>

      {!canSubmit && (
        <Typography variant="caption" color="error" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
          {sc?.mustAcceptAll ?? 'You must accept both documents to continue'}
        </Typography>
      )}
    </Box>
  );
}
