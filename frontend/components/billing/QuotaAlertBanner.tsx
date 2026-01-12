/**
 * QuotaAlertBanner - Global warning banner for quota usage
 *
 * Shows in main layout header when usage exceeds 80%
 */

import {
  Alert,
  Button,
  Collapse,
  Box,
  IconButton,
  alpha,
  useTheme,
} from '@mui/material';
import { AlertTriangle, X, Sparkles } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useBilling } from '@/hooks/queries/use-billing';

interface QuotaAlertBannerProps {
  onUpgradeClick?: () => void;
}

export function QuotaAlertBanner({ onUpgradeClick }: QuotaAlertBannerProps) {
  const theme = useTheme();
  const t = useTranslations();
  const { subscription, costStatus, quotaStatus, isLoading } = useBilling();
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    // Reset after 1 hour
    setTimeout(() => setDismissed(false), 60 * 60 * 1000);
  }, []);

  // Don't show if loading or no data
  if (isLoading || !subscription || dismissed) {
    return null;
  }

  // Check for cost protection blocked state
  const isCostBlocked = costStatus?.isBlocked;

  // Check for quota warnings
  const { emailPercent, aiPercent, isWarning, isCritical } = quotaStatus;
  const maxPercent = Math.max(emailPercent, aiPercent);
  const quotaType = aiPercent >= emailPercent
    ? (t.billing?.usage?.aiCalls || 'AI Calls')
    : (t.billing?.usage?.emails || 'Emails');

  // Don't show if under 80% and not blocked
  if (!isCostBlocked && !isWarning) {
    return null;
  }

  // Determine severity and message
  const severity = isCostBlocked || isCritical ? 'error' : 'warning';
  const costBlockedMsg = t.billing?.alerts?.costBlocked || 'Daily cost limit reached. Upgrade to continue.';
  const quotaExceededMsg = (t.billing?.alerts?.quotaExceeded || '{type} quota exceeded').replace('{type}', quotaType);
  const quotaWarningMsg = (t.billing?.alerts?.quotaWarning || '{percent}% of {type} quota used')
    .replace('{percent}', maxPercent.toFixed(0))
    .replace('{type}', quotaType);
  const message = isCostBlocked ? costBlockedMsg : maxPercent >= 100 ? quotaExceededMsg : quotaWarningMsg;

  return (
    <Collapse in={!dismissed}>
      <Alert
        severity={severity}
        icon={severity === 'error' ? <AlertTriangle size={20} /> : <Sparkles size={20} />}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {onUpgradeClick && subscription.plan !== 'ENTERPRISE' && (
              <Button
                color="inherit"
                size="small"
                onClick={onUpgradeClick}
                sx={{
                  fontWeight: 600,
                  bgcolor: alpha(theme.palette.common.white, 0.15),
                  '&:hover': {
                    bgcolor: alpha(theme.palette.common.white, 0.25),
                  },
                }}
              >
                {t.billing?.actions?.upgrade || 'Upgrade'}
              </Button>
            )}
            <IconButton
              size="small"
              color="inherit"
              onClick={handleDismiss}
              aria-label="dismiss"
            >
              <X size={18} />
            </IconButton>
          </Box>
        }
        sx={{
          borderRadius: 0,
          py: 0.5,
          '& .MuiAlert-message': {
            display: 'flex',
            alignItems: 'center',
          },
        }}
      >
        {message}
      </Alert>
    </Collapse>
  );
}
