import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ScheduleIcon from '@mui/icons-material/Schedule';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import { useDebounce } from 'use-debounce';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useProviders } from '@/hooks/queries/use-providers';
import {
  useSendEmail,
  useReplyToEmail,
  useForwardEmail,
  useSaveDraft,
  useDeleteDraft,
} from '@/hooks/queries/use-emails';
import ComposeEditor from './ComposeEditor';
import ComposeRecipients, { type Recipient } from './ComposeRecipients';
import ComposeAttachments, { type Attachment } from './ComposeAttachments';
import ScheduleSendDialog from './ScheduleSendDialog';
import logger from '@/lib/logger';

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

function formatQuotedBody(originalEmail: OriginalEmail | undefined, mode: ComposeMode): string {
  if (!originalEmail?.bodyHtml) return '';

  const date = originalEmail.receivedAt
    ? new Date(originalEmail.receivedAt).toLocaleString()
    : '';
  const from = originalEmail.from?.name || originalEmail.from?.email || '';

  if (mode === 'forward') {
    return `<br><br>---------- Forwarded message ----------<br>From: ${from}<br>Date: ${date}<br><br>${originalEmail.bodyHtml}`;
  }

  return `<br><br>On ${date}, ${from} wrote:<br><blockquote>${originalEmail.bodyHtml}</blockquote>`;
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

  // Providers hook
  const { data: providers = [], isLoading: providersLoading } = useProviders();

  // Find active providers that support email
  const emailProviders = useMemo(
    () => providers.filter((p) => p.isActive && p.supportsEmail),
    [providers],
  );

  // Mutations
  const sendEmail = useSendEmail();
  const replyToEmail = useReplyToEmail();
  const forwardEmail = useForwardEmail();
  const saveDraft = useSaveDraft();
  const deleteDraft = useDeleteDraft();

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
    if (mode !== 'new' && originalEmail) {
      return formatQuotedBody(originalEmail, mode);
    }
    return '';
  };

  // Get default provider ID
  const getDefaultProviderId = (): string => {
    if (initialProviderId) return initialProviderId;
    const defaultProvider = emailProviders.find((p) => p.isDefault);
    return defaultProvider?.id || emailProviders[0]?.id || '';
  };

  // State
  const [providerId, setProviderId] = useState<string>(getDefaultProviderId);
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

  // Error/success state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);

  // Debounced values for autosave
  const [debouncedBody] = useDebounce(body, AUTOSAVE_DELAY_MS);
  const [debouncedSubject] = useDebounce(subject, AUTOSAVE_DELAY_MS);

  // Update provider when providers load
  useEffect(() => {
    if (!providerId && emailProviders.length > 0) {
      setProviderId(getDefaultProviderId());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailProviders]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, originalEmail?.id, open]);

  // Autosave draft
  useEffect(() => {
    if (!open || !providerId || !isDirtyRef.current) return;
    // Don't autosave in reply/forward mode for now (handled differently)
    if (mode !== 'new') return;

    const shouldSave = debouncedBody.length > 10 || debouncedSubject.length > 0;
    if (!shouldSave) return;

    const saveCurrentDraft = async () => {
      try {
        const result = await saveDraft.mutateAsync({
          providerId,
          to: to.map((r) => r.email),
          cc: cc.map((r) => r.email),
          bcc: bcc.map((r) => r.email),
          subject: debouncedSubject,
          bodyHtml: debouncedBody,
          existingDraftId: draftId,
        });
        setDraftId(result.id);
        setLastSavedAt(new Date());
        logger.debug('Draft autosaved', { draftId: result.id });
      } catch (err) {
        logger.error('Draft autosave failed', err instanceof Error ? err : new Error(String(err)));
      }
    };

    saveCurrentDraft();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBody, debouncedSubject, providerId]);

  // Mark as dirty when content changes
  const handleBodyChange = useCallback((html: string) => {
    setBody(html);
    isDirtyRef.current = true;
  }, []);

  const handleSubjectChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSubject(e.target.value);
    isDirtyRef.current = true;
  }, []);

  // Send email handler
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

    try {
      // Prepare attachment files
      const attachmentFiles = attachments.map((a) => a.file);

      if (mode === 'reply' || mode === 'replyAll') {
        // Reply mode
        if (!originalEmail?.id) {
          setError('Missing original email for reply');
          return;
        }
        await replyToEmail.mutateAsync({
          emailId: originalEmail.id,
          dto: {
            bodyHtml: body,
            cc: cc.map((r) => r.email),
            bcc: bcc.map((r) => r.email),
            attachments: attachmentFiles,
          },
        });
      } else if (mode === 'forward') {
        // Forward mode
        if (!originalEmail?.id) {
          setError('Missing original email for forward');
          return;
        }
        await forwardEmail.mutateAsync({
          emailId: originalEmail.id,
          dto: {
            to: to.map((r) => r.email),
            cc: cc.map((r) => r.email),
            bcc: bcc.map((r) => r.email),
            bodyHtml: body,
            attachments: attachmentFiles,
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
          attachments: attachmentFiles,
          scheduledAt: scheduledAt?.toISOString(),
        });
      }

      // Delete draft after successful send
      if (draftId) {
        await deleteDraft.mutateAsync(draftId);
      }

      const successMsg = scheduledAt
        ? (t.email.scheduleSend?.scheduledFor ?? 'Scheduled')
        : (t.common?.success ?? 'Success');
      setSuccessMessage(successMsg);
      onSent?.();
      onClose();
    } catch (err) {
      logger.error('Send email failed', err instanceof Error ? err : new Error(String(err)));
      setError(composer.sendError);
    }
  }, [
    providerId, to, cc, bcc, subject, body, attachments, mode, originalEmail,
    sendEmail, replyToEmail, forwardEmail, deleteDraft, draftId,
    composer, t, onSent, onClose,
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
        maxWidth={isFullscreen ? false : 'md'}
        fullWidth
        fullScreen={isFullscreen}
        PaperProps={{
          sx: isFullscreen
            ? { display: 'flex', flexDirection: 'column' }
            : {
                height: '80vh',
                maxHeight: 800,
                display: 'flex',
                flexDirection: 'column',
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
                                • Default
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

        <DialogContent sx={{ flex: 1, p: 0, overflow: 'auto' }}>
          <Box sx={{ p: 2 }}>
            <ComposeEditor
              placeholder={t.email.composer.bodyPlaceholder}
              content={body}
              onChange={handleBodyChange}
              minHeight={isFullscreen ? 500 : 300}
              onAttach={handleAttachFromToolbar}
              recipients={to.map((r) => r.email)}
              subject={subject}
            />
          </Box>
        </DialogContent>

        <ComposeAttachments
          attachments={attachments}
          onAttachmentsChange={setAttachments}
        />

        <Divider />

        {/* Footer Actions */}
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Box sx={{ flex: 1 }} />

          {/* Schedule Send Button - only for new emails */}
          {mode === 'new' && (
            <Button
              variant="outlined"
              startIcon={<ScheduleIcon />}
              onClick={() => setShowScheduleDialog(true)}
              disabled={!canSend || isSending}
            >
              {t.email.scheduleSend?.schedule || 'Schedule'}
            </Button>
          )}

          {/* Send Button */}
          <Button
            variant="contained"
            startIcon={isSending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            onClick={() => handleSend()}
            disabled={!canSend || isSending}
          >
            {isSending ? composer.sending : t.common.send}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Schedule Send Dialog */}
      <ScheduleSendDialog
        open={showScheduleDialog}
        onClose={() => setShowScheduleDialog(false)}
        onSchedule={handleScheduleSend}
      />

      {/* Success Snackbar */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
      />
    </>
  );
}
