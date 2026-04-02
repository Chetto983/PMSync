/**
 * ContactHoverCard — Mini-CRM popover showing contact context on hover
 *
 * Uses the existing CRM context API (cached via TanStack Query, staleTime 5min).
 * Designed as a compact ~280px card with name, company, deals, and stats.
 */

import { Popover, Box, Typography, Chip, Button, CircularProgress, Divider } from '@mui/material';
import { useRouter } from 'next/router';
import { useCrmContextByEmail } from '@/hooks/queries/use-crm-context';
import { useTranslations } from '@/lib/hooks/use-translations';

interface ContactHoverCardProps {
  email: string;
  anchorEl: HTMLElement | null;
  open: boolean;
  popoverProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function ContactHoverCard({ email, anchorEl, open, popoverProps }: ContactHoverCardProps) {
  const t = useTranslations();
  const router = useRouter();
  const { data, isLoading } = useCrmContextByEmail(email);

  if (!email) return null;

  const hc = t.contacts?.details?.hoverCard;

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      disableRestoreFocus
      sx={{ pointerEvents: 'none' }}
      slotProps={{
        paper: {
          sx: { width: 280, pointerEvents: 'auto' },
        },
      }}
    >
      <Box {...popoverProps} sx={{ p: 2 }}>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!isLoading && !data && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            {hc?.noData || 'No CRM data available'}
          </Typography>
        )}

        {!isLoading && data && (
          <>
            {/* Header: Name + Company */}
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {data.contact.displayName || email}
            </Typography>
            {data.contact.company && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {data.contact.company}
              </Typography>
            )}

            {/* Deals section */}
            {data.deals.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
                  {hc?.deals || 'Deals'}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {data.deals.slice(0, 2).map((deal) => (
                    <Box key={deal.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {deal.stage && (
                        <Chip
                          label={deal.stage.name}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            bgcolor: deal.stage.color || 'grey.400',
                            color: 'white',
                            '& .MuiChip-label': { px: 0.5 },
                          }}
                        />
                      )}
                      <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem', flex: 1, minWidth: 0 }}>
                        {deal.name}
                      </Typography>
                      {deal.amount && (
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {deal.currency} {deal.amount}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </>
            )}
            {data.deals.length === 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.disabled">
                  {hc?.noDealData || 'No deals'}
                </Typography>
              </>
            )}

            {/* Stats row */}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {data.emailCount} {hc?.emails || 'emails'}
              </Typography>
              {data.lastInteraction && (
                <Typography variant="caption" color="text.secondary">
                  {hc?.lastInteraction || 'Last interaction'}: {formatRelativeDate(data.lastInteraction)}
                </Typography>
              )}
            </Box>

            {/* Footer: View profile */}
            <Box sx={{ mt: 1.5, textAlign: 'center' }}>
              <Button
                size="small"
                variant="text"
                onClick={() => router.push(`/dashboard/contacts?id=${data.contact.id}`)}
                sx={{ textTransform: 'none', fontSize: '0.8rem' }}
              >
                {hc?.viewProfile || 'View profile'}
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Popover>
  );
}

export default ContactHoverCard;
