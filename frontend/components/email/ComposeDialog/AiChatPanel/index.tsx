/**
 * AiChatPanel - Enhanced with Streaming Support (Modular Version)
 *
 * AI assistant panel for ComposeDialog with:
 * - Token-by-token streaming (2025 best practices)
 * - Tone adjustment slider (formal/casual/technical)
 * - Smart subject generation
 * - Stop button during generation
 * - Quick action suggestions
 *
 * Based on Superhuman's integrated AI approach.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Chip,
  Collapse,
  Tooltip,
  Button,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  Send,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  Square,
  Wand2,
} from 'lucide-react';
import { TypingIndicator } from '@/components/ai/TypingIndicator';
import { useAiCompose } from './hooks/useAiCompose';
import { ChatMessageBubble } from './ChatMessageBubble';
import type { AiChatPanelProps, QuickSuggestion } from './types';

export function AiChatPanel({
  emailBody,
  emailSubject,
  recipients,
  mode,
  onInsertSuggestion: _onInsertSuggestion, // Reserved for cursor-position insert
  onReplaceBody,
  onUpdateSubject,
  t,
  locale = 'en',
}: AiChatPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    inputValue,
    setInputValue,
    isStreaming,
    tone,
    setTone,
    generatingSubject,
    copiedId,
    handleStop,
    handleSendMessage,
    handleGenerateSubject,
    handleCopy,
    clearChat,
  } = useAiCompose({
    emailBody,
    emailSubject,
    recipients,
    mode,
    locale,
    t,
    onUpdateSubject,
  });

  // Quick suggestions based on translations
  const suggestions: QuickSuggestion[] = [
    {
      label: t.email.composer.aiChatPresetImproveClarityLabel,
      prompt: t.email.composer.aiChatPresetImproveClarityPrompt,
    },
    {
      label: t.email.composer.aiChatPresetMoreFormalLabel,
      prompt: t.email.composer.aiChatPresetMoreFormalPrompt,
    },
    {
      label: t.email.composer.aiChatPresetMoreFriendlyLabel,
      prompt: t.email.composer.aiChatPresetMoreFriendlyPrompt,
    },
    {
      label: t.email.composer.aiChatPresetFixGrammarLabel,
      prompt: t.email.composer.aiChatPresetFixGrammarPrompt,
    },
    {
      label: t.email.composer.aiChatPresetShortenLabel,
      prompt: t.email.composer.aiChatPresetShortenPrompt,
    },
    {
      label: t.email.composer.aiChatPresetAddCtaLabel,
      prompt: t.email.composer.aiChatPresetAddCtaPrompt,
    },
  ];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (expanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, expanded]);

  // Focus input when expanded
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleInsert = useCallback(
    (message: { suggestion?: string }) => {
      if (message.suggestion) {
        let text = message.suggestion;

        // Extract subject line if present
        const subjectPatterns = [
          /^\*\*Oggetto:\*\*\s*(.+?)(?:\n|$)/i,
          /^\*\*Subject:\*\*\s*(.+?)(?:\n|$)/i,
          /^Oggetto:\s*(.+?)(?:\n|$)/i,
          /^Subject:\s*(.+?)(?:\n|$)/i,
        ];

        for (const pattern of subjectPatterns) {
          const match = text.match(pattern);
          if (match) {
            const extractedSubject = match[1].trim();
            text = text.replace(pattern, '').trim();
            onUpdateSubject(extractedSubject);
            break;
          }
        }

        onReplaceBody(text);
      }
    },
    [onReplaceBody, onUpdateSubject]
  );

  const handleQuickSuggestion = useCallback(
    (prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage]
  );

  const panelTitle = t.email.composer.aiChatTitle;
  const inputPlaceholder = t.email.composer.aiChatPlaceholder;

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* Header - always visible */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Sparkles size={18} />
          <Typography variant="subtitle2">{panelTitle}</Typography>
          {messages.length > 0 && (
            <Chip size="small" label={messages.length} sx={{ height: 18, fontSize: '0.7rem' }} />
          )}
          {isStreaming && (
            <Chip
              size="small"
              label={t.email.composer.aiChatGenerating}
              color="primary"
              sx={{ height: 18, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </IconButton>
      </Box>

      {/* Collapsible content */}
      <Collapse in={expanded}>
        <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: 2 }}>
          {/* Tone selector */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {t.email.composer.aiChatTone}
            </Typography>
            <ToggleButtonGroup
              value={tone}
              exclusive
              onChange={(_, newTone) => newTone && setTone(newTone)}
              size="small"
              sx={{
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
                '& .MuiToggleButton-root': {
                  px: { xs: 1, sm: 1.5 },
                  py: 0.5,
                  fontSize: '0.75rem',
                  minHeight: { xs: 36, sm: 'auto' },
                },
              }}
            >
              <ToggleButton value="formal">{t.ai.emailAi.smartReplies.formal}</ToggleButton>
              <ToggleButton value="casual">{t.ai.emailAi.smartReplies.casual}</ToggleButton>
              <ToggleButton value="technical">{t.ai.emailAi.smartReplies.technical}</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Subject generation button */}
          {emailBody.trim() && !emailSubject && (
            <Box sx={{ mb: 2 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={generatingSubject ? null : <Wand2 size={14} />}
                onClick={handleGenerateSubject}
                disabled={generatingSubject}
                sx={{ fontSize: '0.75rem' }}
              >
                {generatingSubject
                  ? t.email.composer.aiChatGeneratingSubject
                  : t.email.composer.aiChatGenerateSubject}
              </Button>
            </Box>
          )}

          {/* Quick suggestion chips */}
          {messages.length === 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {t.email.composer.aiChatSuggestions}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {suggestions.map((item, idx) => (
                  <Chip
                    key={idx}
                    label={item.label}
                    size="small"
                    variant="outlined"
                    onClick={() => handleQuickSuggestion(item.prompt)}
                    disabled={isStreaming || !emailBody.trim()}
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Chat messages */}
          {messages.length > 0 && (
            <Box
              sx={{
                maxHeight: 250,
                overflowY: 'auto',
                mb: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              {messages.map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  onCopy={handleCopy}
                  onInsert={handleInsert}
                  copiedId={copiedId}
                  t={t}
                />
              ))}

              {/* Typing indicator when streaming but no content yet */}
              {isStreaming && messages[messages.length - 1]?.content === '' && (
                <TypingIndicator compact />
              )}

              <div ref={messagesEndRef} />
            </Box>
          )}

          {/* Input area */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              size="small"
              placeholder={inputPlaceholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isStreaming}
              multiline
              maxRows={3}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {isStreaming ? (
              <Tooltip title={t.ai.chat.stop}>
                <IconButton
                  onClick={handleStop}
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
              <IconButton
                color="primary"
                onClick={() => handleSendMessage()}
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
            )}

            {messages.length > 0 && (
              <Tooltip title={t.email.composer.aiChatClear}>
                <IconButton size="small" onClick={clearChat} disabled={isStreaming}>
                  <RefreshCw size={16} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

export default AiChatPanel;
