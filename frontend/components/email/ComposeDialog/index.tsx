/**
 * ComposeDialog - Email composition dialog
 *
 * Modular architecture following 2025 best practices:
 * - Hooks for state management and logic
 * - Small, focused UI components
 * - Max ~300 lines per file
 *
 * @example
 * ```tsx
 * <ComposeDialog
 *   open={isOpen}
 *   defaultProviderId={providerId}
 *   onClose={() => setIsOpen(false)}
 *   onSent={() => showSuccess('Email sent!')}
 * />
 * ```
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Box,
  IconButton,
  Typography,
  CircularProgress,
  Chip,
  Button,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { X, Check, Maximize2, Minimize2 } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import { marked } from 'marked';
import { useComposeEditor } from '@/hooks/use-compose-editor';
import { useDraftAutosave } from '@/hooks/use-draft-autosave';
import { useDeleteDraft, useForwardEmail, useReplyEmail, useSendEmail } from '@/hooks/mutations';
import { useTranslations } from '@/lib/hooks/use-translations';
import { logger } from '@/lib/logger';
import { htmlToPlainText } from './compose-utils';

// Hooks
import { useComposeState, useComposeAttachments, useComposeAI } from './hooks';

// Components
import { ComposeProviderSelector } from './ComposeProviderSelector';
import { ComposeRecipients } from './ComposeRecipients';
import { ComposeAttachmentsList } from './ComposeAttachmentsList';
import { ComposeDragOverlay } from './ComposeDragOverlay';
import { ComposeFooter } from './ComposeFooter';
import { EditorToolbar } from './EditorToolbar';
import { SmartReplySuggestions } from '@/components/email/ai/SmartReplySuggestions';
import { AiChatPanel } from './AiChatPanel';
import { AiComposeDialog } from './AiComposeDialog';

// Types
import type { ComposeDialogProps } from './types';

// Re-export types and props
export type { ComposeDialogProps, ComposePrefillData, ComposeMode } from './types';

export function ComposeDialog({
  open,
  mode = 'compose',
  defaultProviderId,
  prefillData,
  onClose,
  onSent,
  onError,
}: ComposeDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const t = useTranslations();

  // Form state hook
  const formState = useComposeState({ open, prefillData });
  const { to, cc, bcc, subject, body, showCc, showBcc, attachments } = formState;
  const { setTo, setCc, setBcc, setSubject, setBody, setShowCc, setShowBcc, setAttachments, resetForm } = formState;

  // Provider state
  const [selectedProvider, setSelectedProvider] = useState(defaultProviderId || '');
  const [sending, setSending] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [smartRepliesDismissed, setSmartRepliesDismissed] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Track mounted state to prevent state updates after unmount (race condition fix)
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Mutations
  const sendEmailMutation = useSendEmail();
  const replyEmailMutation = useReplyEmail();
  const forwardEmailMutation = useForwardEmail();
  const deleteDraftMutation = useDeleteDraft();

  // Extract email from "Name <email>" format
  const extractEmail = useCallback((emailString: string): string => {
    const match = emailString.match(/<(.+?)>/);
    return match ? match[1] : emailString.trim();
  }, []);

  const cleanEmailArray = useCallback(
    (emails: string[]): string[] => {
      if (!Array.isArray(emails)) return [];
      return emails.map(extractEmail).filter((e) => e.length > 0);
    },
    [extractEmail]
  );

  // Attachments hook
  const attachmentsHook = useComposeAttachments({
    attachments,
    setAttachments,
    onError,
    t,
  });

  // AI compose hook
  const aiHook = useComposeAI({
    to,
    subject,
    mode,
    locale: t.locale,
    cleanEmailArray,
    onError,
    t,
  });

  // TipTap editor
  const editor = useComposeEditor({
    initialContent: body,
    placeholder: t.email.composer.bodyPlaceholder,
    onChange: (html) => setBody(html),
    autofocus: false,
    editable: !sending,
  });

  // Sync editor content when body changes externally
  useEffect(() => {
    if (editor && body !== editor.getHTML()) {
      editor.commands.setContent(body);
    }
  }, [editor, body]);

  // Reset smart replies when dialog opens
  useEffect(() => {
    if (open) {
      setSmartRepliesDismissed(false);
    }
  }, [open]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      }
      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        e.stopPropagation();
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isFullscreen]);

  // Draft autosave
  const draftData = {
    providerId: selectedProvider,
    to: to.length > 0 ? cleanEmailArray(to) : undefined,
    cc: cc.length > 0 ? cleanEmailArray(cc) : undefined,
    bcc: bcc.length > 0 ? cleanEmailArray(bcc) : undefined,
    subject: subject || undefined,
    bodyHtml: body || undefined,
    bodyText: body ? htmlToPlainText(body) : undefined,
  };

  const { isSaving: isDraftSaving, lastSaved } = useDraftAutosave({
    draftData: selectedProvider ? draftData : { providerId: '' },
    initialDraftId: prefillData?.draftId,
    enabled: open && !!selectedProvider && mode === 'compose',
    interval: 30000,
  });

  const formatLastSaved = useCallback(
    (date: Date | null): string => {
      if (!date) return '';
      const diff = Date.now() - date.getTime();
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) return t.email.composer.savedJustNow;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return t.email.composer.savedMinutesAgo.replace('{minutes}', String(minutes));
      const hours = Math.floor(minutes / 60);
      return t.email.composer.savedHoursAgo.replace('{hours}', String(hours));
    },
    [t]
  );

  // Check for unsaved changes
  const hasChanges = useCallback(() => {
    const bodyText = htmlToPlainText(body);
    const changes = !!(to.length > 0 || cc.length > 0 || bcc.length > 0 || subject.trim() || bodyText.trim());
    return changes;
  }, [to, cc, bcc, subject, body]);

  // Request to close - shows confirmation if there are unsaved changes
  const requestClose = useCallback(() => {
    if (hasChanges() && !sending) {
      setConfirmDialogOpen(true);
    } else {
      onClose();
    }
  }, [hasChanges, sending, onClose]);

  // Force close without confirmation (for confirm dialog)
  const handleConfirmDiscard = useCallback(() => {
    setConfirmDialogOpen(false);
    onClose();
  }, [onClose]);

  // Cancel discard - keep dialog open
  const handleCancelDiscard = useCallback(() => {
    setConfirmDialogOpen(false);
  }, []);

  const handleSend = useCallback(async () => {
    if (!selectedProvider) {
      onError?.(t.email.composer.noProvider);
      return;
    }

    const toEmails = cleanEmailArray(to);
    if (toEmails.length === 0) {
      onError?.(t.email.composer.validationTo);
      return;
    }

    if (!subject.trim()) {
      onError?.(t.email.composer.validationSubject);
      return;
    }

    const bodyHtml = body.trim() || '<p></p>';
    const payload = {
      providerId: selectedProvider,
      to: toEmails,
      cc: cc.length > 0 ? cleanEmailArray(cc) : undefined,
      bcc: bcc.length > 0 ? cleanEmailArray(bcc) : undefined,
      subject: subject.trim(),
      bodyHtml,
      bodyText: htmlToPlainText(bodyHtml),
      inReplyTo: prefillData?.inReplyTo,
      references: prefillData?.references,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    try {
      setSending(true);
      if (mode === 'reply' && prefillData?.originalEmailId) {
        const { providerId: _p, ...replyPayload } = payload;
        await replyEmailMutation.mutateAsync({ emailId: prefillData.originalEmailId, payload: replyPayload });
      } else if (mode === 'forward' && prefillData?.originalEmailId) {
        const { providerId: _p, ...forwardPayload } = payload;
        await forwardEmailMutation.mutateAsync({ emailId: prefillData.originalEmailId, payload: forwardPayload });
      } else {
        await sendEmailMutation.mutateAsync(payload);
      }

      if (prefillData?.draftId) {
        try {
          await deleteDraftMutation.mutateAsync(prefillData.draftId);
        } catch (draftErr) {
          logger.warn('Failed to delete draft after send', { error: draftErr });
        }
      }

      // Check if still mounted before state updates (race condition fix)
      if (!isMountedRef.current) return;

      onSent?.();
      onClose();
      resetForm();
    } catch (error) {
      // Check if still mounted before state updates (race condition fix)
      if (!isMountedRef.current) return;

      logger.error('Failed to send email', { error });
      onError?.(t.email.composer.sendError);
    } finally {
      // Only update state if still mounted (race condition fix)
      if (isMountedRef.current) {
        setSending(false);
      }
    }
  }, [selectedProvider, to, cc, bcc, subject, body, attachments, mode, prefillData, cleanEmailArray, onError, onSent, onClose, resetForm, t, sendEmailMutation, replyEmailMutation, forwardEmailMutation, deleteDraftMutation]);

  const handleSmartReplySelect = useCallback(
    (reply: string) => {
      setBody(reply);
      if (editor) {
        editor.commands.setContent(reply);
      }
      setSmartRepliesDismissed(true);
    },
    [editor, setBody]
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        maxWidth={isFullscreen ? false : 'md'}
        fullWidth={!isFullscreen}
        fullScreen={isMobile || isFullscreen}
        data-testid="compose-dialog"
        PaperProps={{
          sx: {
            height: isMobile || isFullscreen ? '100%' : '80vh',
            maxHeight: isMobile || isFullscreen ? '100%' : 800,
            transition: 'all 0.2s ease-in-out',
          },
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6">
                {mode === 'reply' && t.email.composer.titleReply}
                {mode === 'forward' && t.email.composer.titleForward}
                {mode === 'compose' && t.email.composer.title}
              </Typography>
              {mode === 'compose' && (
                <Chip
                  size="small"
                  icon={isDraftSaving ? <CircularProgress size={12} /> : <Check size={12} />}
                  label={isDraftSaving ? t.email.composer.saving : formatLastSaved(lastSaved)}
                  sx={{ height: 20, fontSize: '0.7rem', display: lastSaved || isDraftSaving ? 'flex' : 'none' }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {!isMobile && (
                <IconButton size="small" onClick={() => setIsFullscreen((p) => !p)} disabled={sending} title={isFullscreen ? t.email.composer.exitFullscreen : t.email.composer.fullscreen}>
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </IconButton>
              )}
              <IconButton size="small" onClick={requestClose} disabled={sending}>
                <X size={20} />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent
          dividers
          sx={{ p: 0, position: 'relative' }}
          onDragEnter={attachmentsHook.handleDragEnter}
          onDragLeave={attachmentsHook.handleDragLeave}
          onDragOver={attachmentsHook.handleDragOver}
          onDrop={attachmentsHook.handleDrop}
        >
          <ComposeDragOverlay isDragging={attachmentsHook.isDragging} t={t} />

          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <ComposeProviderSelector selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} defaultProviderId={defaultProviderId} sending={sending} open={open} t={t} />

            <ComposeRecipients to={to} cc={cc} bcc={bcc} showCc={showCc} showBcc={showBcc} sending={sending} onToChange={setTo} onCcChange={setCc} onBccChange={setBcc} onShowCcChange={setShowCc} onShowBccChange={setShowBcc} t={t} />

            {/* Subject Field */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 500 }}>
                  {t.email.composer.subjectLabel}
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  placeholder={t.email.composer.subjectPlaceholder}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={sending}
                  inputProps={{ 'data-testid': 'compose-subject-input' }}
                  sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { border: 'none' } } }}
                />
              </Box>
            </Box>

            {/* Smart Reply Suggestions */}
            {mode === 'reply' && prefillData?.originalEmailId && !smartRepliesDismissed && (
              <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                <SmartReplySuggestions emailId={prefillData.originalEmailId} onSelectReply={handleSmartReplySelect} onDismiss={() => setSmartRepliesDismissed(true)} defaultExpanded={false} showToneSelector />
              </Box>
            )}

            <ComposeAttachmentsList attachments={attachments} onRemove={attachmentsHook.handleRemoveAttachment} locale={t.locale} t={t} />

            <EditorToolbar
              editor={editor}
              onAiCompose={() => {
                aiHook.resetAiState();
                aiHook.setAiDialogOpen(true);
              }}
              aiComposing={aiHook.aiComposing}
              compact={isMobile}
            />

            {/* Body Editor */}
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                '& .ProseMirror': { minHeight: 200, maxHeight: 400, outline: 'none', p: 2 },
                '& .ProseMirror p.is-editor-empty:first-child::before': {
                  color: 'text.disabled',
                  content: 'attr(data-placeholder)',
                  float: 'left',
                  height: 0,
                  pointerEvents: 'none',
                },
              }}
            >
              <EditorContent editor={editor} />
            </Box>

            <AiChatPanel
              emailBody={body}
              emailSubject={subject}
              recipients={cleanEmailArray(to)}
              mode={mode}
              onInsertSuggestion={(text) => editor?.commands.insertContent(marked.parse(text, { async: false }) as string)}
              onReplaceBody={(text) => {
                const html = marked.parse(text, { async: false }) as string;
                setBody(html);
                editor?.commands.setContent(html);
              }}
              onUpdateSubject={(text) => !subject && setSubject(text)}
              t={t}
              locale={t.locale}
            />
          </Box>
        </DialogContent>

        <ComposeFooter
          sending={sending}
          uploading={attachmentsHook.uploading}
          canSend={to.length > 0}
          fileInputRef={attachmentsHook.fileInputRef}
          onFileSelect={attachmentsHook.handleFileSelect}
          onDiscard={requestClose}
          onSend={handleSend}
          t={t}
        />
      </Dialog>

      {/* Discard Confirmation Dialog */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelDiscard}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t.email.composer.discard}</DialogTitle>
        <DialogContent>
          <Typography>{t.email.composer.discardConfirm}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDiscard}>
            {t.common?.cancel || 'Cancel'}
          </Button>
          <Button onClick={handleConfirmDiscard} color="error" variant="contained">
            {t.email.composer.discard}
          </Button>
        </DialogActions>
      </Dialog>

      <AiComposeDialog
        open={aiHook.aiDialogOpen}
        onClose={() => {
          aiHook.setAiDialogOpen(false);
          aiHook.resetAiState();
        }}
        onSubmit={() => aiHook.handleAiComposeSubmit(setBody, setSubject, editor)}
        onGenerate={aiHook.handleAiGenerate}
        prompt={aiHook.aiPrompt}
        setPrompt={aiHook.setAiPrompt}
        tone={aiHook.aiTone}
        setTone={aiHook.setAiTone}
        variant={aiHook.aiVariant}
        setVariant={aiHook.setAiVariant}
        loading={aiHook.aiComposing}
        mode={mode}
        preview={aiHook.aiPreview}
        t={t}
      />
    </>
  );
}
