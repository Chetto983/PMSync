import { Snackbar, Alert, Button } from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { useSwUpdate } from '@/hooks/use-sw-update';
import { useTranslations } from '@/lib/hooks/use-translations';

export function UpdateSnackbar() {
  const { updateAvailable, activateUpdate } = useSwUpdate();
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
          <Button size="small" color="inherit" variant="outlined" onClick={activateUpdate}>
            {t.pwa?.update?.reload || 'Reload page'}
          </Button>
        }
      >
        {t.pwa?.update?.available || 'A new version of PMSync is available.'}
      </Alert>
    </Snackbar>
  );
}
