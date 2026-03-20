import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Skeleton,
  Divider,
} from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useTelegramSettings,
  useUpdateTelegramSettings,
  useDisconnectTelegram,
} from '@/hooks/queries/use-reminders';
import { telegramApi } from '@/lib/api/reminders';

export function TelegramSettingsPanel() {
  const t = useTranslations();
  const tr = t.ai.reminders.telegram;

  const { data: settings, isLoading, refetch } = useTelegramSettings();
  const updateMutation = useUpdateTelegramSettings();
  const disconnectMutation = useDisconnectTelegram();

  const [isActive, setIsActive] = useState(false);
  const [slotMattina, setSlotMattina] = useState('08:30');
  const [slotPomeriggio, setSlotPomeriggio] = useState('14:00');
  const [slotSera, setSlotSera] = useState('18:00');

  // QR link flow state
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLinked = !!settings?.telegramChatId;
  const linkExpiredMessage = tr.linkExpired;
  const linkErrorMessage = tr.linkError;

  useEffect(() => {
    if (settings) {
      setIsActive(settings.isActive);
      setSlotMattina(settings.slotMattina);
      setSlotPomeriggio(settings.slotPomeriggio);
      setSlotSera(settings.slotSera);
    }
  }, [settings]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startLinkFlow = useCallback(async () => {
    setLinkLoading(true);
    setLinkError(null);
    setDeepLink(null);

    try {
      const res = await telegramApi.generateLinkToken();
      const data = res.data?.data;
      if (!data?.deepLink) throw new Error('No deep link returned');

      setDeepLink(data.deepLink);

      // Poll every 3s for up to 5 minutes
      let elapsed = 0;
      pollRef.current = setInterval(async () => {
        elapsed += 3000;
        if (elapsed > 300_000) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setDeepLink(null);
          setLinkError(linkExpiredMessage);
          return;
        }
        try {
          const status = await telegramApi.checkLinkStatus();
          if (status.data?.data?.linked) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setDeepLink(null);
            refetch();
          }
        } catch {
          // ignore polling errors
        }
      }, 3000);
    } catch (err) {
      setLinkError((err as Error).message || linkErrorMessage);
    } finally {
      setLinkLoading(false);
    }
  }, [linkErrorMessage, linkExpiredMessage, refetch]);

  const handleSave = () => {
    updateMutation.mutate({ isActive, slotMattina, slotPomeriggio, slotSera });
  };

  const handleDisconnect = () => {
    if (window.confirm(tr.disconnectConfirm)) {
      disconnectMutation.mutate();
    }
  };

  if (isLoading) {
    return <Skeleton variant="rounded" height={200} />;
  }

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>{tr.title}</Typography>

      {updateMutation.isSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => updateMutation.reset()}>{tr.saved}</Alert>
      )}
      {updateMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => updateMutation.reset()}>
          {(updateMutation.error as Error)?.message || 'Error'}
        </Alert>
      )}

      {/* QR Link Section */}
      {!isLinked ? (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {tr.chatIdHelper}
          </Typography>

          {deepLink ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'white', display: 'inline-flex' }}>
                <QRCodeSVG value={deepLink} size={200} level="M" />
              </Paper>
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 300 }}>
                {tr.qrHint}
              </Typography>
              <Button size="small" variant="text" onClick={startLinkFlow}>
                {tr.regenerateQr}
              </Button>
            </Box>
          ) : (
            <Button
              variant="contained"
              onClick={startLinkFlow}
              disabled={linkLoading}
              startIcon={linkLoading ? <CircularProgress size={16} /> : undefined}
            >
              {tr.connect}
            </Button>
          )}

          {linkError && <Alert severity="error" sx={{ mt: 2 }}>{linkError}</Alert>}
        </Box>
      ) : (
        <Alert severity="success" sx={{ mb: 2 }}>
          {tr.connected} (Chat ID: {settings?.telegramChatId})
        </Alert>
      )}

      {isLinked && (
        <>
          <Divider sx={{ mb: 2 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
              label={tr.active}
            />

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label={tr.slotMattina}
                type="time"
                value={slotMattina}
                onChange={(e) => setSlotMattina(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label={tr.slotPomeriggio}
                type="time"
                value={slotPomeriggio}
                onChange={(e) => setSlotPomeriggio(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label={tr.slotSera}
                type="time"
                value={slotSera}
                onChange={(e) => setSlotSera(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                startIcon={updateMutation.isPending ? <CircularProgress size={16} /> : undefined}
              >
                {tr.save}
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
              >
                {tr.disconnect}
              </Button>
            </Box>
          </Box>
        </>
      )}
    </Paper>
  );
}
