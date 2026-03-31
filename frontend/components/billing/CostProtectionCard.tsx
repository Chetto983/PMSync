/**
 * CostProtectionCard - Daily cost cap status display
 */

import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import { Shield, AlertTriangle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { CostProtectionStatus } from '@/lib/api/billing';

interface CostProtectionCardProps {
  costStatus: CostProtectionStatus | undefined;
  isLoading: boolean;
}

const alertColors = {
  ok: 'success',
  warning: 'warning',
  critical: 'error',
  blocked: 'error',
} as const;

export function CostProtectionCard({ costStatus, isLoading }: CostProtectionCardProps) {
  const theme = useTheme();
  const t = useTranslations();

  if (isLoading || !costStatus) {
    return (
      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">{t.common?.loading || 'Loading...'}</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  const { dailyCost, dailyCap, percentUsed, isBlocked, alertLevel } = costStatus;
  const chipColor = alertColors[alertLevel];

  const getStatusLabel = () => {
    switch (alertLevel) {
      case 'ok': return t.billing?.costProtection?.statusOk || 'Normal';
      case 'warning': return t.billing?.costProtection?.statusWarning || 'Warning';
      case 'critical': return t.billing?.costProtection?.statusCritical || 'Critical';
      case 'blocked': return t.billing?.costProtection?.statusBlocked || 'Blocked';
      default: return alertLevel;
    }
  };

  return (
    <Card
      sx={{
        borderRadius: 3,
        ...(isBlocked && {
          border: `1px solid ${theme.palette.error.main}`,
          bgcolor: alpha(theme.palette.error.main, 0.02),
        }),
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Shield size={20} color={isBlocked ? theme.palette.error.main : theme.palette.text.secondary} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t.billing?.costProtection?.title || 'Cost Protection'}
            </Typography>
          </Box>
          <Chip
            label={getStatusLabel()}
            size="small"
            color={chipColor}
            sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600 }}
          />
        </Box>

        {isBlocked && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1.5,
              mb: 2,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.error.main, 0.1),
            }}
          >
            <AlertTriangle size={16} color={theme.palette.error.main} />
            <Typography variant="body2" color="error.main">
              {t.billing?.costProtection?.blockedDescription || 'Daily cost limit reached. Operations will resume tomorrow.'}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t.billing?.costProtection?.dailyCost || "Today's AI Cost"}
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            ${dailyCost.toFixed(2)}
          </Typography>
        </Box>

        {dailyCap !== null && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {t.billing?.costProtection?.dailyCap || 'Daily Cap'}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                ${dailyCap.toFixed(2)}
              </Typography>
            </Box>

            <LinearProgress
              variant="determinate"
              value={Math.min(percentUsed, 100)}
              color={chipColor}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.grey[500], 0.15),
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {percentUsed.toFixed(0)}% {t.billing?.usage?.percentUsed || 'used'}
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
