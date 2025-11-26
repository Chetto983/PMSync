import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  IconButton,
  Collapse,
  Typography,
  CircularProgress,
  Chip,
  useTheme,
  useMediaQuery,
  Autocomplete,
  createFilterOptions,
} from '@mui/material';
import { X, Send, Paperclip, Check, FileText, Trash2 } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import type { SendEmailPayload, EmailAttachmentUpload } from '@/lib/api/email';
import { emailApi } from '@/lib/api/email';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { contactsApi, type Contact } from '@/lib/api/contacts';
import { useDraftAutosave } from '@/hooks/use-draft-autosave';
import { useComposeEditor } from '@/hooks/use-compose-editor';
import { useTranslations } from '@/lib/hooks/use-translations';
import { EditorToolbar } from './EditorToolbar';

export interface ComposeDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;

  /**
   * Mode: compose new, reply, or forward
   */
  mode?: 'compose' | 'reply' | 'forward';

  /**
   * Default provider ID
   */
  defaultProviderId?: string;

  /**
   * Pre-fill data (for reply/forward)
   */
  prefillData?: {
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    inReplyTo?: string;
    references?: string;
  };

  /**
   * Callback when dialog closes
   */
  onClose: () => void;

  /**
   * Callback when email is sent successfully
   */
  onSent?: () => void;

  /**
   * Callback for errors
   */
  onError?: (message: string) => void;
}

/**
 * ComposeDialog - Email composition dialog
 *
 * Features:
 * - To/CC/BCC recipient fields
 * - Subject and body
 * - Send functionality
 * - Close confirmation if unsaved changes
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

  // Form state
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachmentUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Provider state
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>(defaultProviderId || '');

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // TipTap editor
  const editor = useComposeEditor({
    initialContent: body,
    placeholder: t.dashboard.email.composer.bodyPlaceholder,
    onChange: (html) => setBody(html),
    autofocus: false,
    editable: !sending,
  });

  // Initialize form with prefill data
  useEffect(() => {
    if (open && prefillData) {
      setTo(prefillData.to || []);
      setCc(prefillData.cc || []);
      setBcc(prefillData.bcc || []);
      setSubject(prefillData.subject || '');
      setBody(prefillData.body || '');
      setShowCc(!!prefillData.cc?.length);
      setShowBcc(!!prefillData.bcc?.length);
    } else if (open && !prefillData) {
      // Reset form for new compose
      setTo([]);
      setCc([]);
      setBcc([]);
      setSubject('');
      setBody('');
      setShowCc(false);
      setShowBcc(false);
      setAttachments([]);
    }
  }, [open, prefillData]);

  // Sync editor content when body changes externally
  useEffect(() => {
    if (editor && body !== editor.getHTML()) {
      editor.commands.setContent(body);
    }
  }, [editor, body]);

  // Fetch providers when dialog opens
  useEffect(() => {
    if (open) {
      providersApi.getProviders().then((data) => {
        const emailProviders = data.filter((p) => p.supportsEmail);
        setProviders(emailProviders);

        // Set selected provider
        if (!selectedProvider && emailProviders.length > 0) {
          const defaultProvider = emailProviders.find((p) => p.isDefault) || emailProviders[0];
          setSelectedProvider(defaultProvider.id);
        }
      });
    }
  }, [open, selectedProvider]);

  // Update selected provider when defaultProviderId changes
  useEffect(() => {
    if (defaultProviderId) {
      setSelectedProvider(defaultProviderId);
    }
  }, [defaultProviderId]);

  // Fetch contacts when dialog opens - load all contacts for autocomplete
  useEffect(() => {
    if (open) {
      setContactsLoading(true);
      contactsApi.listContacts({ limit: 1000 }) // Load more contacts for better search
        .then((response) => {
          setContacts(response.contacts);
        })
        .catch((error) => {
          console.error('Failed to load contacts:', error);
        })
        .finally(() => {
          setContactsLoading(false);
        });
    }
  }, [open]);

  // Custom filter for Autocomplete - search anywhere in the string (name or email)
  const contactFilterOptions = useMemo(() => {
    return createFilterOptions<string>({
      matchFrom: 'any', // Match anywhere in the string, not just start
      stringify: (option) => option.toLowerCase(), // Search is case-insensitive
    });
  }, []);

  // Extract email address from "Name <email@example.com>" format
  const extractEmail = useCallback((emailString: string): string => {
    const match = emailString.match(/<(.+?)>/);
    return match ? match[1] : emailString.trim();
  }, []);

  // Convert array of emails (possibly in "Name <email>" format) to clean email array
  const cleanEmailArray = useCallback((emails: string[]): string[] => {
    return emails.map(extractEmail).filter(e => e.length > 0);
  }, [extractEmail]);

  // Get email options from contacts for autocomplete
  const emailOptions = useMemo(() => {
    const options: string[] = [];
    contacts.forEach((contact) => {
      if (contact.emails && contact.emails.length > 0) {
        contact.emails.forEach((emailObj) => {
          if (emailObj.value) {
            // Format: "Display Name <email@example.com>" or just "email@example.com"
            const displayName = contact.displayName ||
              (contact.firstName && contact.lastName
                ? `${contact.firstName} ${contact.lastName}`.trim()
                : contact.firstName || contact.lastName);

            if (displayName) {
              options.push(`${displayName} <${emailObj.value}>`);
            } else {
              options.push(emailObj.value);
            }
          }
        });
      }
    });
    return options;
  }, [contacts]);

  // Handle file selection
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const newAttachments: EmailAttachmentUpload[] = [];

      for (const file of Array.from(files)) {
        // Check file size (max 10MB per file)
        if (file.size > 10 * 1024 * 1024) {
          onError?.(t.dashboard.email.composer.fileTooLarge.replace('{filename}', file.name));
          continue;
        }

        // Convert to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix (data:image/png;base64,...)
            const base64Content = result.split(',')[1];
            resolve(base64Content);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newAttachments.push({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64: base64,
        });
      }

      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (error) {
      console.error('Failed to upload attachments:', error);
      onError?.(t.dashboard.email.composer.uploadError);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onError, t]);

  // Remove attachment
  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Format file size
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  // Calculate attachment size from base64
  const getBase64Size = useCallback((base64: string): number => {
    // Base64 encoding increases size by ~33%
    return Math.floor((base64.length * 3) / 4);
  }, []);

  // Draft data for autosave
  const draftData = useMemo(() => {
    if (!selectedProvider) return null;

    return {
      providerId: selectedProvider,
      to: to.length > 0 ? cleanEmailArray(to) : undefined,
      cc: cc.length > 0 ? cleanEmailArray(cc) : undefined,
      bcc: bcc.length > 0 ? cleanEmailArray(bcc) : undefined,
      subject: subject || undefined,
      bodyText: body || undefined,
      bodyHtml: body ? `<p>${body.replace(/\n/g, '<br>')}</p>` : undefined,
    };
  }, [selectedProvider, to, cc, bcc, subject, body, cleanEmailArray]);

  // Autosave draft
  const { isSaving: isDraftSaving, lastSaved } = useDraftAutosave({
    draftData: draftData || { providerId: selectedProvider || '' },
    enabled: open && !!selectedProvider && mode === 'compose', // Only autosave for new compose
    interval: 30000, // 30 seconds
  });

  // Format last saved time
  const formatLastSaved = useCallback((date: Date | null): string => {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);

    if (seconds < 60) return t.dashboard.email.composer.savedJustNow;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t.dashboard.email.composer.savedMinutesAgo.replace('{minutes}', String(minutes));
    const hours = Math.floor(minutes / 60);
    return t.dashboard.email.composer.savedHoursAgo.replace('{hours}', String(hours));
  }, [t]);

  // Handle send
  const handleSend = useCallback(async () => {
    // Validation
    if (!selectedProvider) {
      onError?.(t.dashboard.email.composer.noProvider);
      return;
    }

    const toEmails = cleanEmailArray(to);
    if (toEmails.length === 0) {
      onError?.(t.dashboard.email.composer.validationTo);
      return;
    }

    if (!subject.trim()) {
      onError?.(t.dashboard.email.composer.validationSubject);
      return;
    }

    try {
      setSending(true);

      const payload: SendEmailPayload = {
        providerId: selectedProvider,
        to: toEmails,
        cc: cc.length > 0 ? cleanEmailArray(cc) : undefined,
        bcc: bcc.length > 0 ? cleanEmailArray(bcc) : undefined,
        subject: subject.trim(),
        bodyHtml: `<p>${body.replace(/\n/g, '<br>')}</p>`,
        bodyText: body,
        inReplyTo: prefillData?.inReplyTo,
        references: prefillData?.references,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      await emailApi.sendEmail(payload);

      // Success
      onSent?.();
      onClose();

      // Reset form
      setTo([]);
      setCc([]);
      setBcc([]);
      setSubject('');
      setBody('');
      setAttachments([]);
    } catch (error) {
      console.error('Failed to send email:', error);
      onError?.(t.dashboard.email.composer.sendError);
    } finally {
      setSending(false);
    }
  }, [selectedProvider, to, cc, bcc, subject, body, prefillData, cleanEmailArray, onClose, onSent, onError, attachments, t]);

  // Check if form has unsaved changes
  const hasChanges = useCallback(() => {
    return !!(to.length > 0 || cc.length > 0 || bcc.length > 0 || subject || body);
  }, [to, cc, bcc, subject, body]);

  // Handle close with confirmation
  const handleClose = useCallback(() => {
    if (hasChanges() && !sending) {
      const confirmed = window.confirm(t.dashboard.email.composer.discardConfirm);
      if (!confirmed) return;
    }
    onClose();
  }, [hasChanges, sending, onClose, t]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          height: isMobile ? '100%' : '80vh',
          maxHeight: isMobile ? '100%' : 800,
        },
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">
              {mode === 'reply' && t.dashboard.email.composer.titleReply}
              {mode === 'forward' && t.dashboard.email.composer.titleForward}
              {mode === 'compose' && t.dashboard.email.composer.title}
            </Typography>
            {mode === 'compose' && (
              <Chip
                size="small"
                icon={isDraftSaving ? <CircularProgress size={12} /> : <Check size={12} />}
                label={isDraftSaving ? t.dashboard.email.composer.saving : formatLastSaved(lastSaved)}
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  display: lastSaved || isDraftSaving ? 'flex' : 'none',
                }}
              />
            )}
          </Box>
          <IconButton
            size="small"
            onClick={handleClose}
            disabled={sending}
            sx={{
              width: { xs: 44, sm: 'auto' },
              height: { xs: 44, sm: 'auto' },
            }}
          >
            <X size={20} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* From Field - Provider Selection */}
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 500 }}>
                {t.dashboard.email.composer.from}:
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                disabled={sending || providers.length === 0}
                slotProps={{
                  htmlInput: {
                    'aria-label': t.dashboard.email.composer.selectProvider
                  }
                }}
                SelectProps={{
                  native: true,
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': { border: 'none' },
                  },
                }}
              >
                {providers.length === 0 && (
                  <option value="">{t.dashboard.email.composer.noProvider}</option>
                )}
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.email} {provider.displayName ? `(${provider.displayName})` : ''}
                  </option>
                ))}
              </TextField>
            </Box>
          </Box>

          {/* To Field */}
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 500 }}>
                {t.dashboard.email.composer.toLabel}
              </Typography>
              <Autocomplete
                multiple
                freeSolo
                fullWidth
                size="small"
                options={emailOptions}
                value={to}
                onChange={(_, newValue) => setTo(newValue)}
                disabled={sending}
                loading={contactsLoading}
                filterOptions={contactFilterOptions}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder={t.dashboard.email.composer.toPlaceholder}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { border: 'none' },
                      },
                    }}
                  />
                )}
                sx={{
                  '& .MuiAutocomplete-tag': {
                    margin: '2px',
                  },
                }}
              />
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {!showCc && (
                  <Button size="small" onClick={() => setShowCc(true)}>
                    {t.dashboard.email.composer.cc}
                  </Button>
                )}
                {!showBcc && (
                  <Button size="small" onClick={() => setShowBcc(true)}>
                    {t.dashboard.email.composer.bcc}
                  </Button>
                )}
              </Box>
            </Box>
          </Box>

          {/* CC Field */}
          <Collapse in={showCc}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 500 }}>
                  {t.dashboard.email.composer.ccLabel}
                </Typography>
                <Autocomplete
                  multiple
                  freeSolo
                  fullWidth
                  size="small"
                  options={emailOptions}
                  value={cc}
                  onChange={(_, newValue) => setCc(newValue)}
                  disabled={sending}
                  loading={contactsLoading}
                  filterOptions={contactFilterOptions}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={t.dashboard.email.composer.toPlaceholder}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { border: 'none' },
                        },
                      }}
                    />
                  )}
                  sx={{
                    '& .MuiAutocomplete-tag': {
                      margin: '2px',
                    },
                  }}
                />
              </Box>
            </Box>
          </Collapse>

          {/* BCC Field */}
          <Collapse in={showBcc}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 500 }}>
                  {t.dashboard.email.composer.bccLabel}
                </Typography>
                <Autocomplete
                  multiple
                  freeSolo
                  fullWidth
                  size="small"
                  options={emailOptions}
                  value={bcc}
                  onChange={(_, newValue) => setBcc(newValue)}
                  disabled={sending}
                  loading={contactsLoading}
                  filterOptions={contactFilterOptions}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={t.dashboard.email.composer.toPlaceholder}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { border: 'none' },
                        },
                      }}
                    />
                  )}
                  sx={{
                    '& .MuiAutocomplete-tag': {
                      margin: '2px',
                    },
                  }}
                />
              </Box>
            </Box>
          </Collapse>

          {/* Subject Field */}
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 500 }}>
                {t.dashboard.email.composer.subjectLabel}
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder={t.dashboard.email.composer.subjectPlaceholder}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={sending}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': { border: 'none' },
                  },
                }}
              />
            </Box>
          </Box>

          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {t.dashboard.email.composer.attachments.replace('{count}', String(attachments.length))}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {attachments.map((attachment, index) => (
                  <Chip
                    key={index}
                    icon={<FileText size={14} />}
                    label={`${attachment.filename} (${formatFileSize(getBase64Size(attachment.contentBase64))})`}
                    onDelete={() => handleRemoveAttachment(index)}
                    deleteIcon={<Trash2 size={14} />}
                    size="small"
                    sx={{ maxWidth: '100%' }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Editor Toolbar */}
          <EditorToolbar editor={editor} />

          {/* Body Field - TipTap Editor */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              '& .ProseMirror': {
                minHeight: 200,
                maxHeight: 400,
                outline: 'none',
                p: 2,
                '&:focus': {
                  outline: 'none',
                },
              },
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
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            accept="*/*"
            aria-label={t.dashboard.email.composer.attachFiles}
          />
          {/* Attach files button */}
          <IconButton
            size="small"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploading}
            title={t.dashboard.email.composer.attachFiles}
            sx={{
              width: { xs: 44, sm: 'auto' },
              height: { xs: 44, sm: 'auto' },
            }}
          >
            {uploading ? <CircularProgress size={18} /> : <Paperclip size={18} />}
          </IconButton>
          <Box sx={{ flex: 1 }} />
          <Button onClick={handleClose} disabled={sending}>
            {t.dashboard.email.composer.discard}
          </Button>
          <Button
            variant="contained"
            startIcon={sending ? <CircularProgress size={16} /> : <Send size={16} />}
            onClick={handleSend}
            disabled={sending || to.length === 0}
          >
            {sending ? t.dashboard.email.composer.sending : t.dashboard.email.composer.send}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
