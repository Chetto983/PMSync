/**
 * AI Insights Panel Component
 *
 * Displays AI-generated summary for an email.
 *
 * Part of Phase 8: AI Integration
 */
import { memo } from 'react';
import { Box, Typography, Paper, Collapse } from '@mui/material';
import { Sparkles as AutoAwesomeIcon } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface AiInsightsPanelProps {
  /** Show summary panel */
  showSummary: boolean;
  /** Summary text */
  summary: string | null;
}

export const AiInsightsPanel = memo(function AiInsightsPanel({
  showSummary,
  summary,
}: AiInsightsPanelProps) {
  const t = useTranslations();

  return (
    <Collapse in={showSummary && !!summary}>
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
              {t.threadMessage?.ai?.summarize || 'AI Summary'}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.primary">
            {summary}
          </Typography>
        </Paper>
      </Box>
    </Collapse>
  );
});

export default AiInsightsPanel;
