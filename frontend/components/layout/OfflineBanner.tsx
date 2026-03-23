import { Alert, Collapse } from '@mui/material';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useTranslations } from '@/lib/hooks/use-translations';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const t = useTranslations();

  return (
    <Collapse in={!isOnline}>
      <Alert
        severity="warning"
        icon={<WifiOff size={20} />}
        sx={{
          borderRadius: 0,
          '& .MuiAlert-message': { width: '100%', textAlign: 'center' },
        }}
      >
        {t.common?.offlineBanner || 'You are offline. Some features may be unavailable.'}
      </Alert>
    </Collapse>
  );
}
