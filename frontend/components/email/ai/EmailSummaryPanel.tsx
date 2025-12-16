import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  Collapse,
  Chip,
  Stack,
  Button,
  alpha,
  useTheme,
} from '@mui/material';
import {
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Calendar,
  CheckSquare,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { aiApi } from '@/lib/api/ai';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';
import { logger } from '@/lib/logger';

export interface ExtractedItem {
  type: 'date' | 'task' | 'action' | 'question';
  text: string;
  metadata?: Record<string, unknown>;
}

export interface EmailSummaryPanelProps {
  /** Email ID to summarize */
  emailId: string;
  /** Default collapsed state */
  defaultExpanded?: boolean;
  /** Show extracted items (dates, tasks, etc.) */
  showExtractedItems?: boolean;
  /** Callback when a date item is clicked (e.g., to add to calendar) */
  onAddToCalendar?: (item: ExtractedItem) => void;
  /** Callback when a task item is clicked (e.g., to add as task) */
  onAddTask?: (item: ExtractedItem) => void;
  /** Auto-load summary on mount */
  autoLoad?: boolean;
}

/**
 * EmailSummaryPanel - AI-powered email summarization
 *
 * Features:
 * - Generates concise summary of email content
 * - Extracts key points as bullet list
 * - Identifies dates, tasks, and action items
 * - Copy to clipboard functionality
 * - Regenerate on demand
 */
export const EmailSummaryPanel: React.FC<EmailSummaryPanelProps> = ({
  emailId,
  defaultExpanded = false,
  showExtractedItems = true,
  onAddToCalendar,
  onAddTask,
  autoLoad = false,
}) => {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { locale } = useLocale();

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset state when emailId changes (selecting a different email)
  useEffect(() => {
    setSummary(null);
    setHasLoaded(false);
    setError(null);
    setIsLoading(false);
    setCopied(false);
    // Keep isExpanded as user preference
  }, [emailId]);

  // Parse summary for key points (lines starting with - or *)
  const keyPoints = React.useMemo(() => {
    if (!summary) return [];
    const lines = summary.split('\n');
    return lines
      .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*') || line.trim().startsWith('•'))
      .map((line) => line.replace(/^[-*•]\s*/, '').trim());
  }, [summary]);

  // Extract actionable items from summary
  const extractedItems = React.useMemo<ExtractedItem[]>(() => {
    if (!summary) return [];
    const items: ExtractedItem[] = [];

    // Simple pattern matching for dates
    const datePatterns = [
      /(?:on|by|before|after|due|deadline:?)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/gi,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/g,
      /(?:tomorrow|next week|this friday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
    ];

    datePatterns.forEach((pattern) => {
      const matches = summary.match(pattern);
      matches?.forEach((match) => {
        if (!items.find((i) => i.text === match)) {
          items.push({ type: 'date', text: match });
        }
      });
    });

    // Simple pattern matching for tasks/actions
    const taskPatterns = [
      /(?:please|need to|should|must|could you|can you)\s+([^.!?]+[.!?]?)/gi,
      /(?:action item|todo|task):?\s*([^.!?\n]+)/gi,
    ];

    taskPatterns.forEach((pattern) => {
      const matches = summary.match(pattern);
      matches?.forEach((match) => {
        const cleanMatch = match.replace(/^(please|need to|should|must|could you|can you)\s+/i, '').trim();
        if (cleanMatch.length > 10 && !items.find((i) => i.text === cleanMatch)) {
          items.push({ type: 'task', text: cleanMatch });
        }
      });
    });

    return items.slice(0, 5); // Limit to 5 items
  }, [summary]);

  const loadSummary = useCallback(async () => {
    if (!emailId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await aiApi.summarizeEmail(emailId, locale);
      if (response.data.success && response.data.summary) {
        setSummary(response.data.summary);
        setHasLoaded(true);
      } else {
        setError(t.ai.chat.error);
      }
    } catch (err) {
      logger.error('Failed to generate summary:', { error: err });
      setError(t.ai.chat.error);
    } finally {
      setIsLoading(false);
    }
  }, [emailId, locale, t.ai.chat.error]);

  // Handle expand toggle
  const handleToggleExpand = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (newExpanded && !hasLoaded && !isLoading) {
      loadSummary();
    }
  };

  // Auto-load if autoLoad prop is true
  useEffect(() => {
    if (autoLoad && !hasLoaded && !isLoading && emailId) {
      loadSummary();
    }
  }, [autoLoad, hasLoaded, isLoading, emailId, loadSummary]);

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy:', { error: err });
    }
  };

  const handleRegenerate = () => {
    loadSummary();
  };

  // Get icon for extracted item
  const getItemIcon = (type: ExtractedItem['type']) => {
    switch (type) {
      case 'date':
        return <Calendar size={14} />;
      case 'task':
        return <CheckSquare size={14} />;
      case 'action':
        return <AlertCircle size={14} />;
      default:
        return <FileText size={14} />;
    }
  };

  const labels = {
    title: t.ai.emailAi.summary.title,
    regenerate: t.ai.emailAi.summary.regenerate,
    copy: t.ai.emailAi.summary.copy,
    copied: t.ai.emailAi.summary.copied,
    keyPoints: t.ai.emailAi.summary.keyPoints,
    extractedItems: t.ai.emailAi.summary.extractedItems,
    addToCalendar: t.ai.emailAi.summary.addToCalendar,
    addTask: t.ai.emailAi.summary.addTask,
    noSummary: t.ai.emailAi.summary.noSummary,
    generating: t.ai.emailAi.summary.generating,
  };

  // Get the main summary text (everything before bullet points)
  const mainSummary = React.useMemo(() => {
    if (!summary) return '';
    const lines = summary.split('\n');
    const nonBulletLines = lines.filter(
      (line) => !line.trim().startsWith('-') && !line.trim().startsWith('*') && !line.trim().startsWith('•')
    );
    return nonBulletLines.join(' ').trim();
  }, [summary]);

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: isDark ? alpha('#10b981', 0.3) : alpha('#10b981', 0.2),
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#10b981', 0.05) : alpha('#10b981', 0.03),
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
            bgcolor: isDark ? alpha('#10b981', 0.1) : alpha('#10b981', 0.06),
          },
        }}
      >
        <Sparkles size={18} color="#10b981" />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1, color: '#10b981' }}>
          {labels.title}
        </Typography>

        {isLoading && <CircularProgress size={16} sx={{ color: '#10b981' }} />}

        {hasLoaded && !isLoading && (
          <Tooltip title={copied ? labels.copied : labels.copy}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              sx={{ p: 0.5 }}
            >
              {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
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
                label={t.common.retry}
                onClick={handleRegenerate}
                size="small"
                variant="outlined"
              />
            </Box>
          )}

          {/* Loading State */}
          {isLoading && !error && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress size={24} sx={{ color: '#10b981' }} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {labels.generating}
              </Typography>
            </Box>
          )}

          {/* Summary Content */}
          {!isLoading && !error && hasLoaded && (
            <>
              {!summary ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  {labels.noSummary}
                </Typography>
              ) : (
                <>
                  {/* Main Summary */}
                  {mainSummary && (
                    <Typography
                      variant="body2"
                      sx={{
                        mb: 2,
                        lineHeight: 1.6,
                        color: 'text.primary',
                      }}
                    >
                      {mainSummary}
                    </Typography>
                  )}

                  {/* Key Points */}
                  {keyPoints.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, display: 'block' }}
                      >
                        {labels.keyPoints}
                      </Typography>
                      <Stack spacing={0.5}>
                        {keyPoints.map((point, index) => (
                          <Box
                            key={index}
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 1,
                            }}
                          >
                            <Box
                              sx={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                bgcolor: '#10b981',
                                mt: 0.75,
                                flexShrink: 0,
                              }}
                            />
                            <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                              {point}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}

                  {/* Extracted Items */}
                  {showExtractedItems && extractedItems.length > 0 && (
                    <Box
                      sx={{
                        p: 1.5,
                        bgcolor: isDark ? alpha('#10b981', 0.08) : alpha('#10b981', 0.05),
                        borderRadius: 1,
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, display: 'block' }}
                      >
                        {labels.extractedItems}
                      </Typography>
                      <Stack spacing={1}>
                        {extractedItems.map((item, index) => (
                          <Box
                            key={index}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              p: 1,
                              bgcolor: 'background.paper',
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'divider',
                            }}
                          >
                            <Box sx={{ color: item.type === 'date' ? 'info.main' : 'warning.main' }}>
                              {getItemIcon(item.type)}
                            </Box>
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {item.text}
                            </Typography>
                            {item.type === 'date' && onAddToCalendar && (
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => onAddToCalendar(item)}
                                sx={{ minWidth: 'auto', fontSize: '0.7rem', px: 1 }}
                              >
                                {labels.addToCalendar}
                              </Button>
                            )}
                            {item.type === 'task' && onAddTask && (
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => onAddTask(item)}
                                sx={{ minWidth: 'auto', fontSize: '0.7rem', px: 1 }}
                              >
                                {labels.addTask}
                              </Button>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}

                  {/* Footer Actions */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      pt: 1,
                      borderTop: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Chip
                      icon={<RefreshCw size={14} />}
                      label={labels.regenerate}
                      onClick={handleRegenerate}
                      size="small"
                      variant="outlined"
                      disabled={isLoading}
                    />
                  </Box>
                </>
              )}
            </>
          )}

          {/* Initial State - Not Yet Loaded */}
          {!isLoading && !error && !hasLoaded && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Sparkles size={16} />}
                onClick={loadSummary}
                sx={{
                  borderColor: '#10b981',
                  color: '#10b981',
                  '&:hover': {
                    borderColor: '#10b981',
                    bgcolor: alpha('#10b981', 0.08),
                  },
                }}
              >
                {t.email.view.summaryGenerate}
              </Button>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

export default EmailSummaryPanel;
