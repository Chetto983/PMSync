/**
 * AI Content Preview Component
 *
 * Displays AI-generated email content in an inline chat-style preview
 * with accept/reject buttons and animated text reveal.
 *
 * Based on chat message bubble pattern for better UX integration.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Fade,
  CircularProgress,
  alpha,
} from '@mui/material';
import { Check, X, RefreshCw, Sparkles } from 'lucide-react';
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
      }, delay + 8); // 8ms per character for smooth reveal

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
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          p: 2,
          borderRadius: 2,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
          border: 1,
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.2),
        }}
      >
        {/* Header with AI icon */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: 1,
                bgcolor: 'primary.main',
              }}
            >
              <Sparkles size={14} color="white" />
            </Box>
            <Typography variant="subtitle2" fontWeight={600}>
              {t.email?.aiCompose?.preview || 'Anteprima AI'}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={onReject}
            sx={{
              color: 'text.secondary',
              '&:hover': { color: 'error.main' },
            }}
          >
            <X size={16} />
          </IconButton>
        </Box>

        {/* Content area */}
        <Box
          sx={{
            maxHeight: 200,
            overflow: 'auto',
            bgcolor: 'background.paper',
            borderRadius: 1.5,
            p: 2,
          }}
        >
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                py: 3,
                gap: 1.5,
              }}
            >
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                {t.email?.aiCompose?.generating || 'Generazione in corso...'}
              </Typography>
            </Box>
          ) : (
            <>
              {/* Subject preview if available */}
              {subject && (
                <Typography
                  variant="body2"
                  sx={{
                    mb: 1.5,
                    pb: 1.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                    fontWeight={500}
                  >
                    {t.email?.aiCompose?.subject || 'Oggetto'}:{' '}
                  </Typography>
                  <Typography component="span" fontWeight={600}>
                    <AnimatedText text={subject} />
                  </Typography>
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
                      lineHeight: 1.7,
                      color: 'text.primary',
                    }}
                  >
                    <AnimatedText text={paragraph} delay={index * 30} />
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
          }}
        >
          {onRegenerate && (
            <Button
              size="small"
              variant="text"
              startIcon={<RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />}
              onClick={onRegenerate}
              disabled={isLoading}
              sx={{
                textTransform: 'none',
                color: 'text.secondary',
              }}
            >
              {t.email?.aiCompose?.regenerate || 'Rigenera'}
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<X size={14} />}
            onClick={onReject}
            disabled={isLoading}
            sx={{ textTransform: 'none' }}
          >
            {t.email?.aiCompose?.reject || 'Rifiuta'}
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
            {t.email?.aiCompose?.accept || 'Accetta'}
          </Button>
        </Box>
      </Box>
    </Fade>
  );
}

export default AIContentPreview;
