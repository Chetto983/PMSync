/**
 * AI Action Buttons Component
 *
 * Toolbar buttons for AI features in email view:
 * - Summarize
 * - Priority Analysis
 * - Sentiment Analysis
 *
 * Part of Phase 8: AI Integration
 */
import { memo, useState } from 'react';
import { Box, Button, Tooltip, CircularProgress, Divider } from '@mui/material';


import { FileText as SummarizeIcon, AlertTriangle as PriorityHighIcon, Smile as SentimentSatisfiedAltIcon } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';
import { useEmailSummarizeMutation, PriorityResult, SentimentResult } from '@/hooks/ai';
import { aiApi } from '@/lib/api/ai';

interface AiActionButtonsProps {
  emailId: string;
  /** Callback when summary is generated */
  onSummaryGenerated: (summary: string) => void;
  /** Whether summary panel is shown */
  showSummary: boolean;
  /** Toggle summary panel visibility */
  onToggleSummary: () => void;
  /** Whether summary already exists */
  hasSummary: boolean;
  /** Existing AI priority from triage (1=highest, 5=lowest) */
  existingPriority?: number | null;
  /** Existing AI priority reason from triage */
  existingPriorityReason?: string | null;
  /** Existing AI sentiment from triage */
  existingSentiment?: string | null;
}

// Helper to get priority color
const getPriorityColor = (urgency?: string) => {
  switch (urgency) {
    case 'high': return 'error.main';
    case 'medium': return 'warning.main';
    case 'low': return 'success.main';
    default: return 'text.secondary';
  }
};

// Helper to get sentiment color
const getSentimentColor = (sent?: string) => {
  switch (sent) {
    case 'positive': return 'success.main';
    case 'negative': return 'error.main';
    case 'mixed': return 'warning.main';
    default: return 'text.secondary';
  }
};

export const AiActionButtons = memo(function AiActionButtons({
  emailId,
  onSummaryGenerated,
  showSummary,
  onToggleSummary,
  hasSummary,
  existingPriority,
  existingPriorityReason,
  existingSentiment,
}: AiActionButtonsProps) {
  const t = useTranslations();
  const { locale } = useLocale();

  // Map numeric priority (1-5) to urgency string
  const mapPriorityToUrgency = (p: number): 'high' | 'medium' | 'low' => {
    if (p <= 2) return 'high';
    if (p <= 3) return 'medium';
    return 'low';
  };

  // Priority & Sentiment state - initialize from existing data if available
  const [priority, setPriority] = useState<PriorityResult | null>(() => {
    if (existingPriority != null) {
      const urgency = mapPriorityToUrgency(existingPriority);
      return {
        score: existingPriority,
        urgency,
        recommendation: 'handle_today',
        factors: existingPriorityReason ? [existingPriorityReason] : [],
      };
    }
    return null;
  });
  const [sentiment, setSentiment] = useState<SentimentResult | null>(() => {
    if (existingSentiment) {
      return {
        sentiment: existingSentiment as 'positive' | 'negative' | 'neutral' | 'mixed',
        tone: existingSentiment,
        emotion: '',
        emotionalIntensity: 0.5,
        churnRisk: false,
        confidence: 0.8,
      };
    }
    return null;
  });
  const [isAnalyzingPriority, setIsAnalyzingPriority] = useState(false);
  const [isAnalyzingSentiment, setIsAnalyzingSentiment] = useState(false);

  // AI Mutations
  const summarizeMutation = useEmailSummarizeMutation();

  const handleSummarize = async () => {
    if (hasSummary) {
      onToggleSummary();
      return;
    }
    try {
      const result = await summarizeMutation.mutateAsync({ emailId, locale });
      onSummaryGenerated(result);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleAnalyzePriority = async () => {
    if (priority) return;
    setIsAnalyzingPriority(true);
    try {
      const response = await aiApi.calculatePriority(emailId, locale);
      if (response.data.success) {
        setPriority(response.data as PriorityResult);
      }
    } catch {
      // Silently fail
    } finally {
      setIsAnalyzingPriority(false);
    }
  };

  const handleAnalyzeSentiment = async () => {
    if (sentiment) return;
    setIsAnalyzingSentiment(true);
    try {
      const response = await aiApi.analyzeSentiment(emailId, locale);
      if (response.data.success) {
        setSentiment(response.data as SentimentResult);
      }
    } catch {
      // Silently fail
    } finally {
      setIsAnalyzingSentiment(false);
    }
  };

  // Get translated priority label
  const getPriorityLabel = () => {
    if (!priority) return t.threadMessage?.ai?.priority || 'Priority';
    const key = `${priority.urgency}Priority` as 'highPriority' | 'mediumPriority' | 'lowPriority';
    return t.threadMessage?.ai?.[key] || priority.urgency;
  };

  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Button
        size="small"
        variant="text"
        startIcon={
          summarizeMutation.isPending ? (
            <CircularProgress size={14} />
          ) : (
            <SummarizeIcon size={16} />
          )
        }
        onClick={handleSummarize}
        disabled={summarizeMutation.isPending}
        sx={{
          textTransform: 'none',
          color: showSummary ? 'primary.main' : 'text.secondary',
        }}
      >
        {summarizeMutation.isPending
          ? t.threadMessage?.ai?.summarizing || 'Summarizing...'
          : t.threadMessage?.ai?.summarize || 'Summarize'}
      </Button>

      <Tooltip
        title={
          priority
            ? `${getPriorityLabel()} - ${priority.recommendation?.replace(/_/g, ' ')}`
            : t.threadMessage?.ai?.priority || 'Priority'
        }
      >
        <Button
          size="small"
          variant="text"
          startIcon={
            isAnalyzingPriority ? (
              <CircularProgress size={14} />
            ) : (
              <PriorityHighIcon size={16} />
            )
          }
          onClick={handleAnalyzePriority}
          disabled={isAnalyzingPriority}
          sx={{
            textTransform: 'none',
            color: priority ? getPriorityColor(priority.urgency) : 'text.secondary',
            minWidth: 'auto',
          }}
        >
          {getPriorityLabel()}
        </Button>
      </Tooltip>

      <Tooltip
        title={
          sentiment
            ? `${sentiment.tone || sentiment.sentiment} - ${sentiment.emotion || ''}`
            : t.threadMessage?.ai?.sentiment || 'Sentiment'
        }
      >
        <Button
          size="small"
          variant="text"
          startIcon={
            isAnalyzingSentiment ? (
              <CircularProgress size={14} />
            ) : (
              <SentimentSatisfiedAltIcon size={16} />
            )
          }
          onClick={handleAnalyzeSentiment}
          disabled={isAnalyzingSentiment}
          sx={{
            textTransform: 'none',
            color: sentiment ? getSentimentColor(sentiment.sentiment) : 'text.secondary',
            minWidth: 'auto',
          }}
        >
          {sentiment
            ? t.threadMessage?.ai?.[sentiment.sentiment] || sentiment.sentiment
            : t.threadMessage?.ai?.sentiment || 'Sentiment'}
        </Button>
      </Tooltip>
    </Box>
  );
});

export default AiActionButtons;
