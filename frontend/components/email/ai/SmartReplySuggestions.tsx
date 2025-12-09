import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Stack,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Sparkles,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from 'lucide-react';
import { aiApi } from '@/lib/api/ai';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';
import { logger } from '@/lib/logger';

export type ReplyTone = 'formal' | 'casual' | 'technical';

export interface SmartReplySuggestionsProps {
  /** Email ID to generate replies for */
  emailId: string;
  /** Callback when a reply is selected */
  onSelectReply: (reply: string) => void;
  /** Callback to dismiss the component */
  onDismiss?: () => void;
  /** Default collapsed state */
  defaultExpanded?: boolean;
  /** Show tone selector */
  showToneSelector?: boolean;
}

/**
 * SmartReplySuggestions - AI-powered reply suggestions for emails
 *
 * Features:
 * - Generates 3 smart reply suggestions using AI
 * - Click to insert reply into composer
 * - Tone selector (formal/casual/technical)
 * - Regenerate functionality
 * - Loading and error states
 */
export const SmartReplySuggestions: React.FC<SmartReplySuggestionsProps> = ({
  emailId,
  onSelectReply,
  onDismiss,
  defaultExpanded = true,
  showToneSelector = true,
}) => {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { locale } = useLocale();

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<string[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedTone, setSelectedTone] = useState<ReplyTone>('casual');

  const loadReplies = useCallback(async () => {
    if (!emailId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await aiApi.generateSmartReplies(emailId, locale, selectedTone);
      if (response.data.success && response.data.suggestions) {
        setReplies(response.data.suggestions);
        setHasLoaded(true);
      } else {
        setError('Failed to generate replies');
      }
    } catch (err) {
      logger.error('Failed to generate smart replies', { error: err });
      setError('Failed to generate replies. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [emailId, locale, selectedTone]);

  // Load replies when expanded for the first time
  const handleToggleExpand = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (newExpanded && !hasLoaded && !isLoading) {
      loadReplies();
    }
  };

  // Auto-load if defaultExpanded
  React.useEffect(() => {
    if (defaultExpanded && !hasLoaded && !isLoading && emailId) {
      loadReplies();
    }
  }, [defaultExpanded, hasLoaded, isLoading, emailId, loadReplies]);

  // Regenerate when tone changes (only after initial load)
  const [prevTone, setPrevTone] = React.useState<ReplyTone>(selectedTone);
  React.useEffect(() => {
    if (hasLoaded && selectedTone !== prevTone) {
      setPrevTone(selectedTone);
      loadReplies();
    }
  }, [selectedTone, prevTone, hasLoaded, loadReplies]);

  const handleSelectReply = (reply: string) => {
    onSelectReply(reply);
  };

  const handleRegenerate = () => {
    loadReplies();
  };

  // Type helper for translations
  type SmartRepliesTranslations = {
    dashboard?: {
      emailAi?: {
        smartReplies?: {
          title?: string;
          generateMore?: string;
          tone?: string;
          formal?: string;
          casual?: string;
          technical?: string;
          noReplies?: string;
          clickToInsert?: string;
        };
      };
    };
    common?: { retry?: string };
    ai?: { generatingSuggestions?: string; dismiss?: string };
  };
  const translations = t as SmartRepliesTranslations;

  // Translations with fallbacks
  const labels = {
    title: translations?.dashboard?.emailAi?.smartReplies?.title || 'Smart Replies',
    generateMore: translations?.dashboard?.emailAi?.smartReplies?.generateMore || 'Generate More',
    tone: translations?.dashboard?.emailAi?.smartReplies?.tone || 'Tone',
    formal: translations?.dashboard?.emailAi?.smartReplies?.formal || 'Formal',
    casual: translations?.dashboard?.emailAi?.smartReplies?.casual || 'Casual',
    technical: translations?.dashboard?.emailAi?.smartReplies?.technical || 'Technical',
    noReplies: translations?.dashboard?.emailAi?.smartReplies?.noReplies || 'No suggestions available',
    clickToInsert: translations?.dashboard?.emailAi?.smartReplies?.clickToInsert || 'Click to insert',
  };

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: isDark ? alpha('#55cae5', 0.3) : alpha('#7650ce', 0.2),
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#55cae5', 0.05) : alpha('#7650ce', 0.03),
      }}
    >
      {/* Header */}
      <Box
        onClick={handleToggleExpand}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid' : 'none',
          borderColor: 'divider',
          '&:hover': {
            bgcolor: isDark ? alpha('#55cae5', 0.1) : alpha('#7650ce', 0.06),
          },
        }}
      >
        <Sparkles
          size={18}
          color={isDark ? '#55cae5' : '#7650ce'}
        />
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, flex: 1, color: isDark ? '#55cae5' : '#7650ce' }}
        >
          {labels.title}
        </Typography>

        {isLoading && <CircularProgress size={16} sx={{ color: isDark ? '#55cae5' : '#7650ce' }} />}

        {onDismiss && (
          <Tooltip title={translations?.ai?.dismiss ?? 'Dismiss'}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              sx={{ p: 0.5 }}
            >
              <X size={16} />
            </IconButton>
          </Tooltip>
        )}

        <IconButton size="small" sx={{ p: 0.5 }}>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </IconButton>
      </Box>

      {/* Content */}
      <Collapse in={isExpanded}>
        <Box sx={{ p: 2 }}>
          {/* Error State */}
          {error && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                {error}
              </Typography>
              <Chip
                icon={<RefreshCw size={14} />}
                label={translations?.common?.retry ?? 'Retry'}
                onClick={handleRegenerate}
                size="small"
                variant="outlined"
              />
            </Box>
          )}

          {/* Loading State */}
          {isLoading && !error && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress size={24} sx={{ color: isDark ? '#55cae5' : '#7650ce' }} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {translations?.ai?.generatingSuggestions ?? 'Generating suggestions...'}
              </Typography>
            </Box>
          )}

          {/* Replies */}
          {!isLoading && !error && hasLoaded && (
            <>
              {replies.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  {labels.noReplies}
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {replies.map((reply, index) => (
                    <Tooltip key={index} title={labels.clickToInsert} placement="top" arrow>
                      <Chip
                        icon={<MessageSquare size={14} />}
                        label={reply.length > 80 ? `${reply.substring(0, 80)}...` : reply}
                        onClick={() => handleSelectReply(reply)}
                        sx={{
                          height: 'auto',
                          py: 1,
                          px: 0.5,
                          '& .MuiChip-label': {
                            whiteSpace: 'normal',
                            display: 'block',
                            textAlign: 'left',
                          },
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper',
                          '&:hover': {
                            bgcolor: isDark ? alpha('#55cae5', 0.1) : alpha('#7650ce', 0.08),
                            borderColor: isDark ? '#55cae5' : '#7650ce',
                          },
                        }}
                      />
                    </Tooltip>
                  ))}
                </Stack>
              )}

              {/* Footer Actions */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mt: 2,
                  pt: 2,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Chip
                  icon={<RefreshCw size={14} />}
                  label={labels.generateMore}
                  onClick={handleRegenerate}
                  size="small"
                  variant="outlined"
                  disabled={isLoading}
                />

                {showToneSelector && (
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <Select
                      value={selectedTone}
                      onChange={(e) => setSelectedTone(e.target.value as ReplyTone)}
                      displayEmpty
                      sx={{
                        fontSize: '0.75rem',
                        '& .MuiSelect-select': { py: 0.5, px: 1 },
                      }}
                    >
                      <MenuItem value="formal">{labels.formal}</MenuItem>
                      <MenuItem value="casual">{labels.casual}</MenuItem>
                      <MenuItem value="technical">{labels.technical}</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Box>
            </>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

export default SmartReplySuggestions;
