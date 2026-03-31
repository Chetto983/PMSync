import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import {
  Briefcase,
  ArrowRightLeft,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Box, Paper, Typography, Chip } from '@mui/material';
import type {
  CrmDealListResult,
  CrmDealMoveResult,
  CrmTimelineResult,
} from '../types';

// ---- get_deals_by_pipeline ----

export function DealListRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmDealListResult>) {
  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <Briefcase size={16} />
          <Typography variant="body2">Loading deals...</Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete' || !result || result.error) {
    return (
      <Box sx={{ borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <AlertTriangle size={16} />
          <Typography variant="body2">{result?.error ?? 'Failed to load deals'}</Typography>
        </Box>
      </Box>
    );
  }

  const deals = result.deals ?? [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Briefcase size={16} color="var(--mui-palette-primary-main)" />
          <Typography variant="body2" fontWeight={500}>
            {result.pipeline ?? 'Deals'}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {result.count ?? deals.length} deal{(result.count ?? deals.length) !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {deals.map((deal, i) => (
        <Box
          key={deal.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 0.75,
            ...(i > 0 ? { borderTop: 1, borderColor: 'divider' } : {}),
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {deal.name}
            </Typography>
            {deal.account && (
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {deal.account}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Chip label={deal.stage} size="small" variant="outlined" />
            {deal.amount != null && (
              <Typography variant="caption" fontWeight={500}>
                {deal.currency ?? '$'}{deal.amount.toLocaleString()}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Paper>
  );
}

// ---- move_deal_stage ----

export function DealMoveRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmDealMoveResult>) {
  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <ArrowRightLeft size={16} />
          <Typography variant="body2">Moving deal...</Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete' || !result || result.error) {
    return (
      <Box sx={{ borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <AlertTriangle size={16} />
          <Typography variant="body2">{result?.error ?? 'Failed to move deal'}</Typography>
        </Box>
      </Box>
    );
  }

  if (result.message) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5 }}>
        <Typography variant="body2">{result.message}</Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <ArrowRightLeft size={16} color="var(--mui-palette-success-main)" />
        <Typography variant="body2" fontWeight={500}>
          Deal Moved
        </Typography>
      </Box>
      <Typography variant="body2">
        <strong>{result.deal}</strong>: {result.from} → {result.to}
      </Typography>
      {result.probability != null && (
        <Typography variant="caption" color="text.secondary">
          New probability: {result.probability}%
        </Typography>
      )}
    </Paper>
  );
}

// ---- get_deal_timeline ----

const ACTIVITY_ICONS: Record<string, string> = {
  STAGE_CHANGE: '↔',
  NOTE: '📝',
  EMAIL: '✉',
  CALL: '📞',
  MEETING: '🤝',
  TASK: '✓',
};

export function DealTimelineRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmTimelineResult>) {
  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <Clock size={16} />
          <Typography variant="body2">Loading timeline...</Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete' || !result || result.error) {
    return (
      <Box sx={{ borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <AlertTriangle size={16} />
          <Typography variant="body2">{result?.error ?? 'Failed to load timeline'}</Typography>
        </Box>
      </Box>
    );
  }

  const activities = result.activities ?? [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Clock size={16} color="var(--mui-palette-primary-main)" />
          <Typography variant="body2" fontWeight={500}>
            {result.deal ?? 'Deal'} Timeline
          </Typography>
        </Box>
        {result.currentStage && (
          <Chip label={result.currentStage} size="small" variant="outlined" />
        )}
      </Box>

      {activities.slice(0, 10).map((activity, i) => (
        <Box
          key={`${activity.date}-${i}`}
          sx={{
            display: 'flex',
            gap: 1,
            py: 0.5,
            ...(i > 0 ? { borderTop: 1, borderColor: 'divider' } : {}),
          }}
        >
          <Typography variant="caption" sx={{ flexShrink: 0, width: 20, textAlign: 'center' }}>
            {ACTIVITY_ICONS[activity.type] ?? '•'}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" noWrap>
              {activity.content}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              {new Date(activity.date).toLocaleDateString()}
            </Typography>
          </Box>
        </Box>
      ))}

      {activities.length > 10 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          +{activities.length - 10} more activities
        </Typography>
      )}
    </Paper>
  );
}
