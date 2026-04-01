import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import {
  Target,
  AlertTriangle,
  ShieldAlert,
  BarChart3,
} from 'lucide-react';
import { Box, Paper, Typography, Chip, LinearProgress } from '@mui/material';
import type {
  CrmLeadScoreResult,
  CrmTopLeadsResult,
  CrmChurnRiskResult,
  CrmChurnAtRiskResult,
  CrmForecastResult,
} from '../types';

// ---- Shared helpers ----

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

function LoadingCard({ icon: Icon, text }: { icon: typeof Target; text: string }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        <Icon size={16} />
        <Typography variant="body2">{text}</Typography>
      </Box>
    </Paper>
  );
}

function tierColor(tier: string): 'success' | 'warning' | 'error' {
  if (tier === 'hot') return 'success';
  if (tier === 'warm') return 'warning';
  return 'error';
}

function riskColor(level: string): 'error' | 'warning' | 'success' {
  const l = level.toUpperCase();
  if (l === 'HIGH') return 'error';
  if (l === 'MEDIUM') return 'warning';
  return 'success';
}

// ---- get_lead_score ----

export function LeadScoreRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmLeadScoreResult>) {
  if (status.type === 'running') return <LoadingCard icon={Target} text="Fetching lead score..." />;
  if (status.type === 'incomplete' || !result || result.error) {
    return <ErrorCard error={result?.error ?? 'Failed to load lead score'} />;
  }

  const score = result.score ?? 0;
  const tier = result.tier ?? 'cold';

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Target size={16} color="var(--mui-palette-primary-main)" />
          <Typography variant="body2" fontWeight={500}>
            {result.contactName ?? 'Contact'} — Lead Score
          </Typography>
        </Box>
        <Chip label={tier.toUpperCase()} size="small" color={tierColor(tier)} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <Typography variant="h5" fontWeight={700} color={`${tierColor(tier)}.main`}>
          {score}
        </Typography>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={score}
            color={tierColor(tier)}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
      </Box>

      {result.confidence != null && (
        <Typography variant="caption" color="text.secondary">
          Confidence: {Math.round(result.confidence * 100)}%
          {result.computedAt && ` · Last computed: ${new Date(result.computedAt).toLocaleDateString()}`}
        </Typography>
      )}
    </Paper>
  );
}

// ---- list_top_leads ----

export function TopLeadsRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmTopLeadsResult>) {
  if (status.type === 'running') return <LoadingCard icon={Target} text="Ranking leads..." />;
  if (status.type === 'incomplete' || !result || result.error) {
    return <ErrorCard error={result?.error ?? 'Failed to load leads'} />;
  }

  const leads = result.leads ?? [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Target size={16} color="var(--mui-palette-primary-main)" />
          <Typography variant="body2" fontWeight={500}>Top Leads</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {result.count ?? leads.length} lead{(result.count ?? leads.length) !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {leads.map((lead, i) => (
        <Box
          key={lead.contactId}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 0.5,
            ...(i > 0 ? { borderTop: 1, borderColor: 'divider' } : {}),
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {lead.name}
            </Typography>
            {lead.email && (
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {lead.email}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Typography variant="body2" fontWeight={600} color={`${tierColor(lead.tier)}.main`}>
              {lead.score}
            </Typography>
            <Chip label={lead.tier} size="small" color={tierColor(lead.tier)} sx={{ minWidth: 48 }} />
          </Box>
        </Box>
      ))}
    </Paper>
  );
}

// ---- get_churn_risk ----

export function ChurnRiskRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmChurnRiskResult>) {
  if (status.type === 'running') return <LoadingCard icon={ShieldAlert} text="Assessing churn risk..." />;
  if (status.type === 'incomplete' || !result || result.error) {
    return <ErrorCard error={result?.error ?? 'Failed to load churn risk'} />;
  }

  if (result.message) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5 }}>
        <Typography variant="body2">{result.message}</Typography>
      </Paper>
    );
  }

  const name = result.contactName || result.accountName || 'Entity';
  const level = result.riskLevel ?? 'LOW';

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldAlert size={16} color="var(--mui-palette-warning-main)" />
          <Typography variant="body2" fontWeight={500}>
            {name} — Churn Risk
          </Typography>
        </Box>
        <Chip label={level} size="small" color={riskColor(level)} />
      </Box>

      {result.probability != null && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <Typography variant="h6" fontWeight={700} color={`${riskColor(level)}.main`}>
            {Math.round(result.probability * 100)}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={result.probability * 100}
            color={riskColor(level)}
            sx={{ flex: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}

      {result.reasoning && (
        <Typography variant="caption" color="text.secondary" display="block">
          {result.reasoning}
        </Typography>
      )}
    </Paper>
  );
}

// ---- list_churn_at_risk ----

export function ChurnAtRiskRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmChurnAtRiskResult>) {
  if (status.type === 'running') return <LoadingCard icon={ShieldAlert} text="Loading at-risk entities..." />;
  if (status.type === 'incomplete' || !result || result.error) {
    return <ErrorCard error={result?.error ?? 'Failed to load at-risk list'} />;
  }

  const items = result.atRisk ?? [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldAlert size={16} color="var(--mui-palette-warning-main)" />
          <Typography variant="body2" fontWeight={500}>At-Risk Entities</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {result.count ?? items.length}
        </Typography>
      </Box>

      {items.map((item, i) => (
        <Box
          key={`${item.contactId ?? item.accountId}-${i}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 0.5,
            ...(i > 0 ? { borderTop: 1, borderColor: 'divider' } : {}),
          }}
        >
          <Typography variant="body2" fontWeight={500} noWrap sx={{ flex: 1, minWidth: 0 }}>
            {item.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Typography variant="caption" fontWeight={600} color={`${riskColor(item.riskLevel ?? 'LOW')}.main`}>
              {Math.round((item.probability ?? 0) * 100)}%
            </Typography>
            <Chip label={item.riskLevel ?? 'LOW'} size="small" color={riskColor(item.riskLevel ?? 'LOW')} sx={{ minWidth: 48 }} />
          </Box>
        </Box>
      ))}
    </Paper>
  );
}

// ---- get_revenue_forecast ----

export function ForecastRenderer({
  status,
  result,
}: ToolCallMessagePartProps<Record<string, unknown>, CrmForecastResult>) {
  if (status.type === 'running') return <LoadingCard icon={BarChart3} text="Generating forecast..." />;
  if (status.type === 'incomplete' || !result || result.error) {
    return <ErrorCard error={result?.error ?? 'Failed to generate forecast'} />;
  }

  const forecasts = result.forecasts ?? [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BarChart3 size={16} color="var(--mui-palette-primary-main)" />
          <Typography variant="body2" fontWeight={500}>
            {result.pipeline ?? 'Pipeline'} — Forecast
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {result.period} · {result.method}
        </Typography>
      </Box>

      {forecasts.map((f, i) => (
        <Box
          key={f.label}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 0.5,
            ...(i > 0 ? { borderTop: 1, borderColor: 'divider' } : {}),
          }}
        >
          <Typography variant="body2" fontWeight={500}>
            {f.label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {f.actual != null && (
              <Typography variant="caption" color="text.secondary">
                Actual: ${f.actual.toLocaleString()}
              </Typography>
            )}
            <Typography variant="body2" fontWeight={600}>
              ${(f.predicted ?? 0).toLocaleString()}
            </Typography>
            {f.confidenceLow != null && f.confidenceHigh != null && (
              <Typography variant="caption" color="text.secondary">
                ({f.confidenceLow.toLocaleString()}–{f.confidenceHigh.toLocaleString()})
              </Typography>
            )}
          </Box>
        </Box>
      ))}

      {result.mae != null && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          MAE: {result.mae.toLocaleString()}
        </Typography>
      )}
    </Paper>
  );
}
