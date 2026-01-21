/**
 * UndoSendSnackbar Component
 *
 * Phase 9: Displays countdown timer with undo button after sending email.
 * Shows remaining seconds and allows user to cancel the send.
 *
 * Features:
 * - Countdown timer display
 * - Undo button to cancel send
 * - Progress bar visualization
 * - Smooth animations
 */

import { useMemo } from 'react';
import {
  Snackbar,
  Alert,
  Button,
  Box,
  Typography,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import { Undo2 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { PendingSendState } from '@/hooks/use-undo-send';

const TOTAL_SECONDS = 30;

interface UndoSendSnackbarProps {
  /** Pending send state from useUndoSend hook */
  pendingSend: PendingSendState | null;
  /** Called when user clicks Undo */
  onUndo: () => void;
}

/**
 * Snackbar that shows countdown and allows cancelling a pending send
 */
export function UndoSendSnackbar({ pendingSend, onUndo }: UndoSendSnackbarProps) {
  const t = useTranslations();

  // Calculate progress percentage (100% at start, 0% when send happens)
  const progress = useMemo(() => {
    if (!pendingSend) return 0;
    return (pendingSend.secondsRemaining / TOTAL_SECONDS) * 100;
  }, [pendingSend]);

  const isOpen = pendingSend !== null;
  const isCancelling = pendingSend?.isCancelling ?? false;

  return (
    <Snackbar
      open={isOpen}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        '& .MuiSnackbarContent-root': {
          minWidth: 400,
        },
      }}
    >
      <Alert
        severity="info"
        variant="filled"
        sx={{
          width: '100%',
          minWidth: 400,
          alignItems: 'center',
          '& .MuiAlert-message': {
            flex: 1,
          },
        }}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={onUndo}
            disabled={isCancelling}
            startIcon={
              isCancelling ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <Undo2 size={14} />
              )
            }
            sx={{
              fontWeight: 600,
              textTransform: 'none',
              minWidth: 80,
            }}
          >
            {isCancelling
              ? t.email.undoSend.undoing
              : t.email.undoSend.undo}
          </Button>
        }
      >
        <Box sx={{ width: '100%' }}>
          {/* Message with countdown */}
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
            {t.email.undoSend.sendingIn.replace(
              '{seconds}',
              String(pendingSend?.secondsRemaining ?? 0)
            )}
          </Typography>

          {/* Progress bar */}
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: 'white',
                transition: 'transform 1s linear',
              },
            }}
          />
        </Box>
      </Alert>
    </Snackbar>
  );
}

export default UndoSendSnackbar;
