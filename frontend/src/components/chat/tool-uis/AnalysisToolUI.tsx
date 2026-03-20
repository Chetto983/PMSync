import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Brain, AlertTriangle, Clock, TrendingUp, MessageSquare } from 'lucide-react';
import { Box, Paper, Typography } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { AnalysisResult } from '../types';

type SentimentKey = 'positive' | 'negative' | 'neutral' | 'mixed';
type UrgencyKey = 'critical' | 'high' | 'medium' | 'low';

const sentimentSx: Record<SentimentKey, { bgcolor: string; color: string }> = {
  positive: { bgcolor: 'success.light', color: 'success.main' },
  negative: { bgcolor: 'error.light', color: 'error.main' },
  neutral: { bgcolor: 'action.hover', color: 'text.secondary' },
  mixed: { bgcolor: 'warning.light', color: 'warning.main' },
};

const urgencySx: Record<UrgencyKey, { bgcolor: string; color: string }> = {
  critical: { bgcolor: 'error.main', color: 'common.white' },
  high: { bgcolor: 'error.light', color: 'error.main' },
  medium: { bgcolor: 'warning.light', color: 'warning.main' },
  low: { bgcolor: 'action.hover', color: 'text.secondary' },
};

export function AnalysisRenderer({
  status,
  result,
}: ToolCallMessagePartProps<
  { emailId: string },
  AnalysisResult
>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <Brain size={16} />
          <Typography variant="body2">{tu?.analyzingEmail || 'Analyzing email...'}</Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete') {
    return (
      <Box sx={{ borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <AlertTriangle size={16} />
          <Typography variant="body2">{tu?.analysisFailed || 'Analysis failed'}</Typography>
        </Box>
      </Box>
    );
  }

  if (!result || result.error) {
    return (
      <Box sx={{ borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <AlertTriangle size={16} />
          <Typography variant="body2">{result?.error ?? 'Unknown error'}</Typography>
        </Box>
      </Box>
    );
  }

  const { analysis, subject, from, summary } = result;
  const sentimentStyle = sentimentSx[(analysis.sentiment as SentimentKey)] ?? sentimentSx.neutral;
  const urgencyStyle = urgencySx[(analysis.urgency as UrgencyKey)] ?? urgencySx.low;

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Brain size={16} color="var(--mui-palette-primary-main)" />
            <Typography
              variant="body2"
              fontWeight={500}
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}
            >
              {subject ?? from}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            <Box
              component="span"
              sx={{ px: 0.75, py: 0.25, fontSize: '0.75rem', borderRadius: '9999px', ...sentimentStyle }}
            >
              {analysis.sentiment}
            </Box>
            <Box
              component="span"
              sx={{ px: 0.75, py: 0.25, fontSize: '0.75rem', borderRadius: '9999px', ...urgencyStyle }}
            >
              {analysis.urgency}
            </Box>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary">{summary}</Typography>

        {analysis.keyTopics.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {analysis.keyTopics.map((topic) => (
              <Box
                key={topic}
                component="span"
                sx={{ px: 1, py: 0.25, fontSize: '0.75rem', borderRadius: '9999px', bgcolor: 'action.selected', color: 'text.secondary' }}
              >
                {topic}
              </Box>
            ))}
          </Box>
        )}

        {analysis.suggestedResponse && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
            <MessageSquare size={14} color="var(--mui-palette-primary-main)" style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary">{analysis.suggestedResponse}</Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}>
          {analysis.deadline && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'warning.main' }}>
              <Clock size={12} />
              <Typography variant="caption">{(tu?.deadline || 'Deadline: {value}').replace('{value}', analysis.deadline)}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TrendingUp size={12} />
            <Typography variant="caption">{(tu?.priority || 'Priority: {value}/10').replace('{value}', String(analysis.priority))}</Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
