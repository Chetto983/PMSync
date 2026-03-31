/**
 * PricingTable - Plan comparison table with upgrade buttons
 */

import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Skeleton,
  alpha,
  useTheme,
} from '@mui/material';
import { Check, Crown } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { usePricingTable } from '@/hooks/queries/use-billing';
import type { PlanInfo } from '@/lib/api/billing';

interface PricingTableProps {
  currentPlan?: string;
  onSelectPlan: (planId: string) => void;
  isAttaching: boolean;
}

const recommendedPlan = 'professional';

// Map API feature keys to locale keys
const featureKeyMap: Record<string, string> = {
  basic_email: 'basicEmail',
  smart_replies: 'smartReplies',
  summaries: 'summaries',
  auto_triage: 'autoTriage',
  briefings: 'briefings',
  rag: 'rag',
  all: 'all',
};

export function PricingTable({ currentPlan, onSelectPlan, isAttaching }: PricingTableProps) {
  const t = useTranslations();
  const { data: pricingData, isLoading } = usePricingTable(true);

  if (isLoading) {
    return (
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} sx={{ borderRadius: 3, height: 300 }}>
            <CardContent>
              <Skeleton width="60%" height={24} />
              <Skeleton width="40%" height={40} sx={{ my: 2 }} />
              <Skeleton width="80%" height={16} />
              <Skeleton width="70%" height={16} />
              <Skeleton width="90%" height={16} />
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }

  const plans = pricingData?.plans || [];

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          isCurrent={currentPlan?.toLowerCase() === plan.id.toLowerCase()}
          isRecommended={plan.id.toLowerCase() === recommendedPlan}
          onSelect={() => onSelectPlan(plan.id)}
          isAttaching={isAttaching}
          t={t}
        />
      ))}
    </Box>
  );
}

interface PlanCardProps {
  plan: PlanInfo;
  isCurrent: boolean;
  isRecommended: boolean;
  onSelect: () => void;
  isAttaching: boolean;
  t: ReturnType<typeof useTranslations>;
}

function PlanCard({ plan, isCurrent, isRecommended, onSelect, isAttaching, t }: PlanCardProps) {
  const theme = useTheme();

  return (
    <Card
      sx={{
        borderRadius: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        ...(isRecommended && {
          border: `2px solid ${theme.palette.primary.main}`,
          boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.2)}`,
        }),
        ...(isCurrent && {
          bgcolor: alpha(theme.palette.primary.main, 0.04),
        }),
      }}
    >
      {isRecommended && (
        <Chip
          icon={<Crown size={14} />}
          label={t.billing?.pricing?.mostPopular || 'Most Popular'}
          size="small"
          color="primary"
          sx={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            fontWeight: 600,
          }}
        />
      )}

      <CardContent sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          {plan.name}
        </Typography>

        <Box sx={{ mb: 2 }}>
          {plan.price !== null ? (
            <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                ${plan.price}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {t.billing?.pricing?.perMonth || '/month'}
              </Typography>
            </Box>
          ) : (
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {t.billing?.pricing?.custom || 'Custom'}
            </Typography>
          )}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {plan.limits.emails === -1 ? (t.billing?.usage?.unlimited || 'Unlimited') : `${plan.limits.emails.toLocaleString()} emails`}
          {' • '}
          {plan.limits.aiCalls === -1 ? (t.billing?.usage?.unlimited || 'Unlimited') : `${plan.limits.aiCalls.toLocaleString()} AI calls`}
        </Typography>

        <List dense sx={{ flex: 1, mb: 2 }}>
          {plan.features.slice(0, 5).map((feature, idx) => {
            const localeKey = featureKeyMap[feature] || feature;
            const featureLabel = (t.billing?.features as Record<string, string>)?.[localeKey] || feature;
            return (
              <ListItem key={idx} sx={{ px: 0, py: 0 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <Check size={16} color={theme.palette.success.main} />
                </ListItemIcon>
                <ListItemText primary={featureLabel} slotProps={{ primary: { variant: 'body2' } }} />
              </ListItem>
            );
          })}
        </List>

        {isCurrent ? (
          <Chip
            label={t.billing?.pricing?.currentPlan || 'Current Plan'}
            color="primary"
            variant="outlined"
            sx={{ alignSelf: 'center' }}
          />
        ) : plan.price === null ? (
          <Button variant="outlined" fullWidth sx={{ borderRadius: 2 }} href="mailto:sales@pmsync.io">
            {t.billing?.pricing?.contactSales || 'Contact Sales'}
          </Button>
        ) : (
          <Button
            variant={isRecommended ? 'contained' : 'outlined'}
            fullWidth
            onClick={onSelect}
            disabled={isAttaching}
            sx={{ borderRadius: 2 }}
          >
            {t.billing?.actions?.upgrade || 'Upgrade'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
