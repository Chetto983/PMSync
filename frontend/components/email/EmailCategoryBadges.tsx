/**
 * EmailCategoryBadges Component
 *
 * Displays AI-suggested email categories/labels with:
 * - Color-coded badges
 * - Click-to-apply functionality
 * - Loading and error states
 */
import React from 'react';
import {
  Box,
  Chip,
  Tooltip,
  Typography,
  CircularProgress,
  Skeleton,
} from '@mui/material';
import {
  Tag,
  Star,
  Clock,
  CheckSquare,
  Info,
  User,
  DollarSign,
  Megaphone,
  Bell,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface EmailCategoryBadgesProps {
  /** Suggested labels from AI */
  labels?: string[];
  /** Loading state */
  isLoading?: boolean;
  /** Error message */
  error?: string;
  /** Callback when a label is clicked */
  onLabelClick?: (label: string) => void;
  /** Maximum labels to display */
  maxLabels?: number;
  /** Show AI indicator */
  showAiIndicator?: boolean;
  /** Size of the badges */
  size?: 'small' | 'medium';
}

// Label to icon and color mapping
const LABEL_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  important: { icon: <Star size={12} />, color: '#F57C00', bg: '#FFF3E0' },
  'follow-up': { icon: <Clock size={12} />, color: '#1976D2', bg: '#E3F2FD' },
  'action items': { icon: <CheckSquare size={12} />, color: '#388E3C', bg: '#E8F5E9' },
  info: { icon: <Info size={12} />, color: '#7B1FA2', bg: '#F3E5F5' },
  personal: { icon: <User size={12} />, color: '#0097A7', bg: '#E0F7FA' },
  finance: { icon: <DollarSign size={12} />, color: '#689F38', bg: '#F1F8E9' },
  promotions: { icon: <Megaphone size={12} />, color: '#E64A19', bg: '#FBE9E7' },
  updates: { icon: <Bell size={12} />, color: '#5C6BC0', bg: '#E8EAF6' },
};

// Default config for unknown labels
const DEFAULT_LABEL_CONFIG = { icon: <Tag size={12} />, color: '#757575', bg: '#F5F5F5' };

function getLabelConfig(label: string) {
  const normalizedLabel = label.toLowerCase();
  return LABEL_CONFIG[normalizedLabel] || DEFAULT_LABEL_CONFIG;
}

export function EmailCategoryBadges({
  labels = [],
  isLoading = false,
  error,
  onLabelClick,
  maxLabels = 3,
  showAiIndicator = true,
  size = 'small',
}: EmailCategoryBadgesProps) {
  const translations = useTranslations();
  const t = translations.ai.learning;

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <CircularProgress size={12} />
        <Skeleton variant="rounded" width={60} height={20} />
        <Skeleton variant="rounded" width={50} height={20} />
      </Box>
    );
  }

  if (error) {
    return (
      <Tooltip title={error}>
        <Chip
          size="small"
          icon={<AlertTriangle size={12} />}
          label={t.categorizationFailed}
          color="error"
          variant="outlined"
          sx={{ height: size === 'small' ? 20 : 24 }}
        />
      </Tooltip>
    );
  }

  if (!labels || labels.length === 0) {
    return null;
  }

  const displayLabels = labels.slice(0, maxLabels);
  const hiddenCount = labels.length - displayLabels.length;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
      {/* AI indicator */}
      {showAiIndicator && (
        <Tooltip title={t.suggestedByAi}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              color: 'primary.main',
              mr: 0.5,
            }}
          >
            <Sparkles size={12} />
          </Box>
        </Tooltip>
      )}

      {/* Label badges */}
      {displayLabels.map((label) => {
        const config = getLabelConfig(label);
        return (
          <Chip
            key={label}
            size={size}
            icon={<Box sx={{ display: 'flex', color: config.color }}>{config.icon}</Box>}
            label={label}
            onClick={onLabelClick ? () => onLabelClick(label) : undefined}
            sx={{
              height: size === 'small' ? 20 : 24,
              fontSize: size === 'small' ? '0.65rem' : '0.75rem',
              bgcolor: config.bg,
              color: config.color,
              border: `1px solid ${config.color}20`,
              cursor: onLabelClick ? 'pointer' : 'default',
              '&:hover': onLabelClick
                ? {
                    bgcolor: `${config.color}20`,
                    borderColor: config.color,
                  }
                : undefined,
              '& .MuiChip-icon': {
                color: config.color,
                marginLeft: '4px',
              },
            }}
            variant="outlined"
          />
        );
      })}

      {/* Hidden count indicator */}
      {hiddenCount > 0 && (
        <Tooltip title={labels.slice(maxLabels).join(', ')}>
          <Chip
            size={size}
            label={`+${hiddenCount}`}
            sx={{
              height: size === 'small' ? 20 : 24,
              fontSize: size === 'small' ? '0.65rem' : '0.75rem',
              bgcolor: 'grey.100',
              color: 'grey.600',
            }}
            variant="outlined"
          />
        </Tooltip>
      )}
    </Box>
  );
}

/**
 * Inline category badge for email list items
 */
export function InlineCategoryBadge({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  const config = getLabelConfig(label);

  return (
    <Typography
      component="span"
      variant="caption"
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        px: 0.75,
        py: 0.25,
        borderRadius: 1,
        bgcolor: config.bg,
        color: config.color,
        fontSize: '0.65rem',
        fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick
          ? {
              bgcolor: `${config.color}20`,
            }
          : undefined,
      }}
    >
      {config.icon}
      {label}
    </Typography>
  );
}

export default EmailCategoryBadges;
