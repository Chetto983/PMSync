/**
 * StreamingMessage Component
 *
 * Displays AI message with token-by-token streaming effect.
 * Shows blinking cursor during streaming.
 */
import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography, IconButton, Tooltip } from '@mui/material';
import { Bot, Copy, Check, Sparkles } from 'lucide-react';

interface StreamingMessageProps {
  /** Current content (builds up as tokens arrive) */
  content: string;
  /** Whether still streaming */
  isStreaming: boolean;
  /** Message timestamp */
  timestamp?: Date;
  /** Callback when copy clicked */
  onCopy?: () => void;
  /** Callback when insert clicked */
  onInsert?: () => void;
  /** Whether content was copied */
  isCopied?: boolean;
  /** Show action buttons */
  showActions?: boolean;
  /** Translation labels */
  labels?: {
    copy?: string;
    insert?: string;
  };
}

export function StreamingMessage({
  content,
  isStreaming,
  timestamp,
  onCopy,
  onInsert,
  isCopied = false,
  showActions = true,
  labels = { copy: 'Copy', insert: 'Insert' },
}: StreamingMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as content streams in
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [content, isStreaming]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        maxWidth: '100%',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          maxWidth: '85%',
        }}
      >
        {/* Bot Avatar */}
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            bgcolor: 'secondary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Bot size={14} color="white" />
        </Box>

        {/* Message Content */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            bgcolor: 'grey.100',
            borderRadius: 2,
            position: 'relative',
          }}
        >
          <Typography
            ref={contentRef}
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              '& .streaming-cursor': {
                display: 'inline-block',
                width: '2px',
                height: '1em',
                bgcolor: 'primary.main',
                ml: 0.5,
                animation: 'blink 1s step-end infinite',
                verticalAlign: 'text-bottom',
                '@keyframes blink': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0 },
                },
              },
            }}
          >
            {content || '\u00A0'}
            {isStreaming && <span className="streaming-cursor" />}
          </Typography>

          {/* Action buttons - only show when streaming is complete */}
          {showActions && !isStreaming && content && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
              {onCopy && (
                <Tooltip title={labels.copy}>
                  <IconButton size="small" onClick={onCopy}>
                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                  </IconButton>
                </Tooltip>
              )}
              {onInsert && (
                <Tooltip title={labels.insert}>
                  <IconButton size="small" onClick={onInsert} color="primary">
                    <Sparkles size={14} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}
        </Paper>
      </Box>

      {/* Timestamp */}
      {timestamp && !isStreaming && (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ ml: 4, mt: 0.5 }}
        >
          {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      )}
    </Box>
  );
}

export default StreamingMessage;
