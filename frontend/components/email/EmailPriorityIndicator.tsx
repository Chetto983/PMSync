/**
 * EmailPriorityIndicator Component
 *
 * Displays email priority with multi-factor scoring:
 * - Priority score (1-10) with visual gauge
 * - Urgency level color coding
 * - Recommendation badge
 * - Contributing factors on hover/expand
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
  LinearProgress,
} from '@mui/material';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  Archive,
  ChevronDown,
  ChevronUp,
  Zap,
  Calendar,
  CalendarClock,
  Timer,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { PriorityResult } from '@/lib/api/ai';

interface EmailPriorityIndicatorProps {
  /** Priority calculation result */
  priority?: PriorityResult;
  /** Loading state */
  isLoading?: boolean;
  /** Compact mode (chip only) */
  compact?: boolean;
  /** Show factors breakdown */
  showFactors?: boolean;
  /** Error message */
  error?: string;
}

// Urgency to color mapping
const URGENCY_COLORS: Record<string, { bg: string; text: string; border: string; progress: string }> = {
  high: { bg: '#FFEBEE', text: '#C62828', border: '#EF9A9A', progress: '#F44336' },
  medium: { bg: '#FFF3E0', text: '#E65100', border: '#FFB74D', progress: '#FF9800' },
  low: { bg: '#E8F5E9', text: '#2E7D32', border: '#81C784', progress: '#4CAF50' },
};

// Recommendation to icon and default label mapping
const RECOMMENDATION_CONFIG: Record<string, { icon: React.ReactNode; defaultLabel: string }> = {
  handle_now: { icon: <Zap size={14} />, defaultLabel: 'Handle Now' },
  handle_today: { icon: <Timer size={14} />, defaultLabel: 'Handle Today' },
  handle_this_week: { icon: <CalendarClock size={14} />, defaultLabel: 'This Week' },
  can_wait: { icon: <Calendar size={14} />, defaultLabel: 'Can Wait' },
  archive: { icon: <Archive size={14} />, defaultLabel: 'Archive' },
};

// Urgency icons
const URGENCY_ICONS: Record<string, React.ReactNode> = {
  high: <AlertTriangle size={16} />,
  medium: <Clock size={16} />,
  low: <CheckCircle size={16} />,
};

// Helper type for AI translations
type AiTranslations = {
  handleNow?: string;
  handleToday?: string;
  handleThisWeek?: string;
  canWait?: string;
  archive?: string;
  calculatingPriority?: string;
  priorityError?: string;
  priority?: string;
  urgency?: string;
  recommendation?: string;
  factors?: string;
  contributingFactors?: string;
  [key: string]: unknown;
};

// Helper to get recommendation label
function getRecommendationLabel(
  recommendation: string,
  t: AiTranslations | undefined,
): string {
  const config = RECOMMENDATION_CONFIG[recommendation] || RECOMMENDATION_CONFIG.handle_this_week;
  const keyMap: Record<string, string | undefined> = {
    handle_now: t?.handleNow,
    handle_today: t?.handleToday,
    handle_this_week: t?.handleThisWeek,
    can_wait: t?.canWait,
    archive: t?.archive,
  };
  return keyMap[recommendation] ?? config.defaultLabel;
}

export function EmailPriorityIndicator({
  priority,
  isLoading = false,
  compact = false,
  showFactors = true,
  error,
}: EmailPriorityIndicatorProps) {
  const translations = useTranslations();
  const t = translations.ai;
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="caption" color="text.secondary">
          {t?.calculatingPriority ?? 'Calculating priority...'}
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Chip
        size="small"
        icon={<AlertTriangle size={14} />}
        label={t?.priorityError ?? 'Priority calculation failed'}
        color="error"
        variant="outlined"
      />
    );
  }

  if (!priority) {
    return null;
  }

  const colors = URGENCY_COLORS[priority.urgency] || URGENCY_COLORS.medium;
  const icon = URGENCY_ICONS[priority.urgency] || URGENCY_ICONS.medium;
  const recommendation = RECOMMENDATION_CONFIG[priority.recommendation] || RECOMMENDATION_CONFIG.handle_this_week;
  const recommendationLabel = getRecommendationLabel(priority.recommendation, t as AiTranslations);

  // Compact chip-only view
  if (compact) {
    return (
      <Tooltip
        title={
          <Box>
            <Typography variant="caption" display="block">
              <strong>{t?.priority ?? 'Priority'}:</strong> {priority.score}/10
            </Typography>
            <Typography variant="caption" display="block">
              <strong>{t?.urgency ?? 'Urgency'}:</strong> {priority.urgency}
            </Typography>
            <Typography variant="caption" display="block">
              <strong>{t?.recommendation ?? 'Action'}:</strong> {recommendationLabel}
            </Typography>
            {priority.factors.length > 0 && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                <strong>{t?.factors ?? 'Factors'}:</strong> {priority.factors.slice(0, 3).join(', ')}
              </Typography>
            )}
          </Box>
        }
        arrow
      >
        <Chip
          size="small"
          icon={<Box sx={{ display: 'flex', color: colors.text }}>{icon}</Box>}
          label={`P${priority.score}`}
          sx={{
            bgcolor: colors.bg,
            color: colors.text,
            borderColor: colors.border,
            fontWeight: 600,
            '& .MuiChip-icon': { color: colors.text },
          }}
          variant="outlined"
        />
      </Tooltip>
    );
  }

  // Full view with expandable factors
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
            {t?.priority ?? 'Priority'}: {priority.score}/10
          </Typography>

          {/* Urgency badge */}
          <Chip
            size="small"
            label={priority.urgency.toUpperCase()}
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 700,
              bgcolor: colors.text,
              color: 'white',
            }}
          />
        </Box>

        {/* Recommendation and expand */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            size="small"
            icon={<Box sx={{ display: 'flex' }}>{recommendation.icon}</Box>}
            label={recommendationLabel}
            sx={{ height: 24, fontSize: '0.7rem' }}
            variant="outlined"
          />
          {showFactors && priority.factors.length > 0 && (
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Priority bar */}
      <Box sx={{ mt: 1.5 }}>
        <LinearProgress
          variant="determinate"
          value={priority.score * 10}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: 'rgba(0,0,0,0.1)',
            '& .MuiLinearProgress-bar': {
              bgcolor: colors.progress,
              borderRadius: 3,
            },
          }}
        />
      </Box>

      {/* Factors breakdown */}
      {showFactors && priority.factors.length > 0 && (
        <Collapse in={expanded}>
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px dashed ${colors.border}` }}>
            <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
              {t?.contributingFactors ?? 'Contributing Factors'}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {priority.factors.map((factor, index) => (
                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      bgcolor: colors.text,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {factor}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

export default EmailPriorityIndicator;
