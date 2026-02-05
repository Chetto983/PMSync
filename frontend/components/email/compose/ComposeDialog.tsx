import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import Skeleton from '@mui/material/Skeleton';
import useMediaQuery from '@mui/material/useMediaQuery';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ScheduleIcon from '@mui/icons-material/Schedule';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useDebounce } from 'use-debounce';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useProviders } from '@/hooks/queries/use-providers';
import { useDefaultSignature } from '@/hooks/queries/use-signatures';
import {
  useSendEmail,
  useReplyToEmail,
  useForwardEmail,
  useSaveDraft,
  useDeleteDraft,
  useEmailDraft,
} from '@/hooks/queries/use-emails';
import { fileToBase64, type DraftAttachmentDto } from '@/lib/api/emails';
import ComposeRecipients, { type Recipient } from './ComposeRecipients';

// Lazy load ComposeEditor - contains heavy TipTap dependencies (~40 packages)
// TipTap uses browser APIs (window, document) so SSR must be disabled
const ComposeEditor = dynamic(
  () => import('./ComposeEditor'),
  {
    loading: () => (
      <Box sx={{ p: 2, minHeight: 300 }}>
        <Skeleton variant="rectangular" height={40} sx={{ mb: 1, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
      </Box>
    ),
    ssr: false,
  }
);
import ComposeAttachments, { type Attachment } from './ComposeAttachments';
import ScheduleSendDialog from './ScheduleSendDialog';
import logger from '@/lib/logger';
import { useUndoSend } from '@/hooks/use-undo-send';
import { UndoSendSnackbar } from './UndoSendSnackbar';

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export type OriginalEmail = {
  id: string;
  from?: { email: string; name?: string };
  to?: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  subject?: string;
  bodyHtml?: string;
  receivedAt?: string;
};

export type ComposeDialogProps = {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  mode?: ComposeMode;
  originalEmail?: OriginalEmail;
  draftId?: string;
  initialProviderId?: string;
  initialTo?: Recipient[];
  initialCc?: Recipient[];
  initialBcc?: Recipient[];
  initialSubject?: string;
  initialBody?: string;
  title?: string;
};

function formatReplySubject(subject: string | undefined, mode: ComposeMode): string {
  if (!subject) return '';
  if (mode === 'forward') {
    return subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`;
  }
  return subject.startsWith('Re:') ? subject : `Re: ${subject}`;
}

/** Get quote header text (On date, sender wrote:) */
function getQuoteHeader(originalEmail: OriginalEmail | undefined, mode: ComposeMode): string {
  if (!originalEmail) return '';
  const date = originalEmail.receivedAt
    ? new Date(originalEmail.receivedAt).toLocaleString()
    : '';
  const from = originalEmail.from?.name || originalEmail.from?.email || '';

  if (mode === 'forward') {
    return `---------- Forwarded message ----------\nFrom: ${from}\nDate: ${date}`;
  }
  return `On ${date}, ${from} wrote:`;
}

// Constants
const AUTOSAVE_DELAY_MS = 2000;

export default function ComposeDialog({
  open,
  onClose,
  onSent,
  mode = 'new',
  originalEmail,
  draftId: initialDraftId,
  initialProviderId,
  initialTo = [],
  initialCc = [],
  initialBcc = [],
  initialSubject = '',
  initialBody = '',
  title,
}: ComposeDialogProps) {
  const t = useTranslations();
  const composer = t.email.composer;

  // Mobile detection for responsive fullscreen
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md')); // < 768px

  // Providers hook
  const { data: providers = [], isLoading: providersLoading } = useProviders();

  // Find active providers that support email
  const emailProviders = useMemo(
    () => providers.filter((p) => p.isActive && p.supportsEmail),
    [providers],
  );

  // Get default provider ID (computed early for signature hook)
  const computedProviderId = useMemo(() => {
    if (initialProviderId) return initialProviderId;
    const defaultProvider = emailProviders.find((p) => p.isDefault);
    return defaultProvider?.id || emailProviders[0]?.id || '';
  }, [initialProviderId, emailProviders]);

  // Get default signature for the selected provider
  // Note: We append signature in frontend so user can see/edit it, then pass signatureId: null to backend
  const { data: defaultSignature, isLoading: signatureLoading, isFetched: signatureFetched } = useDefaultSignature(computedProviderId);

  // Mutations
  const sendEmail = useSendEmail();
  const replyToEmail = useReplyToEmail();
  const forwardEmail = useForwardEmail();
  const saveDraft = useSaveDraft();
  const deleteDraft = useDeleteDraft();

  // Undo send (30 second delay)
  const { queueSend, cancelSend, pendingSend } = useUndoSend();

  // Fetch existing draft to restore attachments (only when editing a draft)
  const { data: existingDraft } = useEmailDraft(initialDraftId || '');

  // Compute initial values based on mode and originalEmail
  const computeInitialTo = (): Recipient[] => {
    if (initialTo.length > 0) return initialTo;
    if (mode === 'reply' || mode === 'replyAll') {
      if (originalEmail?.from) {
        return [{ email: originalEmail.from.email, name: originalEmail.from.name }];
      }
    }
    return [];
  };

  const computeInitialCc = (): Recipient[] => {
    if (initialCc.length > 0) return initialCc;
    if (mode === 'replyAll' && originalEmail?.cc) {
      return originalEmail.cc.map((c) => ({ email: c.email, name: c.name }));
    }
    return [];
  };

  const computeInitialSubject = (): string => {
    if (initialSubject) return initialSubject;
    if (mode !== 'new' && originalEmail) {
      return formatReplySubject(originalEmail.subject, mode);
    }
    return '';
  };

  const computeInitialBody = (): string => {
    if (initialBody) return initialBody;
    // Don't include quoted content in editor - it's shown separately
    return '';
  };

  // State - use computedProviderId from above as initial value
  const [providerId, setProviderId] = useState<string>('');
  const [to, setTo] = useState<Recipient[]>(computeInitialTo);
  const [cc, setCc] = useState<Recipient[]>(computeInitialCc);
  const [bcc, setBcc] = useState<Recipient[]>(initialBcc);
  const [subject, setSubject] = useState(computeInitialSubject);
  const [body, setBody] = useState(computeInitialBody);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(initialDraftId);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  // Quoted content - rendered separately from editor (like Gmail/Outlook)
  const [showQuotedContent, setShowQuotedContent] = useState(true);
  const quotedContent = mode !== 'new' && originalEmail?.bodyHtml ? originalEmail.bodyHtml : '';
  const quoteHeader = getQuoteHeader(originalEmail, mode);

  // Error/success state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);
  const signatureAppendedRef = useRef(false);

  // Debounced values for autosave
  const [debouncedBody] = useDebounce(body, AUTOSAVE_DELAY_MS);
  const [debouncedSubject] = useDebounce(subject, AUTOSAVE_DELAY_MS);

  // Sync providerId state with computedProviderId when providers load
  useEffect(() => {
    if (computedProviderId && providerId !== computedProviderId) {
      setProviderId(computedProviderId);
    }
  }, [computedProviderId, providerId]);

  // Reset state when mode/originalEmail changes
  useEffect(() => {
    setTo(computeInitialTo());
    setCc(computeInitialCc());
    setBcc(initialBcc);
    setSubject(computeInitialSubject());
    setBody(computeInitialBody());
    setAttachments([]);
    setDraftId(initialDraftId);
    setLastSavedAt(null);
    isDirtyRef.current = false;
    // Always reset signature flag when body is reset, so signature can be re-appended
    signatureAppendedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, originalEmail?.id, open]);

  // Auto-append default signature when dialog opens
  // Signature is shown in editor so user can see/edit it
  // We pass signatureId: null to backend to prevent double-append
  useEffect(() => {
    // Debug: log signature data
    // Wait for signature to be fetched before deciding
    if (!signatureFetched) return;
    if (open && defaultSignature?.content && !signatureAppendedRef.current) {
      // Append signature to body with a line break before it
      setBody((prevBody) => {
        // If body already has content (e.g., quoted reply), insert signature before it
        if (prevBody && prevBody.trim()) {
          return `<p><br></p>${defaultSignature.content}<p><br></p>${prevBody}`;
        }
        // For new emails, just add signature
        return `<p><br></p>${defaultSignature.content}`;
      });
      signatureAppendedRef.current = true;
    }
  }, [open, defaultSignature, signatureFetched, computedProviderId, signatureLoading]);

  // Restore attachments from draft when editing an existing draft
  // Converts base64 data back to File objects for seamless UX
  const draftAttachmentsRestoredRef = useRef(false);
  useEffect(() => {
    if (!open || !existingDraft || draftAttachmentsRestoredRef.current) return;

    // Check if draft has saved attachments in metadata
    const draftAttachments = (existingDraft as { metadata?: { draftAttachments?: DraftAttachmentDto[] } })
      ?.metadata?.draftAttachments;

    if (draftAttachments && draftAttachments.length > 0) {
      // Convert base64 attachments back to File objects
      const restoredAttachments: Attachment[] = draftAttachments.map((att) => {
        // Strip data URI prefix if present (e.g., "data:application/pdf;base64,...")
        const base64Data = att.contentBase64.includes(',')
          ? att.contentBase64.split(',')[1]
          : att.contentBase64;

        // Convert base64 to Blob then to File
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: att.contentType });
        const file = new File([blob], att.filename, { type: att.contentType });

        return {
          file,
          id: `restored-${att.filename}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
      });

      setAttachments(restoredAttachments);
      draftAttachmentsRestoredRef.current = true;
      logger.debug('Draft attachments restored', { count: restoredAttachments.length });
    }
  }, [open, existingDraft]);

  // Reset draft attachments restored flag when dialog closes
  useEffect(() => {
    if (!open) {
      draftAttachmentsRestoredRef.current = false;
    }
  }, [open]);

  // Autosave draft (includes attachments for full persistence)
  useEffect(() => {
    if (!open || !providerId || !isDirtyRef.current) return;
    // Don't autosave in reply/forward mode for now (handled differently)
    if (mode !== 'new') return;

    const shouldSave = debouncedBody.length > 10 || debouncedSubject.length > 0 || attachments.length > 0;
    if (!shouldSave) return;

    const saveCurrentDraft = async () => {
      try {
        // Convert attachments to base64 for draft persistence
        const attachmentDtos: DraftAttachmentDto[] = await Promise.all(
          attachments.map(async (att) => ({
            filename: att.file.name,
            contentType: att.file.type,
            contentBase64: await fileToBase64(att.file),
            size: att.file.size,
          }))
        );

        const result = await saveDraft.mutateAsync({
          providerId,
          to: to.map((r) => r.email),
          cc: cc.map((r) => r.email),
          bcc: bcc.map((r) => r.email),
          subject: debouncedSubject,
          bodyHtml: debouncedBody,
          existingDraftId: draftId,
          attachments: attachmentDtos.length > 0 ? attachmentDtos : undefined,
        });
        setDraftId(result.id);
        setLastSavedAt(new Date());
        logger.debug('Draft autosaved', { draftId: result.id, attachmentCount: attachmentDtos.length });
      } catch (err) {
        logger.error('Draft autosave failed', err instanceof Error ? err : new Error(String(err)));
      }
    };

    saveCurrentDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBody, debouncedSubject, providerId, attachments]);

  // Mark as dirty when content changes
  const handleBodyChange = useCallback((html: string) => {
    setBody(html);
    isDirtyRef.current = true;
  }, []);

  const handleSubjectChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSubject(e.target.value);
    isDirtyRef.current = true;
  }, []);

  // Actual send function (called after undo delay or immediately for scheduled)
  const performSend = useCallback(async (scheduledAt?: Date) => {
    // Build full body with quoted content for reply/forward
    let fullBodyHtml = body;
    let fullBodyText = '';

    if (quotedContent && (mode === 'reply' || mode === 'replyAll' || mode === 'forward')) {
      // Combine user's reply with quoted content
      const quoteHeaderHtml = quoteHeader.split('\n').join('<br>');
      fullBodyHtml = `${body}<br><br><div style="color:#666;border-left:2px solid #ccc;padding-left:10px;margin-left:0">${quoteHeaderHtml}<br><br>${quotedContent}</div>`;
    }

    // Generate plain text version
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = fullBodyHtml;
    fullBodyText = tempDiv.innerText || tempDiv.textContent || '';

    const attachmentFiles = attachments.map((a) => a.file);

    if (mode === 'reply' || mode === 'replyAll') {
      // Reply mode
      if (!originalEmail?.id) {
        throw new Error(composer.missingOriginalReply);
      }
      await replyToEmail.mutateAsync({
        emailId: originalEmail.id,
        dto: {
          bodyHtml: fullBodyHtml,
          bodyText: fullBodyText,
          cc: cc.map((r) => r.email),
          bcc: bcc.map((r) => r.email),
          attachments: attachmentFiles,
          signatureId: null,
        },
      });
    } else if (mode === 'forward') {
      // Forward mode
      if (!originalEmail?.id) {
        throw new Error(composer.missingOriginalForward);
      }
      await forwardEmail.mutateAsync({
        emailId: originalEmail.id,
        dto: {
          to: to.map((r) => r.email),
          cc: cc.map((r) => r.email),
          bcc: bcc.map((r) => r.email),
          attachments: attachmentFiles,
          signatureId: null,
        },
      });
    } else {
      // New email mode
      await sendEmail.mutateAsync({
        providerId,
        to: to.map((r) => r.email),
        cc: cc.map((r) => r.email),
        bcc: bcc.map((r) => r.email),
        subject,
        bodyHtml: body,
        bodyText: fullBodyText,
        attachments: attachmentFiles,
        scheduledAt: scheduledAt?.toISOString(),
        signatureId: null,
      });
    }

    // Delete draft after successful send
    if (draftId) {
      await deleteDraft.mutateAsync(draftId);
    }
  }, [
    body, attachments, mode, originalEmail, quotedContent, quoteHeader,
    providerId, to, cc, bcc, subject, draftId,
    sendEmail, replyToEmail, forwardEmail, deleteDraft, composer,
  ]);

  // Send email handler - validates then queues with undo delay
  const handleSend = useCallback(async (scheduledAt?: Date) => {
    if (!providerId) {
      setError(composer.noProvider);
      return;
    }

    if (to.length === 0) {
      setError(composer.validationTo);
      return;
    }

    setError(null);

    // For scheduled emails, send immediately (no undo needed)
    if (scheduledAt) {
      try {
        await performSend(scheduledAt);
        setSuccessMessage(t.email.scheduleSend?.scheduledFor ?? 'Scheduled');
        onSent?.();
        onClose();
      } catch (err) {
        logger.error('Scheduled send failed', err instanceof Error ? err : new Error(String(err)));
        setError(composer.sendError);
      }
      return;
    }

    // Queue send with 30 second undo window
    queueSend({
      sendFn: async () => {
        await performSend();
      },
      onSuccess: () => {
        setSuccessMessage(t.email.undoSend.sent);
        onSent?.();
        onClose();
      },
      onCancel: () => {
        // Email cancelled - show message but keep dialog open for editing
        setSuccessMessage(t.email.undoSend.cancelled);
      },
      onError: (err) => {
        logger.error('Send email failed', err instanceof Error ? err : new Error(String(err)));
        setError(composer.sendError);
      },
    });
  }, [
    providerId, to, composer, t, onSent, onClose, performSend, queueSend,
  ]);

  const handleAttachFromToolbar = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newAttachments = Array.from(files).map((file) => ({
        file,
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }));
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const canSend = to.length > 0 && providerId;
  const isSending = sendEmail.isPending || replyToEmail.isPending || forwardEmail.isPending;
  const isPendingSend = pendingSend !== null;
  const isSavingDraft = saveDraft.isPending;

  const getTitle = (): string => {
    if (title) return title;
    switch (mode) {
      case 'reply':
      case 'replyAll':
        return t.email.composer.titleReply;
      case 'forward':
        return t.email.composer.titleForward;
      default:
        return t.email.composer.title;
    }
  };

  // Format save status
  const getSaveStatus = (): string | null => {
    if (isSavingDraft) return composer.saving;
    if (!lastSavedAt) return null;
    const minutesAgo = Math.floor((Date.now() - lastSavedAt.getTime()) / 60000);
    if (minutesAgo < 1) return composer.savedJustNow;
    if (minutesAgo < 60) return composer.savedMinutesAgo.replace('{minutes}', String(minutesAgo));
    return composer.savedHoursAgo.replace('{hours}', String(Math.floor(minutesAgo / 60)));
  };

  // Handle schedule send
  const handleScheduleSend = useCallback((scheduledTime: Date) => {
    handleSend(scheduledTime);
    setShowScheduleDialog(false);
  }, [handleSend]);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth={isMobile || isFullscreen ? false : 'md'}
        fullWidth
        fullScreen={isMobile || isFullscreen}
        PaperProps={{
          sx: {
            // iOS safe area handling for mobile fullscreen
            ...(isMobile && {
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
              paddingRight: 'env(safe-area-inset-right)',
            }),
            // Fullscreen or mobile styles
            ...(isMobile || isFullscreen
              ? { display: 'flex', flexDirection: 'column' }
              : {
                  height: '80vh',
                  maxHeight: 800,
                  display: 'flex',
                  flexDirection: 'column',
                }),
          },
        }}
      >
        {/* Hidden file input for toolbar attach button */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          aria-label={t.email.composer.attachFiles}
          tabIndex={-1}
          onChange={handleFileInputChange}
          hidden
        />

        {isMobile ? (
          // Mobile: AppBar with sticky header for thumb reach
          <AppBar
            position="sticky"
            color="default"
            elevation={0}
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Toolbar sx={{ minHeight: 56 }}>
              <IconButton edge="start" onClick={onClose} aria-label={t.common.close}>
                <CloseIcon />
              </IconButton>
              <Typography variant="h6" sx={{ flex: 1, ml: 1 }}>
                {getTitle()}
              </Typography>
              {/* Save status on mobile */}
              {getSaveStatus() && (
                <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                  {getSaveStatus()}
                </Typography>
              )}
              {/* Send button in header for thumb reach */}
              <Button
                variant="contained"
                size="small"
                onClick={() => handleSend()}
                disabled={!canSend || isSending || isPendingSend}
                startIcon={isSending || isPendingSend ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              >
                {isSending || isPendingSend ? composer.sending : t.common.send}
              </Button>
            </Toolbar>
          </AppBar>
        ) : (
          // Desktop: existing DialogTitle
          <DialogTitle
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1.5,
            }}
          >
            {getTitle()}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Save Status */}
              {getSaveStatus() && (
                <Typography variant="caption" color="text.secondary">
                  {getSaveStatus()}
                </Typography>
              )}
              <Tooltip title={isFullscreen ? t.common.exitFullscreen : t.common.fullscreen}>
                <IconButton onClick={toggleFullscreen} size="small">
                  {isFullscreen ? <CloseFullscreenIcon /> : <OpenInFullIcon />}
                </IconButton>
              </Tooltip>
              <IconButton onClick={onClose} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>
        )}

        <Divider />

        {/* Error Alert */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, mt: 1 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ flex: 0 }}>
          {/* Provider Selection - Only show for new emails */}
          {mode === 'new' && (
            <>
              <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 40 }}>
                  {composer.from}:
                </Typography>
                <FormControl size="small" sx={{ minWidth: 250 }}>
                  {providersLoading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2">{t.common.loading}</Typography>
                    </Box>
                  ) : emailProviders.length === 0 ? (
                    <Typography variant="body2" color="error">
                      {composer.noProvider}
                    </Typography>
                  ) : (
                    <Select
                      value={providerId}
                      onChange={(e) => setProviderId(e.target.value)}
                      displayEmpty
                      variant="standard"
                      disableUnderline
                    >
                      {emailProviders.map((provider) => (
                        <MenuItem key={provider.id} value={provider.id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2">
                              {provider.email}
                            </Typography>
                            {provider.displayName && (
                              <Typography variant="caption" color="text.secondary">
                                ({provider.displayName})
                              </Typography>
                            )}
                            {provider.isDefault && (
                              <Typography variant="caption" color="primary">
                                • {composer.defaultBadge}
                              </Typography>
                            )}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                </FormControl>
              </Box>
              <Divider />
            </>
          )}

          <ComposeRecipients
            to={to}
            cc={cc}
            bcc={bcc}
            onToChange={setTo}
            onCcChange={setCc}
            onBccChange={setBcc}
          />

          <Divider />

          <Box sx={{ px: 2, py: 1 }}>
            <TextField
              fullWidth
              variant="standard"
              placeholder={t.email.composer.subjectPlaceholder}
              value={subject}
              onChange={handleSubjectChange}
              InputProps={{
                disableUnderline: true,
              }}
            />
          </Box>

          <Divider />
        </Box>

        <DialogContent sx={{ flex: 1, p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: quotedContent ? 'none' : 1, p: 2, display: 'flex', flexDirection: 'column', minHeight: quotedContent ? 150 : '100%' }}>
            <ComposeEditor
              placeholder={t.email.composer.bodyPlaceholder}
              content={body}
              onChange={handleBodyChange}
              minHeight={quotedContent ? '120px' : '100%'}
              onAttach={handleAttachFromToolbar}
              recipients={to.map((r) => r.email)}
              subject={subject}
            />
          </Box>

          {/* Quoted content - rendered separately from editor (like Gmail/Outlook) */}
          {quotedContent && (
            <Box sx={{ flex: 1, overflow: 'auto', borderTop: 1, borderColor: 'divider' }}>
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'action.selected' },
                }}
                onClick={() => setShowQuotedContent((prev) => !prev)}
              >
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {quoteHeader}
                </Typography>
                <IconButton size="small">
                  {showQuotedContent ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={showQuotedContent}>
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderLeft: 3,
                    borderColor: 'primary.main',
                    ml: 2,
                    mr: 2,
                    mb: 2,
                    bgcolor: 'grey.50',
                    maxHeight: 300,
                    overflow: 'auto',
                    '& img': { maxWidth: '100%', height: 'auto' },
                    '& table': { maxWidth: '100%', fontSize: '0.875rem' },
                  }}
                  dangerouslySetInnerHTML={{ __html: quotedContent }}
                />
              </Collapse>
            </Box>
          )}
        </DialogContent>

        {attachments.length > 0 && (
          <>
            <ComposeAttachments
              attachments={attachments}
              onAttachmentsChange={setAttachments}
            />
            <Divider />
          </>
        )}

        {/* Footer Actions - only on desktop (mobile has Send in header) */}
        {!isMobile && (
          <DialogActions sx={{ px: 2, py: 1.5 }}>
            <Box sx={{ flex: 1 }} />

            {/* Schedule Send Button - only for new emails */}
            {mode === 'new' && (
              <Button
                variant="outlined"
                startIcon={<ScheduleIcon />}
                onClick={() => setShowScheduleDialog(true)}
                disabled={!canSend || isSending || isPendingSend}
              >
                {t.email.scheduleSend?.schedule || 'Schedule'}
              </Button>
            )}

            {/* Send Button */}
            <Button
              variant="contained"
              startIcon={isSending || isPendingSend ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              onClick={() => handleSend()}
              disabled={!canSend || isSending || isPendingSend}
            >
              {isSending || isPendingSend ? composer.sending : t.common.send}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      {/* Schedule Send Dialog */}
      <ScheduleSendDialog
        open={showScheduleDialog}
        onClose={() => setShowScheduleDialog(false)}
        onSchedule={handleScheduleSend}
      />

      {/* Undo Send Snackbar - shows countdown during pending send */}
      <UndoSendSnackbar
        pendingSend={pendingSend}
        onUndo={cancelSend}
      />

      {/* Success Snackbar */}
      <Snackbar
        open={!!successMessage && !isPendingSend}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
      />
    </>
  );
}
