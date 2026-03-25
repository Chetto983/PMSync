import { Snackbar, Alert, Button, IconButton } from '@mui/material';
import { RefreshCw, X } from 'lucide-react';
import { useSwUpdate } from '@/hooks/use-sw-update';
import { useTranslations } from '@/lib/hooks/use-translations';

export function UpdateSnackbar() {
  const { updateAvailable, activateUpdate, dismissUpdate } = useSwUpdate();
  const t = useTranslations();

  return (
    <Snackbar
      open={updateAvailable}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ zIndex: 1500 }}
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
