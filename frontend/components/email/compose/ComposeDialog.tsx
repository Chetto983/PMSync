import { useState, useCallback, useEffect, useRef } from 'react';
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
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ScheduleIcon from '@mui/icons-material/Schedule';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import { useTranslations } from '@/lib/hooks/use-translations';
import ComposeEditor from './ComposeEditor';
import ComposeRecipients, { type Recipient } from './ComposeRecipients';
import ComposeAttachments, { type Attachment } from './ComposeAttachments';

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
  onSend?: (data: {
    to: Recipient[];
    cc: Recipient[];
    bcc: Recipient[];
    subject: string;
    body: string;
    attachments: Attachment[];
  }) => void;
  onSent?: () => void;
  onSchedule?: () => void;
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

export default function ComposeDialog({
  open,
  onClose,
  onSend,
  onSent,
  onSchedule,
  mode = 'new',
  originalEmail,
  draftId: _draftId,
  initialProviderId: _initialProviderId,
  initialTo = [],
  initialCc = [],
  initialBcc = [],
  initialSubject = '',
  initialBody = '',
  title,
}: ComposeDialogProps) {
  const t = useTranslations();

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

  const [to, setTo] = useState<Recipient[]>(computeInitialTo);
  const [cc, setCc] = useState<Recipient[]>(computeInitialCc);
  const [bcc, setBcc] = useState<Recipient[]>(initialBcc);
  const [subject, setSubject] = useState(computeInitialSubject);
  const [body, setBody] = useState(computeInitialBody);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when mode/originalEmail changes
  useEffect(() => {
    setTo(computeInitialTo());
    setCc(computeInitialCc());
    setBcc(initialBcc);
    setSubject(computeInitialSubject());
    setBody(computeInitialBody());
    setAttachments([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, originalEmail?.id]);

  const handleSend = useCallback(() => {
    if (onSend) {
      onSend({
        to,
        cc,
        bcc,
        subject,
        body,
        attachments,
      });
    }
    if (onSent) {
      onSent();
    }
  }, [to, cc, bcc, subject, body, attachments, onSend, onSent]);

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

  const canSend = to.length > 0;

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

  return (
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
        <Box sx={{ display: 'flex', gap: 0.5 }}>
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

      <Box sx={{ flex: 0 }}>
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
            onChange={(e) => setSubject(e.target.value)}
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
            onChange={setBody}
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

        {onSchedule && (
          <Button
            variant="outlined"
            startIcon={<ScheduleIcon />}
            onClick={onSchedule}
          >
            {t.email.scheduleSend.schedule}
          </Button>
        )}
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          onClick={handleSend}
          disabled={!canSend}
        >
          {t.common.send}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
