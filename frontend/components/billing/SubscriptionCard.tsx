/**
 * SubscriptionCard - Displays current subscription plan and status
 */

import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  Skeleton,
  alpha,
  useTheme,
  type Theme,
} from '@mui/material';
import { Crown, Sparkles, Building2, User } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useLocale } from '@/lib/hooks/use-locale';
import { formatDateInTz } from '@/lib/utils/format-date-tz';
import type { Subscription } from '@/lib/api/billing';

interface SubscriptionCardProps {
  subscription: Subscription | undefined;
  isLoading: boolean;
  onManageBilling: () => void;
  isOpeningPortal: boolean;
}

const planIcons: Record<string, React.ReactNode> = {
  FREE: <User size={20} />,
  STARTER: <Sparkles size={20} />,
  PROFESSIONAL: <Crown size={20} />,
  ENTERPRISE: <Building2 size={20} />,
};

// Map plan tiers to theme palette colors (theme-aware for light/dark mode)
const getPlanColor = (plan: string, theme: Theme): string => {
  const colorMap: Record<string, string> = {
    FREE: theme.palette.grey[500],
    STARTER: theme.palette.info.main,
    PROFESSIONAL: theme.palette.secondary.main,
    ENTERPRISE: theme.palette.warning.main,
  };
  return colorMap[plan] || theme.palette.grey[500];
};

export function SubscriptionCard({
  subscription,
  isLoading,
  onManageBilling,
  isOpeningPortal,
}: SubscriptionCardProps) {
  const t = useTranslations();
  const theme = useTheme();
  const timezone = useUserTimezone();
  const { locale } = useLocale();

  if (isLoading) {
    return (
      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Skeleton width={120} height={24} sx={{ mb: 2 }} />
          <Skeleton width={180} height={40} sx={{ mb: 2 }} />
          <Skeleton width={100} height={20} />
        </CardContent>
      </Card>
    );
  }

  if (!subscription) return null;

  const planKey = subscription.plan.toLowerCase() as 'free' | 'starter' | 'professional' | 'enterprise';
  const planInfo = t.billing?.plans?.[planKey];
  const planColor = getPlanColor(subscription.plan, theme);
  const statusColor = subscription.status === 'ACTIVE' ? 'success' :
    subscription.status === 'PAST_DUE' ? 'warning' : 'error';

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: `1px solid ${alpha(planColor, 0.3)}`,
        background: `linear-gradient(135deg, ${alpha(planColor, 0.05)} 0%, transparent 100%)`,
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {t.billing?.currentPlan || 'Current Plan'}
          </Typography>
          <Chip
            label={subscription.status}
            size="small"
            color={statusColor}
            sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600 }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2.5,
              bgcolor: alpha(planColor, 0.15),
              color: planColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {planIcons[subscription.plan]}
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: planColor }}>
              {planInfo?.name || subscription.plan}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {planInfo?.description}
            </Typography>
          </Box>
        </Box>

        {subscription.currentPeriodEnd && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            {t.billing?.usage?.resetDate || 'Resets on'}: {formatDateInTz(subscription.currentPeriodEnd, timezone, locale)}
          </Typography>
        )}

        {subscription.cancelAt && (
          <Chip
            label={`Cancels ${formatDateInTz(subscription.cancelAt, timezone, locale)}`}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ mb: 2 }}
          />
        )}

        <Button
          variant="outlined"
          size="small"
          onClick={onManageBilling}
          disabled={isOpeningPortal}
          sx={{ borderRadius: 2 }}
        >
          {t.billing?.actions?.manageBilling || 'Manage Billing'}
        </Button>
      </CardContent>
    </Card>
  );
}
