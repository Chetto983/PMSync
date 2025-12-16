/**
 * AiChatPanel - Enhanced with Streaming Support
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
  Paper,
  Chip,
  Collapse,
  Tooltip,
  Button,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  Send,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Square,
  Wand2,
} from 'lucide-react';
import { voltAgentApi, aiApi } from '@/lib/api/ai';
import { TypingIndicator } from '@/components/ai/TypingIndicator';
import type { AppTranslations } from '@/locales';
import { logger } from '@/lib/logger';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestion?: string;
  isStreaming?: boolean;
}

type ToneType = 'formal' | 'casual' | 'technical';

interface AiChatPanelProps {
  /** Current email body for context */
  emailBody: string;
  /** Current subject for context */
  emailSubject: string;
  /** Recipients for context */
  recipients: string[];
  /** Mode: compose, reply, forward */
  mode: 'compose' | 'reply' | 'forward';
  /** Callback when user wants to insert suggestion */
  onInsertSuggestion: (text: string) => void;
  /** Callback when user wants to replace body */
  onReplaceBody: (text: string) => void;
  /** Callback when user wants to update subject */
  onUpdateSubject: (text: string) => void;
  /** Translation object */
  t: AppTranslations;
  /** Locale for AI */
  locale?: string;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tone, setTone] = useState<ToneType>('casual');
  const [generatingSubject, setGeneratingSubject] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef('');

  const suggestions = [
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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

  // Stop streaming
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

      // Finalize the streaming message
      if (streamingContentRef.current) {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.isStreaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: streamingContentRef.current,
                suggestion: streamingContentRef.current,
                isStreaming: false,
              },
            ];
          }
          return prev;
        });
      }

      streamingContentRef.current = '';
      setIsStreaming(false);
    }
  }, []);

  // Build context prompt for the AI
  const buildContextPrompt = useCallback(
    (userRequest: string): string => {
      const isIt = localeKey === 'it';
      const parts: string[] = [];

      // Add tone instruction
      const toneInstruction = {
        formal: isIt ? 'Usa un tono formale e professionale.' : 'Use a formal, professional tone.',
        casual: isIt ? 'Usa un tono amichevole e informale.' : 'Use a friendly, casual tone.',
        technical: isIt ? 'Usa un tono tecnico e preciso.' : 'Use a technical, precise tone.',
      };
      parts.push(toneInstruction[tone]);

      if (isIt) {
        parts.push(`L'utente sta ${mode === 'reply' ? 'rispondendo a' : mode === 'forward' ? 'inoltrando' : 'scrivendo'} un'email.`);
        if (emailSubject) parts.push(`Oggetto: ${emailSubject}`);
        if (recipients.length > 0) parts.push(`Destinatari: ${recipients.join(', ')}`);
        if (emailBody.trim()) parts.push(`\nBozza attuale:\n---\n${emailBody}\n---`);
        parts.push(`\nRichiesta: ${userRequest}`);
        parts.push('\nRispondi con il testo dell\'email. Non includere spiegazioni.');
      } else {
        parts.push(`The user is ${mode === 'reply' ? 'replying to' : mode === 'forward' ? 'forwarding' : 'composing'} an email.`);
        if (emailSubject) parts.push(`Subject: ${emailSubject}`);
        if (recipients.length > 0) parts.push(`Recipients: ${recipients.join(', ')}`);
        if (emailBody.trim()) parts.push(`\nCurrent draft:\n---\n${emailBody}\n---`);
        parts.push(`\nRequest: ${userRequest}`);
        parts.push('\nRespond with the email text only. No explanations.');
      }

      return parts.join('\n');
    },
    [emailBody, emailSubject, recipients, mode, localeKey, tone],
  );

  // Send message with streaming
  const handleSendMessage = useCallback(
    async (messageText?: string) => {
      const text = messageText || inputValue.trim();
      if (!text || isStreaming) return;

      // Stop any existing stream
      handleStop();

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInputValue('');
      setIsStreaming(true);
      streamingContentRef.current = '';

      const contextPrompt = buildContextPrompt(text);

      abortControllerRef.current = voltAgentApi.streamChat(
        {
          message: contextPrompt,
          locale: localeKey,
          model: 'medium', // Use medium model for compose tasks
        },
        // onChunk
        (chunk) => {
          streamingContentRef.current += chunk;
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...lastMessage, content: streamingContentRef.current },
              ];
            }
            return prev;
          });
        },
        // onDone
        () => {
          const finalContent = streamingContentRef.current;
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.isStreaming) {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: finalContent,
                  suggestion: finalContent,
                  isStreaming: false,
                },
              ];
            }
            return prev;
          });
          streamingContentRef.current = '';
          setIsStreaming(false);
          abortControllerRef.current = null;
        },
        // onError
        (errorMessage) => {
          logger.error('AI stream error', { errorMessage });
          const errorContent = t.email.composer.aiChatError;

          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...lastMessage, content: errorContent, isStreaming: false },
              ];
            }
            return prev;
          });
          streamingContentRef.current = '';
          setIsStreaming(false);
          abortControllerRef.current = null;
        },
      );
    },
    [inputValue, isStreaming, handleStop, buildContextPrompt, localeKey, t],
  );

  // Generate smart subject
  const handleGenerateSubject = useCallback(async () => {
    if (!emailBody.trim() || generatingSubject) return;

    setGeneratingSubject(true);
    try {
      const { data } = await aiApi.composeEmail({
        prompt: localeKey === 'it'
          ? `Genera un oggetto email breve e efficace per questa email:\n${emailBody}`
          : `Generate a short, effective email subject line for this email:\n${emailBody}`,
        locale: localeKey,
      });

      if (data?.subject) {
        onUpdateSubject(data.subject);
      }
    } catch (error) {
      logger.error('Subject generation error', { error });
    } finally {
      setGeneratingSubject(false);
    }
  }, [emailBody, localeKey, onUpdateSubject, generatingSubject]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  const handleCopySuggestion = useCallback((message: ChatMessage) => {
    if (message.suggestion) {
      navigator.clipboard.writeText(message.suggestion);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const handleInsert = useCallback(
    (message: ChatMessage) => {
      if (message.suggestion) {
        let text = message.suggestion;

        // Extract subject line if present (handles **Oggetto:**, **Subject:**, Oggetto:, Subject:)
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
            // Remove the subject line from the body
            text = text.replace(pattern, '').trim();
            // Update the subject field
            onUpdateSubject(extractedSubject);
            break;
          }
        }

        onReplaceBody(text);
      }
    },
    [onReplaceBody, onUpdateSubject],
  );

  const handleQuickSuggestion = useCallback(
    (prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage],
  );

  const clearChat = useCallback(() => {
    handleStop();
    setMessages([]);
  }, [handleStop]);

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
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
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
                    <Paper
                      elevation={0}
                      sx={{
                        p: 1.5,
                        bgcolor: message.role === 'user'
                          ? 'primary.light'
                          : (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                        borderRadius: 2,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
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
                      {message.role === 'assistant' && !message.isStreaming && message.suggestion && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                          <Tooltip title={t.email.composer.aiChatCopy}>
                            <IconButton size="small" onClick={() => handleCopySuggestion(message)}>
                              {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t.email.composer.aiChatInsert}>
                            <IconButton
                              size="small"
                              onClick={() => handleInsert(message)}
                              color="primary"
                            >
                              <Sparkles size={14} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Paper>
                  </Box>
                </Box>
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
