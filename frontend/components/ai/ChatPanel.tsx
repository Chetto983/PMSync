/**
 * ChatPanel Component
 *
 * Modern AI chat panel with streaming support.
 * Follows 2025 best practices:
 * - Token-by-token streaming display
 * - Keyboard shortcuts (Enter to send, Ctrl+Enter for newline)
 * - Stop button during streaming
 * - Auto-scroll to bottom
 * - Error handling with retry
 * - Quick action suggestions
 *
 * Inspired by Superhuman's AI integration.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
  Chip,
  Tooltip,
  Button,
  Fade,
  InputAdornment,
} from '@mui/material';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Square,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useAiStreamChat, StreamChatMessage } from '@/hooks/use-ai-stream-chat';
import { TypingIndicator } from './TypingIndicator';

interface ChatPanelProps {
  /** Conversation ID for session persistence */
  conversationId?: string;
  /** Locale for AI responses */
  locale?: string;
  /** Model preference */
  model?: 'small' | 'medium' | 'large';
  /** Quick action suggestions */
  suggestions?: Array<{ label: string; prompt: string }>;
  /** Callback when a suggestion should be inserted (e.g., into email body) */
  onInsertSuggestion?: (text: string) => void;
  /** Panel height */
  height?: number | string;
  /** Translation labels */
  labels?: {
    placeholder?: string;
    stop?: string;
    retry?: string;
    clear?: string;
    copy?: string;
    insert?: string;
    error?: string;
    thinking?: string;
  };
}

const DEFAULT_LABELS = {
  placeholder: 'Ask AI to help...',
  stop: 'Stop',
  retry: 'Retry',
  clear: 'Clear',
  copy: 'Copy',
  insert: 'Insert',
  error: 'An error occurred',
  thinking: 'Thinking...',
};

export function ChatPanel({
  conversationId,
  locale = 'en',
  model,
  suggestions = [],
  onInsertSuggestion,
  height = 400,
  labels: customLabels = {},
}: ChatPanelProps) {
  const labels = { ...DEFAULT_LABELS, ...customLabels };

  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    clearMessages,
    isStreaming,
    retry,
  } = useAiStreamChat({
    conversationId,
    locale,
    model,
  });

  const [inputValue, setInputValue] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Track scroll position to show/hide scroll button
  const handleScroll = useCallback(() => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom && messages.length > 3);
    }
  }, [messages.length]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Handle send message
  const handleSend = useCallback(() => {
    if (inputValue.trim() && !isStreaming) {
      sendMessage(inputValue.trim());
      setInputValue('');
    }
  }, [inputValue, isStreaming, sendMessage]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Copy message content
  const handleCopy = useCallback((message: StreamChatMessage) => {
    navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Insert message into parent (e.g., email body)
  const handleInsert = useCallback(
    (message: StreamChatMessage) => {
      if (onInsertSuggestion) {
        onInsertSuggestion(message.content);
      }
    },
    [onInsertSuggestion],
  );

  // Handle quick suggestion click
  const handleQuickSuggestion = useCallback(
    (prompt: string) => {
      sendMessage(prompt);
    },
    [sendMessage],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height,
        bgcolor: 'background.paper',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* Messages Area */}
      <Box
        ref={messagesContainerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          position: 'relative',
        }}
      >
        {/* Empty state with suggestions */}
        {messages.length === 0 && suggestions.length > 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Sparkles size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              How can I help you?
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              {suggestions.map((item, idx) => (
                <Chip
                  key={idx}
                  label={item.label}
                  size="small"
                  variant="outlined"
                  onClick={() => handleQuickSuggestion(item.prompt)}
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Messages */}
        {messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                maxWidth: '85%',
                flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              {/* Avatar */}
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: message.role === 'user' ? 'primary.main' : 'secondary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {message.role === 'user' ? (
                  <User size={14} color="white" />
                ) : (
                  <Bot size={14} color="white" />
                )}
              </Box>

              {/* Message Bubble */}
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  bgcolor: message.role === 'user' ? 'primary.light' : 'grey.100',
                  borderRadius: 2,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
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
                {message.role === 'assistant' && !message.isStreaming && message.content && (
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                    <Tooltip title={labels.copy}>
                      <IconButton size="small" onClick={() => handleCopy(message)}>
                        {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                      </IconButton>
                    </Tooltip>
                    {onInsertSuggestion && (
                      <Tooltip title={labels.insert}>
                        <IconButton
                          size="small"
                          onClick={() => handleInsert(message)}
                          color="primary"
                        >
                          <Sparkles size={14} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                )}
              </Paper>
            </Box>

            {/* Timestamp */}
            {!message.isStreaming && (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ mt: 0.5, mx: message.role === 'user' ? 0 : 4.5 }}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Typography>
            )}
          </Box>
        ))}

        {/* Typing indicator when streaming starts but no content yet */}
        {isStreaming && messages[messages.length - 1]?.content === '' && (
          <TypingIndicator label={labels.thinking} />
        )}

        {/* Error state */}
        {status === 'error' && error && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1.5,
              bgcolor: 'error.light',
              borderRadius: 2,
            }}
          >
            <AlertCircle size={18} />
            <Typography variant="body2" color="error.dark" sx={{ flex: 1 }}>
              {error}
            </Typography>
            <Button size="small" startIcon={<RefreshCw size={14} />} onClick={retry}>
              {labels.retry}
            </Button>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Scroll to bottom button */}
      <Fade in={showScrollButton}>
        <Box
          sx={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
          }}
        >
          <IconButton
            size="small"
            onClick={scrollToBottom}
            sx={{
              bgcolor: 'background.paper',
              boxShadow: 2,
              '&:hover': { bgcolor: 'grey.100' },
            }}
          >
            <ChevronDown size={18} />
          </IconButton>
        </Box>
      </Fade>

      {/* Input Area */}
      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          gap: 1,
          alignItems: 'flex-end',
        }}
      >
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          placeholder={labels.placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          multiline
          maxRows={4}
          InputProps={{
            endAdornment: messages.length > 0 && (
              <InputAdornment position="end">
                <Tooltip title={labels.clear}>
                  <IconButton size="small" onClick={clearMessages} disabled={isStreaming}>
                    <RefreshCw size={16} />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
            },
          }}
        />

        {isStreaming ? (
          <Tooltip title={labels.stop}>
            <IconButton
              onClick={stop}
              sx={{
                bgcolor: 'error.main',
                color: 'white',
                '&:hover': { bgcolor: 'error.dark' },
              }}
            >
              <Square size={18} />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Send (Enter)">
            <IconButton
              onClick={handleSend}
              disabled={!inputValue.trim()}
              sx={{
                bgcolor: 'primary.main',
                color: 'white',
                '&:hover': { bgcolor: 'primary.dark' },
                '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
              }}
            >
              <Send size={18} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export default ChatPanel;
