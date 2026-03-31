import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { DollarSign, Activity, AlertTriangle } from 'lucide-react';
import { Box, Paper, Typography, Chip } from '@mui/material';
import type { CrmAiCostsResult, CrmModelPerformanceResult } from '../types';

function ErrorCard({ error }: { error: string }) {
  return (
    <Box sx={{ borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
        <AlertTriangle size={16} />
        <Typography variant="body2">{error}</Typography>
      </Box>
    </Box>
  );
}

// ---- get_ai_costs ----

export function AiCostsRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmAiCostsResult>) {
  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <DollarSign size={16} />
          <Typography variant="body2">Loading AI costs...</Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete' || !result || result.error) {
    return <ErrorCard error={result?.error ?? 'Failed to load costs'} />;
  }

  const features = result.features ?? [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DollarSign size={16} color="var(--mui-palette-primary-main)" />
          <Typography variant="body2" fontWeight={500}>AI Cost Breakdown</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Last {result.range ?? '30d'}
        </Typography>
      </Box>

      {features.map((f, i) => (
        <Box
          key={f.feature}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 0.5,
            ...(i > 0 ? { borderTop: 1, borderColor: 'divider' } : {}),
          }}
        >
          <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {f.feature}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary">
              {f.calls} calls
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {f.cost}
            </Typography>
          </Box>
        </Box>
      ))}

      <Box sx={{ borderTop: 2, borderColor: 'divider', mt: 0.5, pt: 0.5, display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" fontWeight={600}>Total</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {(result.totalTokens ?? 0).toLocaleString()} tokens
          </Typography>
          <Typography variant="body2" fontWeight={700}>
            {result.totalCost ?? '$0'}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

// ---- get_model_performance ----

export function ModelPerformanceRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmModelPerformanceResult>) {
  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <Activity size={16} />
          <Typography variant="body2">Loading model performance...</Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete' || !result || result.error) {
    return <ErrorCard error={result?.error ?? 'Failed to load model performance'} />;
  }

  const models = result.models ?? [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Activity size={16} color="var(--mui-palette-primary-main)" />
        <Typography variant="body2" fontWeight={500}>Model Performance</Typography>
      </Box>

      {models.map((m, i) => (
        <Box
          key={m.modelType}
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
              {m.modelType.replace(/_/g, ' ')}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              {m.version} · {new Date(m.lastTrained).toLocaleDateString()}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            {m.accuracy != null && (
              <Typography variant="body2" fontWeight={600}>
                {(m.accuracy * 100).toFixed(1)}%
              </Typography>
            )}
            <Chip
              label={m.isActive ? 'Active' : 'Inactive'}
              size="small"
              color={m.isActive ? 'success' : 'default'}
            />
          </Box>
        </Box>
      ))}
    </Paper>
  );
}
