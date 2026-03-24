import React, { useState } from 'react';
import { Box, Typography, Switch, Alert, CircularProgress } from '@mui/material';
import { Bell } from 'lucide-react';
import { usePushSubscription } from '@/hooks/use-push-subscription';
import { useTranslations } from '@/lib/hooks/use-translations';

export function NotificationSettings() {
  const { isSupported, isSubscribed, permission, subscribeToPush, unsubscribeFromPush } = usePushSubscription();
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PUSH-04: Hide entirely when not supported
  if (!isSupported) return null;

  const handleToggle = async () => {
    setError(null);
    setLoading(true);
    try {
      if (isSubscribed) {
        await unsubscribeFromPush();
      } else {
        await subscribeToPush();
      }
    } catch {
      setError(
        isSubscribed
          ? (t.pwa?.push?.unsubscribeError || 'Could not disable notifications. Please try again.')
          : (t.pwa?.push?.subscribeError || 'Could not enable notifications. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  };

  const isDenied = permission === 'denied';

  return (
    <Box>
      {/* Section heading */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Bell size={18} />
        <Typography variant="h6">
          {t.pwa?.push?.title || 'Push Notifications'}
        </Typography>
      </Box>

      {/* Description */}
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        {t.pwa?.push?.description || 'Receive alerts when new emails arrive, even when PMSync is closed.'}
      </Typography>

      {/* Permission denied state */}
      {isDenied && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t.pwa?.push?.blockedTitle || 'Notifications blocked'}
          </Typography>
          <Typography variant="body2">
            {t.pwa?.push?.blockedDescription || 'Your browser has blocked notifications for this site. Open your browser settings to re-enable them.'}
          </Typography>
        </Alert>
      )}

      {/* Switch row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
        {loading ? (
          <CircularProgress size={20} />
        ) : (
          <Switch
            checked={isSubscribed}
            onChange={handleToggle}
            disabled={isDenied || loading}
            color="primary"
          />
        )}
        <Typography variant="subtitle2">
          {t.pwa?.push?.enableLabel || 'Enable push notifications'}
        </Typography>
      </Box>

      {/* Error state */}
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
