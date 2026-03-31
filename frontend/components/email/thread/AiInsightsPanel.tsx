/**
 * AI Insights Panel Component
 *
 * Displays AI-generated summary for an email.
 *
 * Part of Phase 8: AI Integration
 */
import { memo } from 'react';
import { Box, Typography, Paper, Collapse, Chip } from '@mui/material';
import { Sparkles as AutoAwesomeIcon } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface AiInsightsPanelProps {
  /** Show summary panel */
  showSummary: boolean;
  /** Summary text */
  summary: string | null;
  /** Existing AI priority */
  priority?: number | null;
  /** Existing AI priority reason */
  priorityReason?: string | null;
  /** Existing AI sentiment */
  sentiment?: string | null;
}

export const AiInsightsPanel = memo(function AiInsightsPanel({
  showSummary,
  summary,
  priority,
  priorityReason,
  sentiment,
}: AiInsightsPanelProps) {
  const t = useTranslations();
  const hasSummary = showSummary && !!summary;
  const hasTriageInsight = Boolean(priorityReason || sentiment || priority != null);

  const getSentimentColor = (value?: string | null) => {
    switch (value) {
      case 'positive':
        return 'success';
      case 'negative':
        return 'error';
      case 'mixed':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Collapse in={hasSummary || hasTriageInsight}>
      <Box sx={{ px: 2, pb: 2, pl: 7.5 }}>
        <Paper
          elevation={0}
          sx={{
            p: 2,
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'primary.900' : 'primary.50',
            borderRadius: 2,
            border: 1,
            borderColor: 'primary.200',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <AutoAwesomeIcon size={16} style={{ color: 'var(--mui-palette-primary-main)' }} />
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              {hasTriageInsight ? 'AI Insights' : 'AI Summary'}
            </Typography>
          </Box>
          {hasTriageInsight && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: hasSummary || priorityReason ? 1.25 : 0 }}>
              {priority != null && (
                <Chip
                  size="small"
                  color={priority <= 2 ? 'error' : priority <= 3 ? 'warning' : 'success'}
                  label={`${t.threadMessage?.ai?.priority || 'Priority'} ${priority}/5`}
                  sx={{ fontWeight: 600 }}
                />
              )}
              {sentiment && (
                <Chip
                  size="small"
                  color={getSentimentColor(sentiment)}
                  variant="outlined"
                  label={t.threadMessage?.ai?.[sentiment as 'positive' | 'negative' | 'neutral' | 'mixed'] || sentiment}
                  sx={{ fontWeight: 500 }}
                />
              )}
            </Box>
          )}
          {priorityReason && (
            <Typography variant="body2" color="text.primary" sx={{ mb: hasSummary ? 1.25 : 0 }}>
              {priorityReason}
            </Typography>
          )}
          {hasSummary && (
            <Typography variant="body2" color="text.primary">
              {summary}
            </Typography>
          )}
        </Paper>
      </Box>
    </Collapse>
  );
});

export default AiInsightsPanel;
