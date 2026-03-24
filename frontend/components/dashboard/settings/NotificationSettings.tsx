import React, { useState, useEffect } from 'react';
import { Box, Typography, Switch, Alert, CircularProgress } from '@mui/material';
import { Bell } from 'lucide-react';
import { usePushSubscription } from '@/hooks/use-push-subscription';
import { useTranslations } from '@/lib/hooks/use-translations';
import { pushApi, PushPreferences } from '@/lib/api/push';

const CATEGORY_KEYS: Array<{
  key: keyof PushPreferences;
  labelKey: 'email' | 'calendar' | 'ai';
  descKey: 'emailDescription' | 'calendarDescription' | 'aiDescription';
  fallbackLabel: string;
  fallbackDesc: string;
}> = [
  {
    key: 'pushEmailEnabled',
    labelKey: 'email',
    descKey: 'emailDescription',
    fallbackLabel: 'New email',
    fallbackDesc: 'Get notified when new emails arrive',
  },
  {
    key: 'pushCalendarEnabled',
    labelKey: 'calendar',
    descKey: 'calendarDescription',
    fallbackLabel: 'Calendar',
    fallbackDesc: 'Event invitations and reminders',
  },
  {
    key: 'pushAiEnabled',
    labelKey: 'ai',
    descKey: 'aiDescription',
    fallbackLabel: 'AI assistant',
    fallbackDesc: 'AI task completions and suggestions',
  },
];

export function NotificationSettings() {
  const { isSupported, isSubscribed, permission, subscribeToPush, unsubscribeFromPush } = usePushSubscription();
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<PushPreferences>({
    pushEmailEnabled: true,
    pushCalendarEnabled: true,
    pushAiEnabled: true,
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);

  // Load category preferences when subscribed
  useEffect(() => {
    if (!isSubscribed) return;
    pushApi.getPreferences().then(setPrefs).catch(() => {
      /* Defaults are fine on error */
    });
  }, [isSubscribed]);

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

  const handleCategoryToggle = async (key: keyof PushPreferences) => {
    setPrefError(null);
    setSavingKey(key);
    try {
      const newValue = !prefs[key];
      await pushApi.updatePreference(key, newValue);
      setPrefs((prev) => ({ ...prev, [key]: newValue }));
    } catch {
      setPrefError(
        t.pwa?.push?.prefsSaveError || 'Could not save notification preferences. Please try again.'
      );
    } finally {
      setSavingKey(null);
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

      {/* Master switch row */}
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

      {/* Category toggles -- only when subscribed and not denied */}
      {isSubscribed && !isDenied && (
        <Box sx={{ pl: 4, mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t.pwa?.push?.categoriesTitle || 'Category Preferences'}
          </Typography>

          {CATEGORY_KEYS.map(({ key, labelKey, descKey, fallbackLabel, fallbackDesc }) => (
            <Box
              key={key}
              sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}
            >
              {savingKey === key ? (
                <CircularProgress size={16} sx={{ mt: 0.5 }} />
              ) : (
                <Switch
                  checked={prefs[key]}
                  onChange={() => handleCategoryToggle(key)}
                  disabled={!isSubscribed || isDenied}
                  color="primary"
                  size="small"
                />
              )}
              <Box>
                <Typography variant="subtitle2">
                  {t.pwa?.push?.categories?.[labelKey] || fallbackLabel}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t.pwa?.push?.categories?.[descKey] || fallbackDesc}
                </Typography>
              </Box>
            </Box>
          ))}

          {/* Category preference error */}
          {prefError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {prefError}
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}
