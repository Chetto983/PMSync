import React from 'react';
import { Alert, Box, Divider, Skeleton, Typography } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useConsent, useUpdateConsent } from '@/hooks/queries';
import { ConsentToggle } from './ConsentToggle';

const AI_FEATURES = ['ai_email_processing', 'ai_smart_replies', 'ai_summarization', 'ai_scheduling', 'ai_auto_triage'];
const DATA_FEATURES = ['email_analytics', 'contact_enrichment'];

export function ConsentSettings() {
  const t = useTranslations();
  const consentCopy = t.settings.consentPanel;
  const { data: consents, isLoading, error } = useConsent();
  const updateConsent = useUpdateConsent();

  const handleToggle = (feature: string, currentGranted: boolean) => {
    updateConsent.mutate({ feature, granted: !currentGranted });
  };

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width="40%" height={36} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="70%" height={20} sx={{ mb: 3 }} />
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={60} sx={{ mb: 1.5, borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{t.common.genericError}</Alert>;
  }

  const aiConsents = consents?.filter((c) => AI_FEATURES.includes(c.feature)) ?? [];
  const dataConsents = consents?.filter((c) => DATA_FEATURES.includes(c.feature)) ?? [];

  const featureKeys = consentCopy?.features as
    | Record<string, { label: string; description: string }>
    | undefined;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
        {consentCopy?.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {consentCopy?.description}
      </Typography>

      {/* AI Features */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        {consentCopy?.categories?.ai}
      </Typography>
      <Divider sx={{ mb: 1 }} />
      {aiConsents.map((consent) => {
        const featureTrans = featureKeys?.[consent.feature];
        return (
          <ConsentToggle
            key={consent.feature}
            feature={consent.feature}
            label={featureTrans?.label ?? consent.label}
            description={featureTrans?.description ?? consent.description}
            granted={consent.granted}
            lastUpdated={consent.lastUpdated}
            onToggle={() => handleToggle(consent.feature, consent.granted)}
            disabled={updateConsent.isPending}
          />
        );
      })}

      {/* Data Processing */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
        {consentCopy?.categories?.data}
      </Typography>
      <Divider sx={{ mb: 1 }} />
      {dataConsents.map((consent) => {
        const featureTrans = featureKeys?.[consent.feature];
        return (
          <ConsentToggle
            key={consent.feature}
            feature={consent.feature}
            label={featureTrans?.label ?? consent.label}
            description={featureTrans?.description ?? consent.description}
            granted={consent.granted}
            lastUpdated={consent.lastUpdated}
            onToggle={() => handleToggle(consent.feature, consent.granted)}
            disabled={updateConsent.isPending}
          />
        );
      })}

      {updateConsent.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {consentCopy?.consentError}
        </Alert>
      )}
    </Box>
  );
}
