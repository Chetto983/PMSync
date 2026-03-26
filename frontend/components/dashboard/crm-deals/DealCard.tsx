import React from 'react';
import { Box, Typography, Chip, Tooltip } from '@mui/material';
import { Calendar, DollarSign, User } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { CrmDeal } from '@/lib/api/crm-deals';
import { DealScoreBadge } from './DealScoreBadge';

function formatAmount(amount: string | null, currency: string): string {
  if (!amount) return '';
  const num = parseFloat(amount);
  if (isNaN(num)) return '';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface DealCardProps {
  deal: CrmDeal;
  onClick?: (dealId: string) => void;
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id, data: { deal } });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const amount = formatAmount(deal.amount, deal.currency);
  const closeDate = formatShortDate(deal.expectedCloseDate);
  const contactName = deal.dealContacts?.[0]?.contact?.displayName;
  const priorityColor =
    deal.priority === 'URGENT'
      ? 'error'
      : deal.priority === 'HIGH'
        ? 'warning'
        : undefined;

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Don't navigate if dragging
        if (!isDragging && onClick) {
          e.stopPropagation();
          onClick(deal.id);
        }
      }}
      sx={{
        p: 1.5,
        mb: 1,
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: 1,
        borderColor: isDragging ? 'primary.main' : 'divider',
        cursor: isDragging ? 'grabbing' : 'grab',
        '&:hover, &:focus-visible': {
          borderColor: 'primary.light',
          boxShadow: 1,
          outline: 'none',
        },
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* Deal name */}
      <Typography variant="body2" fontWeight={600} noWrap sx={{ mb: 0.5 }}>
        {deal.name}
      </Typography>

      {/* Amount */}
      {amount && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <DollarSign size={14} style={{ opacity: 0.5 }} />
          <Typography variant="body2" fontWeight={500}>
            {amount}
          </Typography>
        </Box>
      )}

      {/* Bottom row: contact + close date + priority + score */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        {contactName && (
          <Tooltip title={contactName}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
              <User size={12} style={{ opacity: 0.5 }} />
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ maxWidth: 100 }}
              >
                {contactName}
              </Typography>
            </Box>
          </Tooltip>
        )}
        {closeDate && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            <Calendar size={12} style={{ opacity: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              {closeDate}
            </Typography>
          </Box>
        )}
        {deal.priority && priorityColor && (
          <Chip
            label={deal.priority}
            size="small"
            color={priorityColor}
            variant="outlined"
            sx={{ height: 18, fontSize: '0.65rem' }}
          />
        )}
        {deal.score > 0 && (
          <Box sx={{ ml: 'auto' }}>
            <DealScoreBadge score={deal.score} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
