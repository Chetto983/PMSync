/**
 * BillingPanel - Main billing management container
 *
 * Tabbed interface for subscription overview, usage stats,
 * pricing comparison, and billing management.
 */

import { useState, useCallback } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import {
  CreditCard,
  BarChart3,
  Layers,
  Settings,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useBilling } from '@/hooks/queries/use-billing';
import { SubscriptionCard } from './SubscriptionCard';
import { UsageCard } from './UsageCard';
import { CostProtectionCard } from './CostProtectionCard';
import { PricingTable } from './PricingTable';
import { UpgradeDialog } from './UpgradeDialog';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export function BillingPanel() {
  const theme = useTheme();
  const t = useTranslations();
  const [tab, setTab] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    subscription,
    costStatus,
    isLoading,
    error,
    openPortal,
    attach,
    isOpeningPortal,
    isAttaching,
  } = useBilling();

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
  }, []);

  const handleManageBilling = useCallback(async () => {
    try {
      await openPortal();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to open billing portal:', err);
    }
  }, [openPortal]);

  const handleUpgradeClick = useCallback(() => {
    setUpgradeOpen(true);
  }, []);

  const handleSelectPlan = useCallback(async (planId: string) => {
    try {
      setIsRedirecting(true);
      await attach(planId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to start checkout:', err);
      setIsRedirecting(false);
    }
  }, [attach]);

  if (error) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        {t.billing?.errors?.loadFailed || 'Failed to load subscription details'}
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={handleTabChange}
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 400,
              minHeight: 48,
            },
          }}
        >
          <Tab icon={<CreditCard size={18} />} iconPosition="start" label={t.billing?.tabs?.overview || 'Overview'} sx={{ gap: 1 }} />
          <Tab icon={<BarChart3 size={18} />} iconPosition="start" label={t.billing?.tabs?.usage || 'Usage'} sx={{ gap: 1 }} />
          <Tab icon={<Layers size={18} />} iconPosition="start" label={t.billing?.tabs?.plans || 'Plans'} sx={{ gap: 1 }} />
          <Tab icon={<Settings size={18} />} iconPosition="start" label={t.billing?.tabs?.manage || 'Manage'} sx={{ gap: 1 }} />
        </Tabs>
      </Box>

      <TabPanel value={tab} index={0}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <SubscriptionCard
            subscription={subscription}
            isLoading={isLoading}
            onManageBilling={handleManageBilling}
            isOpeningPortal={isOpeningPortal}
          />
          <CostProtectionCard costStatus={costStatus} isLoading={isLoading} />
        </Box>

        {subscription?.plan === 'FREE' && (
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 3,
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              textAlign: 'center',
            }}
          >
            <Box
              component="button"
              onClick={handleUpgradeClick}
              sx={{
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                color: 'white',
                border: 'none',
                borderRadius: 2,
                px: 4,
                py: 1,
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
                '&:hover': { opacity: 0.9 },
              }}
            >
              {t.billing?.actions?.upgrade || 'Upgrade Plan'}
            </Box>
          </Box>
        )}
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <UsageCard subscription={subscription} isLoading={isLoading} />
      </TabPanel>

      <TabPanel value={tab} index={2}>
        <PricingTable currentPlan={subscription?.plan} onSelectPlan={handleSelectPlan} isAttaching={isAttaching} />
      </TabPanel>

      <TabPanel value={tab} index={3}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 400 }}>
          <Box
            component="button"
            onClick={handleManageBilling}
            disabled={isOpeningPortal}
            sx={{
              p: 2,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
              textAlign: 'left',
              cursor: 'pointer',
              '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.5) },
              '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
            }}
          >
            <Box sx={{ fontWeight: 600, mb: 0.5 }}>{t.billing?.actions?.manageBilling || 'Manage Billing'}</Box>
            <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              {t.billing?.manage?.billingDescription || 'Update payment method, view invoices, manage subscription'}
            </Box>
          </Box>

          <Box
            component="button"
            onClick={handleManageBilling}
            disabled={isOpeningPortal}
            sx={{
              p: 2,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
              textAlign: 'left',
              cursor: 'pointer',
              '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.5) },
              '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
            }}
          >
            <Box sx={{ fontWeight: 600, mb: 0.5 }}>{t.billing?.actions?.viewInvoices || 'View Invoices'}</Box>
            <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              {t.billing?.manage?.invoicesDescription || 'Download and view past invoices'}
            </Box>
          </Box>
        </Box>
      </TabPanel>

      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentPlan={subscription?.plan}
        onSelectPlan={handleSelectPlan}
        isAttaching={isAttaching}
        isRedirecting={isRedirecting}
      />
    </Box>
  );
}
