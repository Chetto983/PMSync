import { memo, useMemo, useCallback, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  Skeleton,
  Button,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import { Building2, Handshake, Ticket, Link2, Check, X, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  usePendingSuggestions,
  useAcceptSuggestion,
  useDismissSuggestion,
  useBulkSuggestionAction,
} from '@/hooks/queries/use-crm-suggestions';
import { useGlobalToast } from '@/lib/context/toast-context';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { CrmSuggestion } from '@/lib/api/crm-suggestions';

// ---- Icon Map ----

const TYPE_ICON: Record<string, React.ReactNode> = {
  account: <Building2 size={16} />,
  deal: <Handshake size={16} />,
  ticket: <Ticket size={16} />,
  link: <Link2 size={16} />,
};

// ---- Helpers ----

function getSuggestionDescription(suggestion: CrmSuggestion): string {
  const data = suggestion.entityData as Record<string, string | undefined>;
  switch (suggestion.type) {
    case 'account':
      return data.name ?? 'New account';
    case 'deal':
      return data.name ?? 'New deal';
    case 'ticket':
      return data.subject ?? 'New ticket';
    case 'link':
      return data.contactName
        ? `${data.contactName} → ${data.accountName ?? 'Account'}`
        : 'Link contact to account';
    default:
      return suggestion.type;
  }
}

// ---- Skeleton ----

const FeedSkeleton = memo(function FeedSkeleton() {
  return (
    <Box sx={{ p: 2 }}>
      {[1, 2, 3].map((i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
          <Skeleton variant="circular" width={28} height={28} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="40%" />
          </Box>
          <Skeleton variant="circular" width={28} height={28} />
          <Skeleton variant="circular" width={28} height={28} />
        </Box>
      ))}
    </Box>
  );
});

// ---- Single Item ----

interface SuggestionItemProps {
  suggestion: CrmSuggestion;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  acceptLabel: string;
  dismissLabel: string;
  typeLabels: Record<string, string | undefined>;
  isPending: boolean;
}

const SuggestionItem = memo(function SuggestionItem({
  suggestion,
  onAccept,
  onDismiss,
  acceptLabel,
  dismissLabel,
  typeLabels,
  isPending,
}: SuggestionItemProps) {
  const icon = TYPE_ICON[suggestion.type] ?? <Sparkles size={16} />;
  const description = getSuggestionDescription(suggestion);
  const typeLabel = typeLabels[suggestion.type] ?? suggestion.type;

  return (
    <ListItem
      disablePadding
      sx={{ py: 0.75, px: 1, opacity: isPending ? 0.6 : 1 }}
      secondaryAction={
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={acceptLabel}>
            <IconButton
              size="small"
              color="success"
              onClick={() => onAccept(suggestion.id)}
              disabled={isPending}
              sx={{ width: 44, height: 44 }}
            >
              {isPending ? <CircularProgress size={14} color="inherit" /> : <Check size={16} />}
            </IconButton>
          </Tooltip>
          <Tooltip title={dismissLabel}>
            <IconButton
              size="small"
              color="error"
              onClick={() => onDismiss(suggestion.id)}
              disabled={isPending}
              sx={{ width: 44, height: 44 }}
            >
              <X size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      }
    >
      <ListItemIcon sx={{ minWidth: 32 }}>{icon}</ListItemIcon>
      <ListItemText
        primary={description}
        secondary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
            <Chip label={typeLabel} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
            <LinearProgress
              variant="determinate"
              value={suggestion.confidence * 100}
              sx={{ flex: 1, maxWidth: 60, height: 4, borderRadius: 2 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {Math.round(suggestion.confidence * 100)}%
            </Typography>
          </Box>
        }
        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
      />
    </ListItem>
  );
});

// ---- Main Component ----

export const CrmSuggestionsFeed = memo(function CrmSuggestionsFeed() {
  const t = useTranslations();
  const toast = useGlobalToast();
  const ts = t.crmSuggestions;

  const { data, isLoading } = usePendingSuggestions();
  const acceptMutation = useAcceptSuggestion();
  const dismissMutation = useDismissSuggestion();
  const bulkMutation = useBulkSuggestionAction();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [dismissConfirmId, setDismissConfirmId] = useState<string | null>(null);

  const suggestions = useMemo(() => data?.data ?? [], [data]);
  const grouped = useMemo(() => {
    const groups: Record<string, CrmSuggestion[]> = {};
    for (const s of suggestions) {
      (groups[s.type] ??= []).push(s);
    }
    return groups;
  }, [suggestions]);

  const typeLabels = useMemo(
    () => (ts?.types ?? {}) as Record<string, string | undefined>,
    [ts],
  );

  const handleAccept = useCallback(async (id: string) => {
    if (pendingIds.has(id)) return;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await acceptMutation.mutateAsync(id);
      toast.success(ts?.accepted ?? 'Suggestion accepted');
    } catch {
      toast.error(t.common?.genericError ?? 'Error');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [acceptMutation, toast, ts, t.common, pendingIds]);

  const handleDismissClick = useCallback((id: string) => {
    setDismissConfirmId(id);
  }, []);

  const handleDismissConfirm = useCallback(async () => {
    const id = dismissConfirmId;
    if (!id) return;
    setDismissConfirmId(null);
    if (pendingIds.has(id)) return;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await dismissMutation.mutateAsync(id);
      toast.success(ts?.dismissed ?? 'Suggestion dismissed');
    } catch {
      toast.error(t.common?.genericError ?? 'Error');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [dismissConfirmId, dismissMutation, toast, ts, t.common, pendingIds]);

  const handleBulkAccept = useCallback(async () => {
    const ids = suggestions.map((s) => s.id);
    if (!ids.length) return;
    try {
      await bulkMutation.mutateAsync({ ids, action: 'accept' });
      toast.success(ts?.bulkComplete ?? 'Bulk action complete');
    } catch {
      toast.error(t.common?.genericError ?? 'Error');
    }
  }, [suggestions, bulkMutation, toast, ts, t.common]);

  const handleBulkDismiss = useCallback(async () => {
    const ids = suggestions.map((s) => s.id);
    if (!ids.length) return;
    try {
      await bulkMutation.mutateAsync({ ids, action: 'dismiss' });
      toast.success(ts?.bulkComplete ?? 'Bulk action complete');
    } catch {
      toast.error(t.common?.genericError ?? 'Error');
    }
  }, [suggestions, bulkMutation, toast, ts, t.common]);

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Sparkles size={18} />
          <Typography variant="subtitle2">{ts?.title ?? 'AI Suggestions'}</Typography>
          {suggestions.length > 0 && (
            <Chip
              label={(ts?.pendingCount ?? '{count} pending').replace('{count}', String(suggestions.length))}
              size="small"
              color="primary"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        {suggestions.length > 1 && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button
              size="small"
              color="success"
              onClick={handleBulkAccept}
              disabled={bulkMutation.isPending}
              sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}
            >
              {ts?.acceptAll ?? 'Accept All'}
            </Button>
            <Button
              size="small"
              color="error"
              onClick={handleBulkDismiss}
              disabled={bulkMutation.isPending}
              sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}
            >
              {ts?.dismissAll ?? 'Dismiss All'}
            </Button>
          </Box>
        )}
      </Box>

      {/* Body */}
      {isLoading && <FeedSkeleton />}

      {!isLoading && suggestions.length === 0 && (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {ts?.noPending ?? 'No pending suggestions'}
          </Typography>
        </Box>
      )}

      {!isLoading && suggestions.length > 0 && (
        <List dense disablePadding>
          {Object.entries(grouped).map(([type, items], groupIndex) => (
            <Box key={type}>
              {groupIndex > 0 && <Divider />}
              {items.map((suggestion) => (
                <SuggestionItem
                  key={suggestion.id}
                  suggestion={suggestion}
                  onAccept={handleAccept}
                  onDismiss={handleDismissClick}
                  acceptLabel={ts?.accept ?? 'Accept'}
                  dismissLabel={ts?.dismiss ?? 'Dismiss'}
                  typeLabels={typeLabels}
                  isPending={pendingIds.has(suggestion.id)}
                />
              ))}
            </Box>
          ))}
        </List>
      )}
      <ConfirmDialog
        open={dismissConfirmId !== null}
        onClose={() => setDismissConfirmId(null)}
        onConfirm={handleDismissConfirm}
        variant="warning"
        title={ts?.dismissConfirmTitle ?? 'Dismiss suggestion'}
        message={ts?.dismissConfirmMessage ?? 'Dismiss this suggestion? This cannot be undone.'}
        confirmText={ts?.dismiss ?? 'Dismiss'}
      />
    </Paper>
  );
});
