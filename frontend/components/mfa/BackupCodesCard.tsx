import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Tooltip,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Copy, Check, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { mfaApi } from '@/lib/api/mfa';
import { useTranslations } from '@/lib/hooks/use-translations';

interface BackupCodesCardProps {
  initialCodes?: string[];
  remaining: number;
  onRefresh: () => void;
}

export function BackupCodesCard({ initialCodes, remaining, onRefresh }: BackupCodesCardProps) {
  const t = useTranslations();
  const mfaCopy = t.auth.mfa.backupCodes;

  const [codes, setCodes] = useState<string[]>(initialCodes || []);
  const [showCodes, setShowCodes] = useState(!!initialCodes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleGenerateCodes = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await mfaApi.generateBackupCodes();
      setCodes(result.codes);
      setShowCodes(true);
      setConfirmOpen(false);
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate codes';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [onRefresh]);

  const handleCopyCodes = useCallback(() => {
    const text = codes.join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codes]);

  const handleDownloadCodes = useCallback(() => {
    const text = `MailAgent Backup Codes\n${'='.repeat(30)}\n\nStore these codes in a safe place.\nEach code can only be used once.\n\n${codes.join('\n')}\n\nGenerated: ${new Date().toISOString()}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mailagent-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [codes]);

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
        <Chip
          label={mfaCopy.remaining.replace('{{count}}', String(remaining))}
          color={remaining <= 2 ? 'warning' : 'default'}
          size="small"
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {remaining === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} icon={<AlertTriangle size={20} />}>
          {mfaCopy.noCodesRemaining}
        </Alert>
      )}

      {showCodes && codes.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {mfaCopy.warning}
          </Alert>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 1,
              mb: 2,
            }}
          >
            {codes.map((code, index) => (
              <Box
                key={index}
                sx={{
                  p: 1,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                }}
              >
                {code}
              </Box>
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title={copied ? mfaCopy.copied : mfaCopy.copy}>
              <Button
                size="small"
                variant="outlined"
                startIcon={copied ? <Check size={16} /> : <Copy size={16} />}
                onClick={handleCopyCodes}
              >
                {mfaCopy.copy}
              </Button>
            </Tooltip>
            <Tooltip title={mfaCopy.download}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Download size={16} />}
                onClick={handleDownloadCodes}
              >
                {mfaCopy.download}
              </Button>
            </Tooltip>
          </Box>
        </Paper>
      )}

      <Button
        variant={showCodes ? 'outlined' : 'contained'}
        startIcon={loading ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
        onClick={() => (showCodes ? setConfirmOpen(true) : handleGenerateCodes())}
        disabled={loading}
      >
        {showCodes ? mfaCopy.regenerate : mfaCopy.generate}
      </Button>

      {/* Regenerate Confirmation Dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{mfaCopy.regenerate}</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            {mfaCopy.regenerateWarning}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleGenerateCodes}
            variant="contained"
            color="warning"
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Regenerate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
