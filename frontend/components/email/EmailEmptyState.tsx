/**
 * EmailEmptyState Component
 *
 * Modern empty state component for email lists with:
 * - Animated icon
 * - Gradient accents
 * - Action buttons
 * - Dark mode support
 * - i18n support
 */
import React from 'react';
import { Box, Typography, Button, alpha, useTheme } from '@mui/material';
import {
  Inbox,
  Mail,
  Send,
  Trash2,
  Star,
  Archive,
  Search,
  Tag,
  RefreshCcw,
  Plus,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface EmailEmptyStateProps {
  /** Type of empty state to display */
  type?: 'inbox' | 'sent' | 'trash' | 'starred' | 'archive' | 'search' | 'label' | 'unread' | 'default';
  /** Custom title */
  title?: string;
  /** Custom subtitle/description */
  subtitle?: string;
  /** Primary action button */
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

// Icon and color configuration for different empty state types
const EMPTY_STATE_CONFIG = {
  inbox: { icon: Inbox, color: '#55cae5' },
  sent: { icon: Send, color: '#7650ce' },
  trash: { icon: Trash2, color: '#ef5350' },
  starred: { icon: Star, color: '#FFB300' },
  archive: { icon: Archive, color: '#9c27b0' },
  search: { icon: Search, color: '#2196F3' },
  label: { icon: Tag, color: '#4CAF50' },
  unread: { icon: Mail, color: '#00C853' },
  default: { icon: Mail, color: '#757575' },
};

// Get translated text for empty state type
function getEmptyStateText(
  type: keyof typeof EMPTY_STATE_CONFIG,
  empty: Record<string, string | undefined> | undefined,
): { title: string; subtitle: string } {
  const fallbacks = {
    inbox: { title: 'Your inbox is empty', subtitle: 'All caught up! New emails will appear here.' },
    sent: { title: 'No sent emails', subtitle: 'Compose your first message to get started.' },
    trash: { title: 'Trash is empty', subtitle: 'Deleted emails will appear here for 30 days.' },
    starred: { title: 'No starred emails', subtitle: 'Star important emails to find them quickly.' },
    archive: { title: 'Archive is empty', subtitle: 'Archived emails will appear here.' },
    search: { title: 'No results found', subtitle: 'Try different keywords or clear filters.' },
    label: { title: 'No emails with this label', subtitle: 'Apply this label to emails to see them here.' },
    unread: { title: 'All caught up!', subtitle: 'You have no unread emails.' },
    default: { title: 'No emails', subtitle: 'Emails will appear here.' },
  };

  const titleKey = `${type}Title` as keyof typeof empty;
  const subtitleKey = `${type}Subtitle` as keyof typeof empty;

  return {
    title: empty?.[titleKey] ?? fallbacks[type].title,
    subtitle: empty?.[subtitleKey] ?? fallbacks[type].subtitle,
  };
}

export const EmailEmptyState: React.FC<EmailEmptyStateProps> = ({
  type = 'default',
  title,
  subtitle,
  primaryAction,
  secondaryAction,
}) => {
  const theme = useTheme();
  const t = useTranslations();
  const isDark = theme.palette.mode === 'dark';
  const config = EMPTY_STATE_CONFIG[type];
  const IconComponent = config.icon;
  const texts = getEmptyStateText(type, (t.dashboard?.email as Record<string, unknown>)?.empty as Record<string, string | undefined> | undefined);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 300,
        height: '100%',
        px: 4,
        py: 6,
        textAlign: 'center',
      }}
    >
      {/* Animated Icon Container */}
      <Box
        sx={{
          position: 'relative',
          mb: 3,
          animation: 'float 3s ease-in-out infinite',
          '@keyframes float': {
            '0%, 100%': { transform: 'translateY(0px)' },
            '50%': { transform: 'translateY(-8px)' },
          },
        }}
      >
        {/* Background glow */}
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(config.color, 0.15)} 0%, transparent 70%)`,
            filter: 'blur(10px)',
          }}
        />

        {/* Icon circle */}
        <Box
          sx={{
            position: 'relative',
            width: 80,
            height: 80,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(config.color, isDark ? 0.15 : 0.1),
            border: `2px solid ${alpha(config.color, 0.3)}`,
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'scale(1.05)',
              bgcolor: alpha(config.color, isDark ? 0.2 : 0.15),
            },
          }}
        >
          <IconComponent
            size={36}
            color={config.color}
            strokeWidth={1.5}
          />
        </Box>
      </Box>

      {/* Title */}
      <Typography
        variant="h6"
        sx={{
          fontWeight: 600,
          mb: 1,
          background: isDark
            ? `linear-gradient(135deg, ${config.color} 0%, ${alpha(config.color, 0.7)} 100%)`
            : 'inherit',
          WebkitBackgroundClip: isDark ? 'text' : 'inherit',
          WebkitTextFillColor: isDark ? 'transparent' : 'inherit',
          color: isDark ? 'inherit' : 'text.primary',
        }}
      >
        {title ?? texts.title}
      </Typography>

      {/* Subtitle */}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          maxWidth: 300,
          mb: 3,
          lineHeight: 1.6,
        }}
      >
        {subtitle ?? texts.subtitle}
      </Typography>

      {/* Actions */}
      {(primaryAction || secondaryAction) && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {primaryAction && (
            <Button
              variant="contained"
              startIcon={primaryAction.icon || <Plus size={18} />}
              onClick={primaryAction.onClick}
              sx={{
                background: `linear-gradient(135deg, ${config.color} 0%, ${alpha(config.color, 0.8)} 100%)`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${alpha(config.color, 0.9)} 0%, ${alpha(config.color, 0.7)} 100%)`,
                },
              }}
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="outlined"
              startIcon={<RefreshCcw size={16} />}
              onClick={secondaryAction.onClick}
              sx={{
                borderColor: alpha(config.color, 0.5),
                color: config.color,
                '&:hover': {
                  borderColor: config.color,
                  bgcolor: alpha(config.color, 0.08),
                },
              }}
            >
              {secondaryAction.label}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
};

export default EmailEmptyState;
