import { Alert, Badge, Collapse } from '@mui/material';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useOfflineQueueStore } from '@/stores/offline-queue-store';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const t = useTranslations();
  const pendingCount = useOfflineQueueStore((s) => s.pendingCount);

  const icon = pendingCount > 0 ? (
    <Badge badgeContent={pendingCount} color="warning" max={99}>
      <WifiOff size={20} />
    </Badge>
  ) : (
    <WifiOff size={20} />
  );

  return (
    <Collapse in={!isOnline}>
      <Alert
        severity="warning"
        icon={icon}
        sx={{
          borderRadius: 0,
          '& .MuiAlert-message': { width: '100%', textAlign: 'center' },
        }}
      >
        {pendingCount > 0
          ? (t.offlineQueue?.pendingActions?.replace('{count}', String(pendingCount))
            || `${pendingCount} pending action(s)`)
          : (t.common?.offlineBanner || 'You are offline. Some features may be unavailable.')}
      </Alert>
    </Collapse>
  );
}
