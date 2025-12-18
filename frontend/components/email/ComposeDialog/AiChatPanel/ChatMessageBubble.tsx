import React from 'react';
import { Box, Paper, Typography, IconButton, Tooltip } from '@mui/material';
import { Bot, User, Copy, Check, Sparkles } from 'lucide-react';
import type { ChatMessageBubbleProps } from './types';

/**
 * Renders a single chat message bubble with avatar and actions
 */
export function ChatMessageBubble({
  message,
  onCopy,
  onInsert,
  copiedId,
  t,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          maxWidth: '85%',
          flexDirection: isUser ? 'row-reverse' : 'row',
        }}
      >
        {/* Avatar */}
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            bgcolor: isUser ? 'primary.main' : 'secondary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isUser ? <User size={14} color="white" /> : <Bot size={14} color="white" />}
        </Box>

        {/* Message Bubble */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            bgcolor: isUser
              ? 'primary.light'
              : (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.content || '\u00A0'}
            {message.isStreaming && (
              <Box
                component="span"
                sx={{
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
                }}
              />
            )}
          </Typography>

          {/* Actions for completed assistant messages */}
          {!isUser && !message.isStreaming && message.suggestion && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
              <Tooltip title={t.email.composer.aiChatCopy}>
                <IconButton size="small" onClick={() => onCopy(message)}>
                  {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                </IconButton>
              </Tooltip>
              <Tooltip title={t.email.composer.aiChatInsert}>
                <IconButton size="small" onClick={() => onInsert(message)} color="primary">
                  <Sparkles size={14} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
