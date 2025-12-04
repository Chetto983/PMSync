import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Monitor, Smartphone, Tablet, Trash2, AlertTriangle } from 'lucide-react';
import { mfaApi, type TrustedDevice } from '@/lib/api/mfa';
import { useTranslations } from '@/lib/hooks/use-translations';

interface TrustedDevicesListProps {
  devices: TrustedDevice[];
  onRefresh: () => void;
}

function getDeviceIcon(deviceName: string) {
  const name = deviceName.toLowerCase();
  if (name.includes('mobile') || name.includes('iphone') || name.includes('android')) {
    return <Smartphone size={20} />;
  }
  if (name.includes('tablet') || name.includes('ipad')) {
    return <Tablet size={20} />;
  }
  return <Monitor size={20} />;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TrustedDevicesList({ devices, onRefresh }: TrustedDevicesListProps) {
  const t = useTranslations();
  const mfaCopy = t.auth.mfa.trustedDevices;

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ type: 'single' | 'all'; deviceId?: string } | null>(null);

  const handleRevokeDevice = useCallback(async (deviceId: string) => {
    try {
      setLoading(deviceId);
      setError('');
      await mfaApi.revokeDevice(deviceId);
      setConfirmDialog(null);
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to revoke device';
      setError(message);
    } finally {
      setLoading(null);
    }
  }, [onRefresh]);

  const handleRevokeAllDevices = useCallback(async () => {
    try {
      setLoading('all');
      setError('');
      await mfaApi.revokeAllDevices();
      setConfirmDialog(null);
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to revoke devices';
      setError(message);
    } finally {
      setLoading(null);
    }
  }, [onRefresh]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {mfaCopy.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {mfaCopy.subtitle}
          </Typography>
        </Box>
        {devices.length > 0 && (
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<Trash2 size={14} />}
            onClick={() => setConfirmDialog({ type: 'all' })}
            disabled={loading === 'all'}
          >
            {mfaCopy.revokeAll}
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {devices.length === 0 ? (
        <Box
          sx={{
            py: 4,
            textAlign: 'center',
            bgcolor: 'action.hover',
            borderRadius: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {mfaCopy.noDevices}
          </Typography>
        </Box>
      ) : (
        <List disablePadding>
          {devices.map((device) => (
            <ListItem
              key={device.id}
              sx={{
                bgcolor: device.isCurrent ? 'action.selected' : 'transparent',
                borderRadius: 1,
                mb: 1,
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {getDeviceIcon(device.deviceName)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {device.deviceName}
                    </Typography>
                    {device.isCurrent && (
                      <Chip label={mfaCopy.current} size="small" color="primary" />
                    )}
                  </Box>
                }
                secondary={
                  <Box component="span">
                    {device.location && (
                      <Typography variant="caption" component="span" sx={{ mr: 1 }}>
                        {device.location}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {mfaCopy.lastUsed.replace('{{date}}', formatDate(device.lastUsedAt))}
                    </Typography>
                  </Box>
                }
              />
              <ListItemSecondaryAction>
                <Tooltip title={mfaCopy.revoke}>
                  <IconButton
                    edge="end"
                    onClick={() => setConfirmDialog({ type: 'single', deviceId: device.id })}
                    disabled={loading === device.id}
                    size="small"
                  >
                    {loading === device.id ? (
                      <CircularProgress size={16} />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmDialog} onClose={() => setConfirmDialog(null)}>
        <DialogTitle>
          {confirmDialog?.type === 'all' ? mfaCopy.revokeAll : mfaCopy.revoke}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" icon={<AlertTriangle size={20} />}>
            {confirmDialog?.type === 'all' ? mfaCopy.revokeAllConfirm : mfaCopy.revokeConfirm}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
          <Button
            onClick={() =>
              confirmDialog?.type === 'all'
                ? handleRevokeAllDevices()
                : handleRevokeDevice(confirmDialog?.deviceId || '')
            }
            variant="contained"
            color="error"
            disabled={loading !== null}
          >
            {loading ? 'Revoking...' : mfaCopy.revoke}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
