import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
  CircularProgress,
  Chip,
  Collapse,
  Tooltip,
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
} from 'lucide-react';
import { aiApi } from '@/lib/api/ai';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestion?: string; // Suggested text to insert
}

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
  t: any;
  /** Locale for AI */
  locale?: string;
}

const SUGGESTION_PROMPTS = {
  en: [
    { label: 'Improve clarity', prompt: 'Make this email clearer and more concise' },
    { label: 'More formal', prompt: 'Rewrite in a more formal tone' },
    { label: 'More friendly', prompt: 'Make this more friendly and warm' },
    { label: 'Fix grammar', prompt: 'Check and fix any grammar issues' },
    { label: 'Shorten', prompt: 'Make this email shorter while keeping the key points' },
    { label: 'Add call to action', prompt: 'Add a clear call to action at the end' },
  ],
  it: [
    { label: 'Migliora chiarezza', prompt: 'Rendi questa email piu chiara e concisa' },
    { label: 'Piu formale', prompt: 'Riscrivi in un tono piu formale' },
    { label: 'Piu amichevole', prompt: 'Rendi questa email piu amichevole e calorosa' },
    { label: 'Correggi grammatica', prompt: 'Controlla e correggi eventuali errori grammaticali' },
    { label: 'Accorcia', prompt: 'Rendi questa email piu breve mantenendo i punti chiave' },
    { label: 'Aggiungi CTA', prompt: 'Aggiungi una chiara call to action alla fine' },
  ],
};

export function AiChatPanel({
  emailBody,
  emailSubject,
  recipients,
  mode,
  onInsertSuggestion: _onInsertSuggestion, // Reserved for cursor-position insert
  onReplaceBody,
  onUpdateSubject: _onUpdateSubject, // Reserved for subject suggestions
  t,
  locale = 'en',
}: AiChatPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const localeKey = locale.startsWith('it') ? 'it' : 'en';
  const suggestions = SUGGESTION_PROMPTS[localeKey];

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

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleSendMessage = useCallback(async (messageText?: string) => {
    const text = messageText || inputValue.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // Build context for the AI
      const contextPrompt = buildContextPrompt(text, emailBody, emailSubject, recipients, mode, localeKey);

      const { data } = await aiApi.composeEmail({
        prompt: contextPrompt,
        to: recipients,
        subject: emailSubject || undefined,
        locale: localeKey,
      });

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: data?.body || (localeKey === 'it' ? 'Mi dispiace, non sono riuscito a generare una risposta.' : 'Sorry, I could not generate a response.'),
        timestamp: new Date(),
        suggestion: data?.body,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: localeKey === 'it'
          ? 'Si e verificato un errore. Per favore riprova.'
          : 'An error occurred. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, emailBody, emailSubject, recipients, mode, localeKey]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleCopySuggestion = useCallback((message: ChatMessage) => {
    if (message.suggestion) {
      navigator.clipboard.writeText(message.suggestion);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const handleInsert = useCallback((message: ChatMessage) => {
    if (message.suggestion) {
      onReplaceBody(message.suggestion);
    }
  }, [onReplaceBody]);

  const handleQuickSuggestion = useCallback((prompt: string) => {
    handleSendMessage(prompt);
  }, [handleSendMessage]);

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const panelTitle = t.dashboard?.email?.composer?.aiChatTitle ?? 'AI Assistant';
  const inputPlaceholder = t.dashboard?.email?.composer?.aiChatPlaceholder ?? 'Ask AI to help with your email...';

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
            <Chip
              size="small"
              label={messages.length}
              sx={{ height: 18, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </IconButton>
      </Box>

      {/* Collapsible content */}
      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2 }}>
          {/* Quick suggestion chips */}
          {messages.length === 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {t.dashboard?.email?.composer?.aiChatSuggestions ?? 'Quick actions:'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {suggestions.map((item, idx) => (
                  <Chip
                    key={idx}
                    label={item.label}
                    size="small"
                    variant="outlined"
                    onClick={() => handleQuickSuggestion(item.prompt)}
                    disabled={loading || !emailBody.trim()}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
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
                        {message.content}
                      </Typography>

                      {/* Action buttons for assistant messages with suggestions */}
                      {message.role === 'assistant' && message.suggestion && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                          <Tooltip title={t.dashboard?.email?.composer?.aiChatCopy ?? 'Copy'}>
                            <IconButton
                              size="small"
                              onClick={() => handleCopySuggestion(message)}
                            >
                              {copiedId === message.id ? (
                                <Check size={14} />
                              ) : (
                                <Copy size={14} />
                              )}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t.dashboard?.email?.composer?.aiChatInsert ?? 'Insert into email'}>
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
              <div ref={messagesEndRef} />
            </Box>
          )}

          {/* Loading indicator */}
          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                {t.dashboard?.email?.composer?.aiChatThinking ?? 'Thinking...'}
              </Typography>
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
              disabled={loading}
              multiline
              maxRows={3}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />
            <IconButton
              color="primary"
              onClick={() => handleSendMessage()}
              disabled={loading || !inputValue.trim()}
              sx={{
                bgcolor: 'primary.main',
                color: 'white',
                '&:hover': { bgcolor: 'primary.dark' },
                '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
              }}
            >
              <Send size={18} />
            </IconButton>
            {messages.length > 0 && (
              <Tooltip title={t.dashboard?.email?.composer?.aiChatClear ?? 'Clear chat'}>
                <IconButton size="small" onClick={clearChat} disabled={loading}>
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

/**
 * Build a context-aware prompt for the AI
 */
function buildContextPrompt(
  userRequest: string,
  emailBody: string,
  emailSubject: string,
  recipients: string[],
  mode: string,
  locale: string,
): string {
  const isIt = locale === 'it';
  const parts: string[] = [];

  if (isIt) {
    parts.push(`L'utente sta ${mode === 'reply' ? 'rispondendo a' : mode === 'forward' ? 'inoltrando' : 'scrivendo'} un'email.`);
    if (emailSubject) {
      parts.push(`Oggetto: ${emailSubject}`);
    }
    if (recipients.length > 0) {
      parts.push(`Destinatari: ${recipients.join(', ')}`);
    }
    if (emailBody.trim()) {
      parts.push(`\nBozza attuale dell'email:\n---\n${emailBody}\n---`);
    }
    parts.push(`\nRichiesta dell'utente: ${userRequest}`);
    parts.push('\nRispondi con il testo dell\'email migliorato/modificato. Non includere spiegazioni, solo il testo dell\'email.');
  } else {
    parts.push(`The user is ${mode === 'reply' ? 'replying to' : mode === 'forward' ? 'forwarding' : 'composing'} an email.`);
    if (emailSubject) {
      parts.push(`Subject: ${emailSubject}`);
    }
    if (recipients.length > 0) {
      parts.push(`Recipients: ${recipients.join(', ')}`);
    }
    if (emailBody.trim()) {
      parts.push(`\nCurrent email draft:\n---\n${emailBody}\n---`);
    }
    parts.push(`\nUser request: ${userRequest}`);
    parts.push('\nRespond with the improved/modified email text. Do not include explanations, just the email text.');
  }

  return parts.join('\n');
}
