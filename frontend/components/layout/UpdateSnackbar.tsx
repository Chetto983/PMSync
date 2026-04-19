import { Snackbar, Alert, Button, IconButton } from '@mui/material';
import { RefreshCw, X } from 'lucide-react';
import { useSwUpdate } from '@/hooks/use-sw-update';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAiOverlay } from '@/stores/ai-overlay-store';

export function UpdateSnackbar() {
  const { updateAvailable, activateUpdate, dismissUpdate } = useSwUpdate();
  const t = useTranslations();
  const aiOverlayOpen = useAiOverlay((state) => state.isOpen);
  const aiOverlayWidth = useAiOverlay((state) => state.width);

  return (
    <Snackbar
      open={updateAvailable}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: aiOverlayOpen ? 'left' : 'center',
      }}
      sx={{
        zIndex: 1500,
        ...(aiOverlayOpen
          ? {
              left: { xs: 16, sm: 24 },
              right: { xs: 16, sm: `${aiOverlayWidth + 24}px` },
              bottom: { xs: 16, sm: 24 },
            }
          : {}),
      }}
    >
      <Alert
        severity="info"
        variant="filled"
        icon={<RefreshCw size={20} />}
        sx={{ boxShadow: 6, minWidth: 340 }}
        action={
          <>
            <Button size="small" color="inherit" variant="outlined" onClick={activateUpdate}>
              {t.pwa?.update?.reload || 'Reload page'}
            </Button>
            <IconButton size="small" color="inherit" onClick={dismissUpdate} sx={{ ml: 0.5 }}>
              <X size={16} />
            </IconButton>
          </>
        }
      >
        {t.pwa?.update?.available || 'A new version of PMSync is available.'}
      </Alert>
    </Snackbar>
  );
}
