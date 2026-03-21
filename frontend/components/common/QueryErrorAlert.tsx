import { Alert, AlertTitle, Button } from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface QueryErrorAlertProps {
  error: Error | null;
  onRetry: () => void;
  title?: string;
}

export function QueryErrorAlert({ error, onRetry, title }: QueryErrorAlertProps) {
  const t = useTranslations();
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" startIcon={<RefreshCw size={14} />} onClick={onRetry}>
          {t.common.retry}
        </Button>
      }
      sx={{ mx: 2, my: 2 }}
    >
      <AlertTitle>{title ?? t.errors.fetchErrorTitle}</AlertTitle>
      {error?.message ?? t.errors.fetchErrorDescription}
    </Alert>
  );
}
