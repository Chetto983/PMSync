/**
 * UsageCard - Displays usage statistics with progress bars
 */

import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  alpha,
  useTheme,
} from '@mui/material';
import { Mail, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useLocale } from '@/lib/hooks/use-locale';
import { formatDateInTz } from '@/lib/utils/format-date-tz';
import type { Subscription } from '@/lib/api/billing';

interface UsageCardProps {
  subscription: Subscription | undefined;
  isLoading: boolean;
}

export function UsageCard({ subscription, isLoading }: UsageCardProps) {
  const theme = useTheme();
  const t = useTranslations();
  const timezone = useUserTimezone();
  const { locale } = useLocale();

  if (isLoading || !subscription) {
    return (
      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">{t.common?.loading || 'Loading...'}</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  const { usage, monthlyEmailLimit, monthlyAICallLimit, usageResetAt } = subscription;

  const emailPercent = Math.min(usage.percentEmailUsed, 100);
  const aiPercent = Math.min(usage.percentAIUsed, 100);

  const getProgressColor = (percent: number) => {
    if (percent >= 95) return theme.palette.error.main;
    if (percent >= 80) return theme.palette.warning.main;
    return theme.palette.primary.main;
  };

  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
          {t.billing?.usage?.title || 'Usage This Period'}
        </Typography>

        {/* Emails Usage */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Mail size={16} color={theme.palette.text.secondary} />
              <Typography variant="body2" fontWeight={400}>
                {t.billing?.usage?.emails || 'Emails Processed'}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {usage.emailsProcessed.toLocaleString()} {t.billing?.usage?.of || 'of'}{' '}
              {monthlyEmailLimit === -1 ? (t.billing?.usage?.unlimited || 'Unlimited') : monthlyEmailLimit.toLocaleString()}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={monthlyEmailLimit === -1 ? 0 : emailPercent}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: alpha(getProgressColor(emailPercent), 0.15),
              '& .MuiLinearProgress-bar': {
                bgcolor: getProgressColor(emailPercent),
                borderRadius: 4,
              },
            }}
          />
          {monthlyEmailLimit !== -1 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {usage.emailsRemaining.toLocaleString()} {t.billing?.usage?.remaining || 'remaining'}
            </Typography>
          )}
        </Box>

        {/* AI Calls Usage */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Sparkles size={16} color={theme.palette.text.secondary} />
              <Typography variant="body2" fontWeight={400}>
                {t.billing?.usage?.aiCalls || 'AI Calls'}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {usage.aiCallsUsed.toLocaleString()} {t.billing?.usage?.of || 'of'}{' '}
              {monthlyAICallLimit === -1 ? (t.billing?.usage?.unlimited || 'Unlimited') : monthlyAICallLimit.toLocaleString()}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={monthlyAICallLimit === -1 ? 0 : aiPercent}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: alpha(getProgressColor(aiPercent), 0.15),
              '& .MuiLinearProgress-bar': {
                bgcolor: getProgressColor(aiPercent),
                borderRadius: 4,
              },
            }}
          />
          {monthlyAICallLimit !== -1 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {usage.aiCallsRemaining.toLocaleString()} {t.billing?.usage?.remaining || 'remaining'}
            </Typography>
          )}
        </Box>

        {/* Reset Date */}
        {usageResetAt && (
          <Typography variant="caption" color="text.secondary">
            {t.billing?.usage?.resetDate || 'Resets on'}: {formatDateInTz(usageResetAt, timezone, locale)}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
