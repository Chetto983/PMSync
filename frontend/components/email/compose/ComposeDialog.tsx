/**
 * Compose Dialog Component
 *
 * Full email composition dialog with:
 * - Recipients (To/Cc/Bcc) with contact autocomplete
 * - Subject field
 * - Rich text editor (Tiptap)
 * - Attachments with drag-and-drop
 * - Draft autosave
 * - Send functionality
 */

/* eslint-disable react-hooks/set-state-in-effect */
// Dialog initialization requires setState in useEffect - this is a valid pattern
// See: https://github.com/facebook/react/issues/34743

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  Button,
  IconButton,
  Typography,
  FormControl,
  Select,
  MenuItem,
  CircularProgress,
  Divider,
  Alert,
} from '@mui/material';
import { X, Send, Minimize2, Maximize2 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useSendEmail, useSaveDraft, useDeleteDraft } from '@/hooks/queries';
import { useProviders } from '@/hooks/queries/use-providers';
import { ComposeEditor } from './ComposeEditor';
import { ComposeRecipients } from './ComposeRecipients';
import { ComposeAttachments } from './ComposeAttachments';
import { useDebouncedCallback } from 'use-debounce';

interface AttachmentFile {
  id: string;
  file: File;
  name: string;
  size: number;
}

export interface ComposeDialogProps {
  open: boolean;
  onClose: () => void;
  /** Mode: new, reply, replyAll, forward */
  mode?: 'new' | 'reply' | 'replyAll' | 'forward';
  /** Original email for reply/forward */
  originalEmail?: {
    id: string;
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    bodyHtml?: string;
    receivedAt: string;
  };
  /** Draft ID if editing existing draft */
  draftId?: string;
  /** Initial provider ID */
  initialProviderId?: string;
  /** Callback on successful send */
  onSent?: () => void;
}

export function ComposeDialog({
  open,
  onClose,
  mode = 'new',
  originalEmail,
  draftId: initialDraftId,
  initialProviderId,
  onSent,
}: ComposeDialogProps) {
  const t = useTranslations();

  // State
  const [providerId, setProviderId] = useState(initialProviderId || '');
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId || null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Queries
  const { data: providersData } = useProviders();
  const sendEmail = useSendEmail();
  const saveDraft = useSaveDraft();
  const deleteDraft = useDeleteDraft();

  const providers = useMemo(() => providersData || [], [providersData]);
  const isSending = sendEmail.isPending;
  const isSaving = saveDraft.isPending;

  // Build quoted reply HTML - defined before useEffect that uses it
  const buildQuotedReply = useCallback(
    (email: NonNullable<typeof originalEmail>) => {
      const header =
        t.email?.composer?.replyQuotedHeader
          ?.replace('{date}', new Date(email.receivedAt).toLocaleString())
          .replace('{from}', email.from) ||
        `On ${new Date(email.receivedAt).toLocaleString()}, ${email.from} wrote:`;

      return `<br/><br/><blockquote style="border-left: 2px solid #ccc; padding-left: 12px; margin-left: 0; color: #666;">${header}<br/><br/>${email.bodyHtml || ''}</blockquote>`;
    },
    [t]
  );

  // Build forwarded message HTML - defined before useEffect that uses it
  const buildForwardedMessage = useCallback(
    (email: NonNullable<typeof originalEmail>) => {
      const header =
        t.email?.composer?.forwardedMessageHeader ||
        '---------- Forwarded message ----------';

      return `<br/><br/>${header}<br/>From: ${email.from}<br/>Date: ${new Date(email.receivedAt).toLocaleString()}<br/>Subject: ${email.subject}<br/><br/>${email.bodyHtml || ''}`;
    },
    [t]
  );

  // Initialize form based on mode
  useEffect(() => {
    if (!open) return;

    if (mode === 'new') {
      // Reset form for new email
      setTo([]);
      setCc([]);
      setBcc([]);
      setSubject('');
      setBodyHtml('');
      setAttachments([]);
      setDraftId(initialDraftId || null);
    } else if (originalEmail) {
      const replyPrefix = t.email?.composer?.replyPrefix || 'Re:';
      const forwardPrefix = t.email?.composer?.forwardPrefix || 'Fwd:';

      if (mode === 'reply') {
        setTo([originalEmail.from]);
        setCc([]);
        setBcc([]);
        setSubject(
          originalEmail.subject.startsWith(replyPrefix)
            ? originalEmail.subject
            : `${replyPrefix} ${originalEmail.subject}`
        );
        setBodyHtml(buildQuotedReply(originalEmail));
      } else if (mode === 'replyAll') {
        setTo([originalEmail.from]);
        setCc(originalEmail.to.filter((e) => e !== originalEmail.from));
        setBcc([]);
        setSubject(
          originalEmail.subject.startsWith(replyPrefix)
            ? originalEmail.subject
            : `${replyPrefix} ${originalEmail.subject}`
        );
        setBodyHtml(buildQuotedReply(originalEmail));
      } else if (mode === 'forward') {
        setTo([]);
        setCc([]);
        setBcc([]);
        setSubject(
          originalEmail.subject.startsWith(forwardPrefix)
            ? originalEmail.subject
            : `${forwardPrefix} ${originalEmail.subject}`
        );
        setBodyHtml(buildForwardedMessage(originalEmail));
      }
    }

    // Set default provider
    if (!providerId && providers.length > 0) {
      setProviderId(initialProviderId || providers[0].id);
    }

    setError(null);
    setLastSaved(null);
  }, [open, mode, originalEmail, providers, providerId, initialProviderId, initialDraftId, t, buildQuotedReply, buildForwardedMessage]);

  // Debounced autosave
  const debouncedSave = useDebouncedCallback(async () => {
    if (!providerId) return;

    try {
      const result = await saveDraft.mutateAsync({
        providerId,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject,
        bodyHtml,
        existingDraftId: draftId || undefined,
        replyToMessageId: mode !== 'new' && mode !== 'forward' ? originalEmail?.id : undefined,
      });
      setDraftId(result.id);
      setLastSaved(new Date());
    } catch {
      // Silent fail for autosave
    }
  }, 2000);

  // Trigger autosave on changes
  useEffect(() => {
    if (open && (to.length > 0 || subject || bodyHtml)) {
      debouncedSave();
    }
  }, [to, cc, bcc, subject, bodyHtml, open, debouncedSave]);

  // Handle send
  const handleSend = useCallback(async () => {
    if (!providerId) {
      setError(t.email?.composer?.noProvider || 'No email provider selected');
      return;
    }
    if (to.length === 0) {
      setError(t.email?.composer?.validationTo || 'Please enter at least one recipient');
      return;
    }
    if (!subject.trim()) {
      setError(t.email?.composer?.validationSubject || 'Please enter a subject');
      return;
    }

    try {
      setError(null);
      await sendEmail.mutateAsync({
        providerId,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject,
        bodyHtml,
        attachments: attachments.map((a) => a.file),
        replyToMessageId: mode !== 'new' && mode !== 'forward' ? originalEmail?.id : undefined,
        threadId: originalEmail?.id,
      });

      // Delete draft if exists
      if (draftId) {
        try {
          await deleteDraft.mutateAsync(draftId);
        } catch {
          // Silent fail
        }
      }

      onSent?.();
      onClose();
    } catch {
      setError(t.email?.composer?.sendError || 'Failed to send email. Please try again.');
    }
  }, [
    providerId,
    to,
    cc,
    bcc,
    subject,
    bodyHtml,
    attachments,
    mode,
    originalEmail,
    draftId,
    sendEmail,
    deleteDraft,
    onSent,
    onClose,
    t,
  ]);

  // Handle attachment add
  const handleAddAttachments = useCallback((files: File[]) => {
    const newAttachments = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  // Handle attachment remove
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Format last saved time - computed directly since it depends on current time
  const formatLastSaved = useCallback(() => {
    if (!lastSaved) return null;
    const diff = Date.now() - lastSaved.getTime();
    if (diff < 60000) return t.email?.composer?.savedJustNow || 'Saved just now';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) {
      return (
        t.email?.composer?.savedMinutesAgo?.replace('{minutes}', String(minutes)) ||
        `Saved ${minutes}m ago`
      );
    }
    const hours = Math.floor(minutes / 60);
    return (
      t.email?.composer?.savedHoursAgo?.replace('{hours}', String(hours)) ||
      `Saved ${hours}h ago`
    );
  }, [lastSaved, t]);

  const lastSavedText = formatLastSaved();

  // Dialog title based on mode
  const dialogTitle = useMemo(() => {
    switch (mode) {
      case 'reply':
      case 'replyAll':
        return t.email?.composer?.titleReply || 'Reply';
      case 'forward':
        return t.email?.composer?.titleForward || 'Forward';
      default:
        return t.email?.composer?.title || 'New Message';
    }
  }, [mode, t]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={isFullscreen ? false : 'md'}
      fullWidth
      fullScreen={isFullscreen}
      // Disable focus enforcement to prevent file input from triggering multiple times
      // See: https://github.com/reactjs/react-modal/issues/494
      disableEnforceFocus
      PaperProps={{
        sx: {
          height: isFullscreen ? '100%' : '80vh',
          maxHeight: isFullscreen ? '100%' : '80vh',
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: 1.5,
          px: 2,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" component="span">
          {dialogTitle}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={() => setIsFullscreen((prev) => !prev)}>
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </IconButton>
          <IconButton size="small" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Error alert */}
        {error && (
          <Alert severity="error" sx={{ mx: 2, mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* From selector */}
        {providers.length > 1 && (
          <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <FormControl size="small" fullWidth>
              <Select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                displayEmpty
              >
                {providers.map((provider) => (
                  <MenuItem key={provider.id} value={provider.id}>
                    {provider.email}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* Recipients */}
        <ComposeRecipients
          to={to}
          cc={cc}
          bcc={bcc}
          onToChange={setTo}
          onCcChange={setCc}
          onBccChange={setBcc}
          showCcBcc={mode === 'replyAll'}
        />

        {/* Subject */}
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            variant="standard"
            placeholder={t.email?.composer?.subjectPlaceholder || 'Email subject'}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            InputProps={{ disableUnderline: true }}
            sx={{ '& .MuiInputBase-input': { fontWeight: 500 } }}
          />
        </Box>

        {/* Editor */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <ComposeEditor
            initialContent={bodyHtml}
            onChange={setBodyHtml}
            minHeight={200}
            autoFocus={mode === 'new'}
          />
        </Box>

        {/* Attachments */}
        <Divider />
        <ComposeAttachments
          attachments={attachments}
          onAdd={handleAddAttachments}
          onRemove={handleRemoveAttachment}
        />
      </DialogContent>

      {/* Footer */}
      <DialogActions
        sx={{
          px: 2,
          py: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {lastSavedText && (
            <Typography variant="caption" color="text.secondary">
              {isSaving ? (t.email?.composer?.saving || 'Saving...') : lastSavedText}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={onClose}
            disabled={isSending}
          >
            {t.email?.composer?.discard || 'Discard'}
          </Button>
          <Button
            variant="contained"
            onClick={handleSend}
            disabled={isSending || to.length === 0}
            startIcon={isSending ? <CircularProgress size={16} /> : <Send size={16} />}
          >
            {isSending
              ? t.email?.composer?.sending || 'Sending...'
              : t.email?.composer?.send || 'Send'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

export default ComposeDialog;
