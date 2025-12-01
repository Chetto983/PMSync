import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Button,
  Typography,
  Stack,
  Tooltip,
  Collapse,
  Avatar,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  Send,
  X,
  Maximize2,
  Reply,
  ReplyAll,
  ChevronDown,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Props for InlineReplyComposer
 */
export interface InlineReplyComposerProps {
  /**
   * The email being replied to
   */
  replyTo: {
    id: string;
    from: string;
    to?: string[];
    cc?: string[];
    subject: string;
    /** Thread ID for reply threading */
    threadId?: string;
    /** Message ID for In-Reply-To header */
    messageId?: string;
  };
  /**
   * Whether this is a reply-all
   */
  isReplyAll?: boolean;
  /**
   * Callback when sending the quick reply
   */
  onSend?: (data: {
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    inReplyTo?: string;
  }) => Promise<void>;
  /**
   * Callback to expand to full compose dialog (recommended)
   */
  onExpand: (prefillData: {
    to: string[];
    cc?: string[];
    subject: string;
    body?: string;
    inReplyTo?: string;
    references?: string;
    originalEmailId: string;
  }) => void;
  /**
   * Callback when closing the composer
   */
  onClose?: () => void;
  /**
   * Whether the composer is initially expanded
   * @default false
   */
  defaultExpanded?: boolean;
  /**
   * Placeholder text for collapsed state
   */
  placeholder?: string;
  /**
   * Show quick reply inline (vs just trigger for full dialog)
   * @default true
   */
  showQuickReply?: boolean;
}

/**
 * Parse email string to extract name and email
 */
function parseEmailFrom(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: from, email: from };
}

/**
 * InlineReplyComposer - Quick reply trigger that appears at bottom of thread
 *
 * Two modes:
 * 1. Quick Reply (showQuickReply=true): Shows inline text field for simple replies
 * 2. Dialog Trigger (showQuickReply=false): Just opens full ComposeDialog
 *
 * Features:
 * - Compact collapsed state showing "Reply" prompt
 * - Expands to simple text area for quick replies
 * - "Expand" button opens full ComposeDialog with AI, formatting, etc.
 * - Keyboard shortcut: Ctrl+Enter to send
 *
 * @example
 * ```tsx
 * <InlineReplyComposer
 *   replyTo={email}
 *   isReplyAll={false}
 *   onExpand={(prefill) => openComposeDialog('reply', prefill)}
 * />
 * ```
 */
export const InlineReplyComposer: React.FC<InlineReplyComposerProps> = ({
  replyTo,
  isReplyAll = false,
  onSend,
  onExpand,
  onClose,
  defaultExpanded = false,
  placeholder,
  showQuickReply = true,
}) => {
  const t = useTranslations();
  const { user } = useAuthStore();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textFieldRef = useRef<HTMLTextAreaElement>(null);

  // Parse the original sender
  const senderInfo = parseEmailFrom(replyTo.from);

  // Calculate recipients
  const getRecipients = useCallback(() => {
    const toList = isReplyAll
      ? [replyTo.from, ...(replyTo.to?.filter((e) => e !== user?.email) || [])]
      : [replyTo.from];
    const ccList = isReplyAll ? replyTo.cc : undefined;
    return { to: toList, cc: ccList };
  }, [isReplyAll, replyTo, user?.email]);

  // Generate subject
  const getSubject = useCallback(() => {
    return replyTo.subject.startsWith('Re:')
      ? replyTo.subject
      : `Re: ${replyTo.subject}`;
  }, [replyTo.subject]);

  // Build prefill data for full compose dialog
  const buildPrefillData = useCallback(() => {
    const { to, cc } = getRecipients();
    return {
      to,
      cc,
      subject: getSubject(),
      body: body || undefined,
      inReplyTo: replyTo.messageId,
      references: replyTo.messageId,
      originalEmailId: replyTo.id,
    };
  }, [getRecipients, getSubject, body, replyTo]);

  // Focus text field when expanded
  useEffect(() => {
    if (isExpanded && textFieldRef.current) {
      textFieldRef.current.focus();
    }
  }, [isExpanded]);

  const handleExpand = useCallback(() => {
    if (showQuickReply) {
      setIsExpanded(true);
    } else {
      // Directly open full dialog
      onExpand(buildPrefillData());
    }
  }, [showQuickReply, onExpand, buildPrefillData]);

  const handleExpandToDialog = useCallback(() => {
    onExpand(buildPrefillData());
    setIsExpanded(false);
    setBody('');
  }, [onExpand, buildPrefillData]);

  const handleSend = useCallback(async () => {
    if (!body.trim() || !onSend) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const { to, cc } = getRecipients();
      await onSend({
        to,
        cc,
        subject: getSubject(),
        body: body.trim(),
        inReplyTo: replyTo.messageId,
      });

      // Clear form after successful send
      setBody('');
      setIsExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setIsSending(false);
    }
  }, [body, onSend, getRecipients, getSubject, replyTo.messageId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd + Enter to send
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (onSend) {
          handleSend();
        } else {
          handleExpandToDialog();
        }
      }
      // Escape to collapse (if empty)
      if (e.key === 'Escape' && !body.trim()) {
        setIsExpanded(false);
      }
    },
    [handleSend, handleExpandToDialog, body, onSend]
  );

  // Avatar color based on user email
  const avatarColors = ['#55cae5', '#7650ce', '#b43db6', '#4CAF50', '#FF9800', '#E91E63'];
  const colorIndex = user?.email ? user.email.charCodeAt(0) % avatarColors.length : 0;
  const avatarColor = avatarColors[colorIndex];

  const collapsedText = placeholder ||
    (isReplyAll
      ? (t.dashboard?.emailView?.replyAll || 'Reply all') + '...'
      : (t.dashboard?.emailView?.reply || 'Click to reply') + '...');

  return (
    <Paper
      elevation={isExpanded ? 2 : 0}
      sx={{
        border: '1px solid',
        borderColor: isExpanded ? 'primary.main' : 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: isExpanded ? 'primary.main' : 'primary.light',
        },
      }}
    >
      {/* Collapsed State - Click to Reply */}
      {!isExpanded && (
        <Box
          onClick={handleExpand}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            cursor: 'pointer',
            '&:hover': {
              bgcolor: 'action.hover',
            },
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleExpand()}
          aria-label={collapsedText}
        >
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: avatarColor,
              fontSize: '0.75rem',
            }}
          >
            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
          </Avatar>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ flex: 1, userSelect: 'none' }}
          >
            {collapsedText}
          </Typography>
          {isReplyAll ? <ReplyAll size={18} color="gray" /> : <Reply size={18} color="gray" />}
        </Box>
      )}

      {/* Expanded State - Quick Reply Editor */}
      <Collapse in={isExpanded && showQuickReply}>
        <Box sx={{ p: 2 }}>
          {/* Header with recipients */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Avatar
              sx={{
                width: 28,
                height: 28,
                bgcolor: avatarColor,
                fontSize: '0.7rem',
              }}
            >
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                <Typography variant="caption" color="text.secondary">
                  To:
                </Typography>
                <Chip
                  label={senderInfo.name || senderInfo.email}
                  size="small"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
                {isReplyAll && (replyTo.to?.length || 0) > 1 && (
                  <Chip
                    label={`+${(replyTo.to?.length || 1) - 1}`}
                    size="small"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                )}
              </Stack>
            </Box>
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Open full editor">
                <IconButton size="small" onClick={handleExpandToDialog}>
                  <Maximize2 size={14} />
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={() => setIsExpanded(false)}>
                <ChevronDown size={16} />
              </IconButton>
              {onClose && (
                <IconButton size="small" onClick={onClose}>
                  <X size={16} />
                </IconButton>
              )}
            </Stack>
          </Stack>

          {/* Text Area */}
          <TextField
            inputRef={textFieldRef}
            multiline
            minRows={3}
            maxRows={8}
            fullWidth
            placeholder={t.dashboard?.emailView?.replyPlaceholder || 'Write your reply...'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'background.default',
                '& fieldset': {
                  borderColor: 'divider',
                },
              },
            }}
          />

          {/* Error message */}
          {error && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
              {error}
            </Typography>
          )}

          {/* Toolbar */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mt: 1.5 }}
          >
            <Typography variant="caption" color="text.secondary">
              {onSend ? 'Ctrl+Enter to send' : 'Ctrl+Enter to open full editor'}
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center">
              {onSend ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSend}
                  disabled={isSending || !body.trim()}
                  startIcon={
                    isSending ? <CircularProgress size={14} color="inherit" /> : <Send size={14} />
                  }
                  sx={{ minWidth: 80 }}
                >
                  {isSending ? 'Sending...' : t.dashboard?.email?.composer?.send || 'Send'}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleExpandToDialog}
                  startIcon={<Maximize2 size={14} />}
                  sx={{ minWidth: 100 }}
                >
                  {'Compose'}
                </Button>
              )}
            </Stack>
          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default InlineReplyComposer;
