import React, { useState, useCallback, useMemo } from 'react';
import { logger } from '@/lib/logger';
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
import { Fingerprint, Smartphone, Key, Trash2, AlertTriangle, Plus } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { mfaApi, type WebAuthnCredential } from '@/lib/api/mfa';
import { useTranslations } from '@/lib/hooks/use-translations';

interface PasskeyCardProps {
  credentials: WebAuthnCredential[];
  onRefresh: () => void;
}

function getPasskeyIcon(deviceName: string, transports: string[]) {
  const name = deviceName.toLowerCase();

  // Check transports first
  if (transports.includes('internal')) {
    // Platform authenticator (Touch ID, Face ID, Windows Hello)
    return <Fingerprint size={20} />;
  }
  if (transports.includes('usb') || transports.includes('nfc')) {
    // Security key
    return <Key size={20} />;
  }
  if (transports.includes('hybrid')) {
    // Phone as security key
    return <Smartphone size={20} />;
  }

  // Fallback to name-based detection
  if (name.includes('touch') || name.includes('face') || name.includes('hello') || name.includes('biometric')) {
    return <Fingerprint size={20} />;
  }
  if (name.includes('phone') || name.includes('iphone') || name.includes('android')) {
    return <Smartphone size={20} />;
  }

  return <Key size={20} />;
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

export function PasskeyCard({ credentials, onRefresh }: PasskeyCardProps) {
  const t = useTranslations();
  const passkeysCopy = useMemo(() => t.auth.mfa?.passkeys || {
    title: 'Passkeys',
    subtitle: 'Use Face ID, Touch ID, Windows Hello, or security keys for passwordless login',
    add: 'Add Passkey',
    adding: 'Adding...',
    noPasskeys: 'No passkeys registered yet',
    delete: 'Delete',
    deleteConfirm: 'Are you sure you want to delete this passkey? You will no longer be able to use it to sign in.',
    lastUsed: 'Last used: {{date}}',
    synced: 'Synced',
    localOnly: 'This device only',
    setupSuccess: 'Passkey added successfully!',
    setupError: 'Failed to add passkey. Please try again.',
  }, [t.auth.mfa?.passkeys]);

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);

  const handleAddPasskey = useCallback(async () => {
    try {
      setLoading('add');
      setError('');
      setSuccess('');

      // Step 1: Get registration options from server
      const options = await mfaApi.getWebAuthnRegistrationOptions();

      // Step 2: Start browser WebAuthn registration
      const credential = await startRegistration({ optionsJSON: options });

      // Step 3: Verify registration with server
      const result = await mfaApi.verifyWebAuthnRegistration(credential);

      if (result.success) {
        setSuccess(passkeysCopy.setupSuccess);
        onRefresh();
      } else {
        setError(result.error || passkeysCopy.setupError);
      }
    } catch (err: unknown) {
      logger.error('Passkey registration error', { error: err });

      // Handle specific WebAuthn errors
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Registration was cancelled or not allowed. Please try again.');
        } else if (err.name === 'InvalidStateError') {
          setError('This passkey is already registered.');
        } else if (err.name === 'NotSupportedError') {
          setError('Passkeys are not supported on this device or browser.');
        } else {
          setError(err.message || passkeysCopy.setupError);
        }
      } else {
        setError(passkeysCopy.setupError);
      }
    } finally {
      setLoading(null);
    }
  }, [onRefresh, passkeysCopy]);

  const handleDeletePasskey = useCallback(async (credentialId: string) => {
    try {
      setLoading(credentialId);
      setError('');
      await mfaApi.deleteWebAuthnCredential(credentialId);
      setConfirmDialog(null);
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete passkey';
      setError(message);
    } finally {
      setLoading(null);
    }
  }, [onRefresh]);

  // Check if browser supports WebAuthn
  const supportsWebAuthn = typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {passkeysCopy.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {passkeysCopy.subtitle}
          </Typography>
        </Box>
        {supportsWebAuthn && (
          <Button
            size="small"
            variant="contained"
            startIcon={loading === 'add' ? <CircularProgress size={14} /> : <Plus size={14} />}
            onClick={handleAddPasskey}
            disabled={loading === 'add'}
          >
            {loading === 'add' ? passkeysCopy.adding : passkeysCopy.add}
          </Button>
        )}
      </Box>

      {!supportsWebAuthn && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Passkeys are not supported in this browser. Please use a modern browser like Chrome, Safari, or Edge.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {credentials.length === 0 ? (
        <Box
          sx={{
            py: 4,
            textAlign: 'center',
            bgcolor: 'action.hover',
            borderRadius: 1,
          }}
        >
          <Fingerprint size={32} style={{ opacity: 0.5, marginBottom: 8 }} />
          <Typography variant="body2" color="text.secondary">
            {passkeysCopy.noPasskeys}
          </Typography>
        </Box>
      ) : (
        <List disablePadding>
          {credentials.map((credential) => (
            <ListItem
              key={credential.id}
              sx={{
                bgcolor: 'transparent',
                borderRadius: 1,
                mb: 1,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {getPasskeyIcon(credential.deviceName, credential.transports)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {credential.deviceName}
                    </Typography>
                    {credential.credentialBackedUp && (
                      <Chip label={passkeysCopy.synced} size="small" color="info" variant="outlined" />
                    )}
                  </Box>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    {passkeysCopy.lastUsed.replace('{{date}}', formatDate(credential.lastUsedAt))}
                  </Typography>
                }
              />
              <ListItemSecondaryAction>
                <Tooltip title={passkeysCopy.delete}>
                  <IconButton
                    edge="end"
                    onClick={() => setConfirmDialog(credential.id)}
                    disabled={loading === credential.id}
                    size="small"
                  >
                    {loading === credential.id ? (
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
        <DialogTitle>{passkeysCopy.delete}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" icon={<AlertTriangle size={20} />}>
            {passkeysCopy.deleteConfirm}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
          <Button
            onClick={() => confirmDialog && handleDeletePasskey(confirmDialog)}
            variant="contained"
            color="error"
            disabled={loading !== null}
          >
            {loading ? 'Deleting...' : passkeysCopy.delete}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
