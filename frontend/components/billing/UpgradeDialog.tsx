/**
 * UpgradeDialog - Modal dialog for plan selection and checkout
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import { X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { PricingTable } from './PricingTable';

interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  currentPlan?: string;
  onSelectPlan: (planId: string) => void;
  isAttaching: boolean;
  isRedirecting: boolean;
}

export function UpgradeDialog({
  open,
  onClose,
  currentPlan,
  onSelectPlan,
  isAttaching,
  isRedirecting,
}: UpgradeDialogProps) {
  const t = useTranslations();

  return (
    <Dialog
      open={open}
      onClose={isAttaching || isRedirecting ? undefined : onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
          {t.billing?.actions?.upgrade || 'Upgrade Plan'}
        </Typography>
        <IconButton
          onClick={onClose}
          disabled={isAttaching || isRedirecting}
          size="small"
        >
          <X size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 4 }}>
        {isRedirecting ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 8,
            }}
          >
            <CircularProgress size={48} sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t.billing?.checkout?.redirecting || 'Redirecting to checkout...'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t.billing?.checkout?.processing || 'Please wait while we process your request'}
            </Typography>
          </Box>
        ) : (
          <>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              {t.billing?.description || 'Choose the plan that best fits your needs'}
            </Typography>

            <PricingTable
              currentPlan={currentPlan}
              onSelectPlan={onSelectPlan}
              isAttaching={isAttaching}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
