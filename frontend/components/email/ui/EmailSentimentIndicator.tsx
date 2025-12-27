/**
 * EmailSentimentIndicator Component
 *
 * Displays email sentiment analysis with 2025 best practices:
 * - Sentiment polarity with color coding
 * - Emotion detection with emoji indicators
 * - Churn risk warning
 * - Aspect-based sentiment breakdown on hover
 *
 * References:
 * - Aspect-Based Sentiment Analysis (ABSA)
 * - Emotion detection beyond polarity
 * - ChurnRisk tagging for escalation prediction
 */
import React, { useState } from 'react';
import {
  Box,
  Chip,
  Tooltip,
  Typography,
  CircularProgress,
  Collapse,
  IconButton,
} from '@mui/material';
import {
  Smile,
  Frown,
  Meh,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Heart,
  ThumbsUp,
  Zap,
  HelpCircle,
  AlertCircle,
  Angry,
  CloudRain,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { SentimentResult } from '@/lib/api/ai';

interface EmailSentimentIndicatorProps {
  /** Sentiment analysis result */
  sentiment?: SentimentResult;
  /** Loading state */
  isLoading?: boolean;
  /** Compact mode (chip only) */
  compact?: boolean;
  /** Show aspect breakdown */
  showAspects?: boolean;
  /** Error message */
  error?: string;
}

// Emotion to icon mapping
const EMOTION_ICONS: Record<string, React.ReactNode> = {
  joy: <Heart size={14} />,
  gratitude: <ThumbsUp size={14} />,
  excitement: <Zap size={14} />,
  neutral: <Meh size={14} />,
  concern: <HelpCircle size={14} />,
  frustration: <AlertCircle size={14} />,
  anger: <Angry size={14} />,
  disappointment: <CloudRain size={14} />,
  sadness: <Frown size={14} />,
};

// Sentiment to color mapping
const SENTIMENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  positive: { bg: '#E8F5E9', text: '#2E7D32', border: '#81C784' },
  negative: { bg: '#FFEBEE', text: '#C62828', border: '#EF9A9A' },
  neutral: { bg: '#F5F5F5', text: '#616161', border: '#BDBDBD' },
  mixed: { bg: '#FFF3E0', text: '#E65100', border: '#FFB74D' },
};

// Sentiment to icon mapping
const SENTIMENT_ICONS: Record<string, React.ReactNode> = {
  positive: <Smile size={16} />,
  negative: <Frown size={16} />,
  neutral: <Meh size={16} />,
  mixed: <AlertCircle size={16} />,
};

export function EmailSentimentIndicator({
  sentiment,
  isLoading = false,
  compact = false,
  showAspects = true,
  error,
}: EmailSentimentIndicatorProps) {
  const translations = useTranslations();
  const t = translations.ai.learning;
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="caption" color="text.secondary">
          {t.analyzingSentiment}
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Chip
        size="small"
        icon={<AlertTriangle size={14} />}
        label={t.sentimentError}
        color="error"
        variant="outlined"
      />
    );
  }

  if (!sentiment) {
    return null;
  }

  const colors = SENTIMENT_COLORS[sentiment.sentiment] || SENTIMENT_COLORS.neutral;
  const icon = SENTIMENT_ICONS[sentiment.sentiment] || SENTIMENT_ICONS.neutral;
  const emotionIcon = EMOTION_ICONS[sentiment.emotion] || EMOTION_ICONS.neutral;

  // Compact chip-only view
  if (compact) {
    return (
      <Tooltip
        title={
          <Box>
            <Typography variant="caption" display="block">
              <strong>{t.sentiment}:</strong> {sentiment.sentiment}
            </Typography>
            <Typography variant="caption" display="block">
              <strong>{t.emotion}:</strong> {sentiment.emotion}
            </Typography>
            <Typography variant="caption" display="block">
              <strong>{t.tone}:</strong> {sentiment.tone}
            </Typography>
            {sentiment.churnRisk && (
              <Typography variant="caption" display="block" color="error">
                <AlertTriangle size={12} style={{ marginRight: 4 }} />
                {t.churnRisk}
              </Typography>
            )}
          </Box>
        }
        arrow
      >
        <Chip
          size="small"
          icon={<Box sx={{ display: 'flex', color: colors.text }}>{icon}</Box>}
          label={sentiment.sentiment}
          sx={{
            bgcolor: colors.bg,
            color: colors.text,
            borderColor: colors.border,
            '& .MuiChip-icon': { color: colors.text },
          }}
          variant="outlined"
        />
      </Tooltip>
    );
  }

  // Full view with expandable aspects
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        bgcolor: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
    >
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ color: colors.text, display: 'flex' }}>{icon}</Box>
          <Typography variant="body2" fontWeight={600} sx={{ color: colors.text }}>
            {sentiment.sentiment.charAt(0).toUpperCase() + sentiment.sentiment.slice(1)}
          </Typography>

          {/* Emotion badge */}
          <Chip
            size="small"
            icon={<Box sx={{ display: 'flex' }}>{emotionIcon}</Box>}
            label={sentiment.emotion}
            sx={{ height: 20, fontSize: '0.7rem' }}
            variant="outlined"
          />

          {/* Churn risk warning */}
          {sentiment.churnRisk && (
            <Chip
              size="small"
              icon={<AlertTriangle size={12} />}
              label={t.escalation}
              color="error"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Box>

        {/* Confidence */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {Math.round(sentiment.confidence * 100)}%
          </Typography>
          {showAspects && sentiment.aspects && Object.keys(sentiment.aspects).length > 0 && (
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Tone and intensity */}
      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          <strong>{t.tone}:</strong> {sentiment.tone}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          <strong>{t.intensity}:</strong>{' '}
          {sentiment.emotionalIntensity > 0.7 ? t.levelHigh : sentiment.emotionalIntensity > 0.4 ? t.levelMedium : t.levelLow}
        </Typography>
      </Box>

      {/* Reasoning */}
      {sentiment.reasoning && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontStyle: 'italic' }}>
          {sentiment.reasoning}
        </Typography>
      )}

      {/* Aspect breakdown */}
      {showAspects && sentiment.aspects && (
        <Collapse in={expanded}>
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px dashed ${colors.border}` }}>
            <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
              {t.aspectBreakdown}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {Object.entries(sentiment.aspects).map(([aspect, value]) => {
                const aspectColors = SENTIMENT_COLORS[value] || SENTIMENT_COLORS.neutral;
                return (
                  <Chip
                    key={aspect}
                    size="small"
                    label={`${aspect}: ${value}`}
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      bgcolor: aspectColors.bg,
                      color: aspectColors.text,
                      borderColor: aspectColors.border,
                    }}
                    variant="outlined"
                  />
                );
              })}
            </Box>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

export default EmailSentimentIndicator;
