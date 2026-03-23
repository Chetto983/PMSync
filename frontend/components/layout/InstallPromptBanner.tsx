import { useState } from 'react';
import {
  Snackbar, Alert, Button, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Typography,
} from '@mui/material';
import { Download, X } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { useTranslations } from '@/lib/hooks/use-translations';

export function InstallPromptBanner() {
  const { shouldShow, isIOS, triggerInstall, dismiss } = useInstallPrompt();
  const t = useTranslations();
  const [iosDialogOpen, setIosDialogOpen] = useState(false);

  return (
    <>
      {/* Chromium Snackbar */}
      <Snackbar
        open={shouldShow && !isIOS}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="info"
          icon={<Download size={20} />}
          action={
            <>
              <Button
                size="small"
                color="inherit"
                onClick={async () => { await triggerInstall(); }}
              >
                {t.pwa?.install?.accept || 'Install App'}
              </Button>
              <IconButton
                size="small"
                color="inherit"
                onClick={dismiss}
                aria-label={t.pwa?.install?.dismissAriaLabel || 'Dismiss install prompt'}
              >
                <X size={16} />
              </IconButton>
            </>
          }
        >
          {t.pwa?.install?.chromiumMessage || 'Install PMSync for a faster, native-like experience'}
        </Alert>
      </Snackbar>

      {/* iOS Snackbar */}
      <Snackbar
        open={shouldShow && isIOS}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="info"
          icon={<Download size={20} />}
          action={
            <>
              <Button
                size="small"
                color="inherit"
                onClick={() => setIosDialogOpen(true)}
              >
                {t.pwa?.install?.iosLearnHow || 'Learn how'}
              </Button>
              <IconButton
                size="small"
                color="inherit"
                onClick={dismiss}
                aria-label={t.pwa?.install?.dismissAriaLabel || 'Dismiss install prompt'}
              >
                <X size={16} />
              </IconButton>
            </>
          }
        >
          {t.pwa?.install?.iosMessage || 'Add PMSync to your home screen'}
        </Alert>
      </Snackbar>

      {/* iOS Instructions Dialog */}
      <Dialog open={iosDialogOpen} onClose={() => setIosDialogOpen(false)}>
        <DialogTitle>{t.pwa?.install?.iosTitle || 'Add to Home Screen'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body1">
            1. {t.pwa?.install?.iosStep1 || 'Tap the Share button in the toolbar'}
          </Typography>
          <Typography variant="body1">
            2. {t.pwa?.install?.iosStep2 || 'Scroll down and tap "Add to Home Screen"'}
          </Typography>
          <Typography variant="body1">
            3. {t.pwa?.install?.iosStep3 || 'Tap "Add" to confirm'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIosDialogOpen(false)}>
            {t.common?.close || 'Close'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
