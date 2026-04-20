import { Snackbar, Alert, Button, IconButton } from '@mui/material';
import { RefreshCw, X } from 'lucide-react';
import { useRouter } from 'next/router';
import { useSwUpdate } from '@/hooks/use-sw-update';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAiOverlay } from '@/stores/ai-overlay-store';

export function UpdateSnackbar() {
  const { updateAvailable, activateUpdate, dismissUpdate } = useSwUpdate();
  const t = useTranslations();
  const router = useRouter();
  const aiOverlayOpen = useAiOverlay((state) => state.isOpen);
  const aiOverlayWidth = useAiOverlay((state) => state.width);
  const isTasksPage = router.pathname === '/dashboard/tasks';

  const anchorOrigin = isTasksPage
    ? { vertical: 'top' as const, horizontal: 'right' as const }
    : {
        vertical: 'bottom' as const,
        horizontal: aiOverlayOpen ? ('left' as const) : ('center' as const),
      };

  return (
    <Snackbar
      open={updateAvailable}
      anchorOrigin={anchorOrigin}
      sx={{
        zIndex: 1500,
        ...(isTasksPage
          ? {
              top: { xs: 72, md: 88 },
              right: { xs: 12, md: 20 },
              left: 'auto',
              bottom: 'auto',
            }
          : aiOverlayOpen
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
        sx={{
          boxShadow: 6,
          minWidth: isTasksPage ? 280 : 340,
          maxWidth: isTasksPage ? 360 : undefined,
          alignItems: 'center',
        }}
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
