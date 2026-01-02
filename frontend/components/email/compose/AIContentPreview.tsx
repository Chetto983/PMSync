/* eslint-disable react-hooks/set-state-in-effect */
/**
 * AI Content Preview Component
 *
 * Displays AI-generated email content in a floating preview card
 * with accept/reject buttons and animated text reveal.
 *
 * Based on Zero-staging (Inbox Zero) pattern.
 *
 * @see D:\MailAgent\esempio\Zero-staging\apps\mail\components\create\email-composer.tsx
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  Fade,
  CircularProgress,
} from '@mui/material';
import { Check, X, RefreshCw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface AIContentPreviewProps {
  /** The AI-generated content to display */
  content: string;
  /** Optional generated subject line */
  subject?: string;
  /** Whether AI is currently generating */
  isLoading?: boolean;
  /** Called when user accepts the content */
  onAccept: (content: string, subject?: string) => void;
  /** Called when user rejects the content */
  onReject: () => void;
  /** Called when user wants to regenerate */
  onRegenerate?: () => void;
}

/**
 * Animated text component that reveals text character by character
 */
function AnimatedText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, delay + 10); // 10ms per character for smooth reveal

      return () => clearTimeout(timeout);
    }
  }, [currentIndex, text, delay]);

  // Reset animation when text changes
  useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
  }, [text]);

  return <span>{displayedText}</span>;
}

export function AIContentPreview({
  content,
  subject,
  isLoading = false,
  onAccept,
  onReject,
  onRegenerate,
}: AIContentPreviewProps) {
  const t = useTranslations();

  // Parse content into paragraphs for animated display
  const paragraphs = content.split('\n').filter((p) => p.trim());

  return (
    <Fade in>
      <Paper
        elevation={8}
        sx={{
          position: 'absolute',
          bottom: '100%',
          right: 0,
          mb: 1,
          width: { xs: 280, sm: 400 },
          maxHeight: 320,
          borderRadius: 2,
          overflow: 'hidden',
          zIndex: 50,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            {t.email?.aiCompose?.preview || 'AI Preview'}
          </Typography>
          {onRegenerate && (
            <IconButton
              size="small"
              onClick={onRegenerate}
              disabled={isLoading}
              sx={{ color: 'text.secondary' }}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </IconButton>
          )}
        </Box>

        {/* Content */}
        <Box
          sx={{
            maxHeight: 200,
            minHeight: 100,
            overflow: 'auto',
            p: 2,
          }}
        >
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 100,
                gap: 1,
              }}
            >
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                {t.email?.aiCompose?.generating || 'Generating...'}
              </Typography>
            </Box>
          ) : (
            <>
              {/* Subject preview if available */}
              {subject && (
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    mb: 1.5,
                    color: 'text.primary',
                  }}
                >
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                  >
                    {t.email?.aiCompose?.subject || 'Subject'}:{' '}
                  </Typography>
                  <AnimatedText text={subject} />
                </Typography>
              )}

              {/* Body preview with animated text */}
              <Box sx={{ '& p': { mb: 1, '&:last-child': { mb: 0 } } }}>
                {paragraphs.map((paragraph, index) => (
                  <Typography
                    key={index}
                    variant="body2"
                    component="p"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                    }}
                  >
                    <AnimatedText text={paragraph} delay={index * 50} />
                  </Typography>
                ))}
              </Box>
            </>
          )}
        </Box>

        {/* Action buttons */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            p: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<X size={14} />}
            onClick={onReject}
            disabled={isLoading}
            sx={{ textTransform: 'none' }}
          >
            {t.email?.aiCompose?.reject || 'Reject'}
          </Button>
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<Check size={14} />}
            onClick={() => onAccept(content, subject)}
            disabled={isLoading || !content}
            sx={{ textTransform: 'none' }}
          >
            {t.email?.aiCompose?.accept || 'Accept'}
          </Button>
        </Box>
      </Paper>
    </Fade>
  );
}

export default AIContentPreview;
