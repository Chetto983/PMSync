import { memo, useCallback, useMemo } from 'react';
import { Box, Divider, Typography } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useGlobalToast } from '@/lib/context/toast-context';
import {
  useEmailSuggestions,
  useAcceptSuggestion,
  useDismissSuggestion,
} from '@/hooks/queries/use-crm-suggestions';
import { EmailSuggestionCard } from './EmailSuggestionCard';

interface SidebarSuggestionsSectionProps {
  emailId: string;
}

export const SidebarSuggestionsSection = memo(function SidebarSuggestionsSection({
  emailId,
}: SidebarSuggestionsSectionProps) {
  const t = useTranslations();
  const tc = t.crmContext;
  const ts = t.crmSuggestions;
  const toast = useGlobalToast();
  const { data: suggestions } = useEmailSuggestions(emailId);
  const acceptMutation = useAcceptSuggestion();
  const dismissMutation = useDismissSuggestion();

  const pending = useMemo(
    () =>
      (suggestions ?? [])
        .filter((s) => s.status === 'pending')
        .sort((a, b) => b.confidence - a.confidence),
    [suggestions],
  );

  const handleAccept = useCallback(
    (id: string) => {
      acceptMutation.mutate(id, {
        onSuccess: () => toast.success(ts?.accepted ?? 'Suggestion accepted'),
      });
    },
    [acceptMutation, toast, ts],
  );

  const handleDismiss = useCallback(
    (id: string) => {
      dismissMutation.mutate(id, {
        onSuccess: () => toast.success(ts?.dismissed ?? 'Suggestion dismissed'),
      });
    },
    [dismissMutation, toast, ts],
  );

  if (!pending.length) return null;

  const isMutating = acceptMutation.isPending || dismissMutation.isPending;

  return (
    <>
      <Divider sx={{ my: 1.5 }} />
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {tc?.suggestedActions ?? 'Suggested Actions'} ({pending.length})
        </Typography>
        {pending.map((s) => (
          <EmailSuggestionCard
            key={s.id}
            suggestion={s}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            disabled={isMutating}
          />
        ))}
      </Box>
    </>
  );
});
