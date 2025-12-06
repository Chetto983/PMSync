import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Menu,
  ListItemIcon,
  ListItemText,
  Popover,
  Stack,
} from '@mui/material';
import { X, Send, Paperclip, Check, FileText, Trash2, Maximize2, Minimize2, Upload, Clock, ChevronDown } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import { marked } from 'marked';
import type { SendEmailPayload, EmailAttachmentUpload } from '@/lib/api/email';
import { emailApi } from '@/lib/api/email';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { contactsApi, type Contact } from '@/lib/api/contacts';
import { aiApi } from '@/lib/api/ai';
import { useDraftAutosave } from '@/hooks/use-draft-autosave';
import { useComposeEditor } from '@/hooks/use-compose-editor';
import { useTranslations } from '@/lib/hooks/use-translations';
import { EditorToolbar } from './EditorToolbar';
import { SmartReplySuggestions } from '@/components/email/ai/SmartReplySuggestions';
import { AiChatPanel } from './AiChatPanel';

/**
 * File upload constants
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB total (common email limit)

/**
 * Allowed file types for attachments (whitelist for security)
 * Common document, image, and archive types
 */
const ALLOWED_FILE_TYPES = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/rtf',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
  // Audio/Video (common formats)
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  // Other common types
  'application/json',
  'application/xml',
]);

/**
 * File extensions whitelist (fallback when MIME type is not available)
 */
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'html', 'md', 'rtf',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff',
  'zip', 'rar', '7z', 'gz', 'tar',
  'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov',
  'json', 'xml',
]);

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
   * Pre-fill data (for reply/forward/edit draft)
   */
  prefillData?: {
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    inReplyTo?: string;
    references?: string;
    /** Original email ID for smart replies */
    originalEmailId?: string;
    /** Draft ID when editing an existing draft */
    draftId?: string;
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
  const [smartRepliesDismissed, setSmartRepliesDismissed] = useState(false);
  const [aiComposing, setAiComposing] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState<'formal' | 'casual' | 'technical' | ''>('');
  const [aiVariant, setAiVariant] = useState<'A' | 'B'>('A');
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiPreviewSubject, setAiPreviewSubject] = useState<string | null>(null);

  // Provider state
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>(defaultProviderId || '');

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Fullscreen mode (desktop only)
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Schedule send state
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [scheduleMenuAnchor, setScheduleMenuAnchor] = useState<null | HTMLElement>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

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
    // Reset smart replies when dialog opens
    if (open) {
      setSmartRepliesDismissed(false);
    }
  }, [open, prefillData]);

  // Sync editor content when body changes externally
  useEffect(() => {
    if (editor && body !== editor.getHTML()) {
      editor.commands.setContent(body);
    }
  }, [editor, body]);

  // Fetch providers when dialog opens
  // Note: selectedProvider NOT in deps to avoid refetch loop when user selects provider
  useEffect(() => {
    if (open) {
      providersApi.getProviders().then((data) => {
        const emailProviders = data.filter((p) => p.supportsEmail);
        setProviders(emailProviders);

        // Set default provider only if none selected yet
        setSelectedProvider((current) => {
          if (current) return current; // Keep existing selection
          if (emailProviders.length === 0) return '';
          const defaultProvider = emailProviders.find((p) => p.isDefault) || emailProviders[0];
          return defaultProvider.id;
        });
      });
    }
  }, [open]);

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

  // Keyboard shortcut for fullscreen toggle (F11 to toggle, Escape to exit)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // F11 toggles fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      }
      // Escape exits fullscreen (but not the dialog)
      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        e.stopPropagation();
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isFullscreen]);

  // Check if file type is allowed (defined before drag handlers that use it)
  const isFileTypeAllowed = useCallback((file: File): boolean => {
    // Check MIME type first
    if (file.type && ALLOWED_FILE_TYPES.has(file.type)) {
      return true;
    }
    // Fallback to extension check
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ext ? ALLOWED_EXTENSIONS.has(ext) : false;
  }, []);

  // Drag-and-drop handlers for attachments
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // Process the dropped files
    setUploading(true);
    try {
      const newAttachments: EmailAttachmentUpload[] = [];
      const currentTotalSize = attachments.reduce(
        (sum, att) => sum + Math.floor((att.contentBase64.length * 3) / 4),
        0
      );
      let runningTotal = currentTotalSize;

      for (const file of Array.from(files)) {
        if (!isFileTypeAllowed(file)) {
          onError?.(
            t.dashboard.email.composer.fileTypeNotAllowed?.replace('{filename}', file.name) ||
            `File type not allowed: ${file.name}`
          );
          continue;
        }

        if (file.size > MAX_FILE_SIZE) {
          onError?.(t.dashboard.email.composer.fileTooLarge.replace('{filename}', file.name));
          continue;
        }

        if (runningTotal + file.size > MAX_TOTAL_SIZE) {
          onError?.(
            t.dashboard.email.composer.totalSizeExceeded ||
            'Total attachment size exceeds 25MB limit'
          );
          break;
        }

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64Content = result.split(',')[1];
            resolve(base64Content);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        runningTotal += file.size;

        newAttachments.push({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64: base64,
        });
      }

      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (error) {
      console.error('Failed to process dropped files:', error);
      onError?.(t.dashboard.email.composer.uploadError);
    } finally {
      setUploading(false);
    }
  }, [attachments, isFileTypeAllowed, onError, t]);

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
    if (!Array.isArray(emails)) return [];
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

      // Calculate current total size
      const currentTotalSize = attachments.reduce(
        (sum, att) => sum + Math.floor((att.contentBase64.length * 3) / 4),
        0
      );
      let runningTotal = currentTotalSize;

      for (const file of Array.from(files)) {
        // Check file type (security whitelist)
        if (!isFileTypeAllowed(file)) {
          onError?.(
            t.dashboard.email.composer.fileTypeNotAllowed?.replace('{filename}', file.name) ||
            `File type not allowed: ${file.name}`
          );
          continue;
        }

        // Check file size (max per file)
        if (file.size > MAX_FILE_SIZE) {
          onError?.(t.dashboard.email.composer.fileTooLarge.replace('{filename}', file.name));
          continue;
        }

        // Check total size limit
        if (runningTotal + file.size > MAX_TOTAL_SIZE) {
          onError?.(
            t.dashboard.email.composer.totalSizeExceeded ||
            'Total attachment size exceeds 25MB limit'
          );
          break; // Stop processing more files
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

        runningTotal += file.size;

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
  }, [onError, t, attachments, isFileTypeAllowed]);

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

      // If editing a draft, delete it after successful send
      if (prefillData?.draftId) {
        try {
          await emailApi.deleteDraft(prefillData.draftId);
        } catch (draftErr) {
          console.warn('Failed to delete draft after send:', draftErr);
          // Don't fail the whole operation if draft deletion fails
        }
      }

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

  // Generate AI preview (does not insert into editor)
  const handleAiGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) {
      return;
    }
    setAiComposing(true);
    try {
      const { data } = await aiApi.composeEmail({
        prompt: aiPrompt.trim(),
        to: cleanEmailArray(to),
        subject: subject || undefined,
        tone: aiTone || (mode === 'reply' ? 'formal' : undefined),
        locale: t.locale,
        variant: aiVariant,
      });

      if (data?.body) {
        setAiPreview(data.body);
      }
      if (data?.subject) {
        setAiPreviewSubject(data.subject);
      }
    } catch (error) {
      console.error('AI compose failed', error);
      const message =
        (error as any)?.response?.data?.message ||
        t.dashboard?.email?.composer?.aiComposeError ||
        'Unable to compose email';
      onError?.(message);
    } finally {
      setAiComposing(false);
    }
  }, [aiPrompt, aiTone, aiVariant, cleanEmailArray, mode, onError, subject, t, to]);

  // Insert AI preview into editor
  const handleAiComposeSubmit = useCallback(() => {
    if (aiPreview) {
      setBody(aiPreview);
      if (editor) {
        editor.commands.setContent(aiPreview);
      }
    }
    if (aiPreviewSubject && !subject) {
      setSubject(aiPreviewSubject);
    }
    // Reset and close
    setAiDialogOpen(false);
    setAiPreview(null);
    setAiPreviewSubject(null);
  }, [aiPreview, aiPreviewSubject, editor, subject]);

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

  // Schedule send helpers
  const getSchedulePresets = useCallback(() => {
    const now = new Date();
    const tomorrow9am = new Date(now);
    tomorrow9am.setDate(tomorrow9am.getDate() + 1);
    tomorrow9am.setHours(9, 0, 0, 0);

    const nextMonday9am = new Date(now);
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    nextMonday9am.setDate(nextMonday9am.getDate() + daysUntilMonday);
    nextMonday9am.setHours(9, 0, 0, 0);

    return [
      { label: 'Tomorrow morning (9:00 AM)', value: tomorrow9am.toISOString() },
      { label: 'Next Monday (9:00 AM)', value: nextMonday9am.toISOString() },
    ];
  }, []);

  const handleScheduleSelect = useCallback((dateTime: string) => {
    setScheduledAt(dateTime);
    setScheduleMenuAnchor(null);
    setShowSchedulePicker(false);
  }, []);

  const handleScheduleSend = useCallback(async () => {
    if (!scheduledAt) return;

    // Validation (same as handleSend)
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
        scheduledAt,
      };

      await emailApi.sendEmail(payload);

      // Success - show scheduled confirmation
      onSent?.();
      onClose();

      // Reset form
      setTo([]);
      setCc([]);
      setBcc([]);
      setSubject('');
      setBody('');
      setAttachments([]);
      setScheduledAt(null);
    } catch (error) {
      console.error('Failed to schedule email:', error);
      onError?.(t.dashboard.email.composer.sendError);
    } finally {
      setSending(false);
    }
  }, [scheduledAt, selectedProvider, to, cc, bcc, subject, body, prefillData, cleanEmailArray, onClose, onSent, onError, attachments, t]);

  const formatScheduledTime = useCallback((isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, []);

  // Handle smart reply selection
  const handleSmartReplySelect = useCallback((reply: string) => {
    setBody(reply);
    if (editor) {
      editor.commands.setContent(reply);
    }
    setSmartRepliesDismissed(true);
  }, [editor]);

  return (
    <>
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={isFullscreen ? false : 'md'}
      fullWidth={!isFullscreen}
      fullScreen={isMobile || isFullscreen}
      PaperProps={{
        sx: {
          height: isMobile || isFullscreen ? '100%' : '80vh',
          maxHeight: isMobile || isFullscreen ? '100%' : 800,
          // Smooth transition for fullscreen toggle
          transition: 'all 0.2s ease-in-out',
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* Fullscreen toggle - desktop only */}
            {!isMobile && (
              <IconButton
                size="small"
                onClick={() => setIsFullscreen((prev) => !prev)}
                disabled={sending}
                title={isFullscreen ? 'Exit fullscreen (F11)' : 'Fullscreen (F11)'}
                sx={{
                  width: { xs: 44, sm: 'auto' },
                  height: { xs: 44, sm: 'auto' },
                }}
              >
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </IconButton>
            )}
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
        </Box>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{ p: 0, position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: 'rgba(25, 118, 210, 0.08)',
              border: '2px dashed',
              borderColor: 'primary.main',
              borderRadius: 1,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              pointerEvents: 'none',
            }}
          >
            <Upload size={48} color="#1976d2" />
            <Typography variant="h6" color="primary">
              Drop files here
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Release to attach files
            </Typography>
          </Box>
        )}
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
                  inputProps: {
                    title: t.dashboard.email.composer.selectProvider,
                    'aria-label': t.dashboard.email.composer.selectProvider,
                  },
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
                autoSelect
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
                  autoSelect
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
                  autoSelect
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

          {/* Smart Reply Suggestions - Only for reply mode */}
          {mode === 'reply' && prefillData?.originalEmailId && !smartRepliesDismissed && (
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <SmartReplySuggestions
                emailId={prefillData.originalEmailId}
                onSelectReply={handleSmartReplySelect}
                onDismiss={() => setSmartRepliesDismissed(true)}
                defaultExpanded={false}
                showToneSelector={true}
              />
            </Box>
          )}

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

          {/* Editor Toolbar - Compact on mobile for better touch targets */}
          <EditorToolbar
            editor={editor}
            onAiCompose={() => {
              setAiPrompt('');
              setAiTone(mode === 'reply' ? 'formal' : '');
              setAiPreview(null);
              setAiPreviewSubject(null);
              setAiDialogOpen(true);
            }}
            aiComposing={aiComposing}
            compact={isMobile}
          />

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

          {/* AI Chat Panel - Collapsible assistant */}
          <AiChatPanel
            emailBody={body}
            emailSubject={subject}
            recipients={cleanEmailArray(to)}
            mode={mode}
            onInsertSuggestion={(text) => {
              // Insert at cursor position - convert markdown to HTML
              if (editor) {
                const html = marked.parse(text, { async: false }) as string;
                editor.commands.insertContent(html);
              }
            }}
            onReplaceBody={(text) => {
              // Convert markdown to HTML before setting content
              const html = marked.parse(text, { async: false }) as string;
              setBody(html);
              if (editor) {
                editor.commands.setContent(html);
              }
            }}
            onUpdateSubject={(text) => {
              if (!subject) {
                setSubject(text);
              }
            }}
            t={t}
            locale={t.locale}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          justifyContent: { xs: 'flex-end', sm: 'flex-start' },
        }}>
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
          <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />

          {/* Scheduled indicator */}
          {scheduledAt && (
            <Chip
              icon={<Clock size={14} />}
              label={formatScheduledTime(scheduledAt)}
              onDelete={() => setScheduledAt(null)}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}

          <Button onClick={handleClose} disabled={sending}>
            {t.dashboard.email.composer.discard}
          </Button>

          {/* Send button with schedule dropdown */}
          <Box sx={{ display: 'flex' }}>
            <Button
              variant="contained"
              startIcon={sending ? <CircularProgress size={16} /> : <Send size={16} />}
              onClick={scheduledAt ? handleScheduleSend : handleSend}
              disabled={sending || to.length === 0}
              sx={{
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
              }}
            >
              {sending
                ? t.dashboard.email.composer.sending
                : scheduledAt
                  ? 'Schedule'
                  : t.dashboard.email.composer.send}
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={(e) => setScheduleMenuAnchor(e.currentTarget)}
              disabled={sending || to.length === 0}
              sx={{
                minWidth: 32,
                px: 0.5,
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderLeft: '1px solid rgba(255,255,255,0.3)',
              }}
              aria-label="Schedule send options"
            >
              <ChevronDown size={16} />
            </Button>
          </Box>

          {/* Schedule menu */}
          <Menu
            anchorEl={scheduleMenuAnchor}
            open={Boolean(scheduleMenuAnchor)}
            onClose={() => setScheduleMenuAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          >
            <MenuItem
              onClick={() => {
                setScheduledAt(null);
                setScheduleMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <Send size={16} />
              </ListItemIcon>
              <ListItemText>Send now</ListItemText>
            </MenuItem>
            {getSchedulePresets().map((preset) => (
              <MenuItem
                key={preset.value}
                onClick={() => handleScheduleSelect(preset.value)}
              >
                <ListItemIcon>
                  <Clock size={16} />
                </ListItemIcon>
                <ListItemText>{preset.label}</ListItemText>
              </MenuItem>
            ))}
            <MenuItem onClick={() => setShowSchedulePicker(true)}>
              <ListItemIcon>
                <Clock size={16} />
              </ListItemIcon>
              <ListItemText>Pick date & time...</ListItemText>
            </MenuItem>
          </Menu>

          {/* Custom date/time picker popover */}
          <Popover
            open={showSchedulePicker}
            anchorEl={scheduleMenuAnchor}
            onClose={() => {
              setShowSchedulePicker(false);
              setScheduleMenuAnchor(null);
            }}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          >
            <Box sx={{ p: 2, minWidth: 280 }}>
              <Typography variant="subtitle2" gutterBottom>
                Schedule send
              </Typography>
              <Stack spacing={2}>
                <TextField
                  type="datetime-local"
                  fullWidth
                  size="small"
                  inputProps={{
                    min: new Date().toISOString().slice(0, 16),
                  }}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleScheduleSelect(new Date(e.target.value).toISOString());
                    }
                  }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setShowSchedulePicker(false);
                    setScheduleMenuAnchor(null);
                  }}
                >
                  Cancel
                </Button>
              </Stack>
            </Box>
          </Popover>
        </Box>
      </DialogActions>
    </Dialog>

    <AiComposeDialog
      open={aiDialogOpen}
      onClose={() => {
        setAiDialogOpen(false);
        setAiPreview(null);
        setAiPreviewSubject(null);
      }}
      onSubmit={handleAiComposeSubmit}
      onGenerate={handleAiGenerate}
      prompt={aiPrompt}
      setPrompt={setAiPrompt}
      tone={aiTone}
      setTone={setAiTone}
      variant={aiVariant}
      setVariant={setAiVariant}
      loading={aiComposing}
      mode={mode}
      preview={aiPreview}
      t={t}
    />
    </>
  );
}

/**
 * AI Compose Dialog used inside ComposeDialog
 * Enhanced with example prompts, preview, and two-step flow
 */
function AiComposeDialog({
  open,
  onClose,
  onSubmit,
  onGenerate,
  prompt,
  setPrompt,
  tone,
  setTone,
  variant,
  setVariant,
  loading,
  mode,
  preview,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onGenerate: () => void;
  prompt: string;
  setPrompt: (v: string) => void;
  tone: string;
  setTone: (v: 'formal' | 'casual' | 'technical' | '') => void;
  variant: 'A' | 'B';
  setVariant: (v: 'A' | 'B') => void;
  loading: boolean;
  mode: 'compose' | 'reply' | 'forward';
  preview: string | null;
  t: any;
}) {
  // Example prompts based on mode
  const examplePrompts = useMemo(() => {
    const composer = t.dashboard?.email?.composer;
    if (mode === 'reply') {
      return [
        composer?.aiComposeExampleReplyConfirm ?? 'Confirm receipt and schedule call',
        composer?.aiComposeExampleReplyDecline ?? 'Politely decline with alternative',
        composer?.aiComposeExampleReplyInfo ?? 'Request more information',
      ];
    }
    return [
      composer?.aiComposeExampleFollowUp ?? 'Write a follow-up about our meeting',
      composer?.aiComposeExampleThankYou ?? 'Thank you note for their help',
      composer?.aiComposeExampleRequest ?? 'Request information about...',
    ];
  }, [mode, t]);

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t.dashboard?.email?.composer?.aiComposeTitle ?? 'Draft with AI'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {t.dashboard?.email?.composer?.aiComposeHelp ??
            'Provide a short prompt. AI will draft the email body and suggest a subject.'}
        </Typography>

        {/* Example prompts - only show when no preview yet */}
        {!preview && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              {t.dashboard?.email?.composer?.aiComposeExamples ?? 'Try these:'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {examplePrompts.map((example, i) => (
                <Chip
                  key={i}
                  label={example}
                  size="small"
                  variant="outlined"
                  onClick={() => setPrompt(example)}
                  disabled={loading}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        <TextField
          label={t.dashboard?.email?.composer?.aiComposePrompt ?? 'Prompt'}
          multiline
          minRows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          fullWidth
          disabled={loading}
          placeholder={
            mode === 'reply'
              ? 'e.g., Reply confirming the meeting and suggest Tuesday at 3pm'
              : 'e.g., Introduce our new product features to the marketing team'
          }
        />
        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
          <FormControl fullWidth size="small">
            <InputLabel id="ai-tone-label">
              {t.dashboard?.email?.composer?.aiComposeToneLabel ?? 'Tone'}
            </InputLabel>
            <Select
              labelId="ai-tone-label"
              label={t.dashboard?.email?.composer?.aiComposeToneLabel ?? 'Tone'}
              value={tone || ''}
              onChange={(e) => setTone(e.target.value as any)}
              disabled={loading}
            >
              <MenuItem value="">
                <em>Auto</em>
              </MenuItem>
              <MenuItem value="formal">Formal</MenuItem>
              <MenuItem value="casual">Casual</MenuItem>
              <MenuItem value="technical">Technical</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel id="ai-variant-label">
              {t.dashboard?.email?.composer?.aiComposeVariantLabel ?? 'Variant'}
            </InputLabel>
            <Select
              labelId="ai-variant-label"
              label={t.dashboard?.email?.composer?.aiComposeVariantLabel ?? 'Variant'}
              value={variant}
              onChange={(e) => setVariant(e.target.value as 'A' | 'B')}
              disabled={loading}
            >
              <MenuItem value="A">A</MenuItem>
              <MenuItem value="B">B</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Preview section */}
        {preview && (
          <Box
            sx={{
              mt: 1,
              p: 2,
              bgcolor: 'action.hover',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mb: 1, display: 'block', fontWeight: 500 }}
            >
              {t.dashboard?.email?.composer?.aiComposePreview ?? 'Preview'}:
            </Typography>
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-wrap',
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {preview}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          {t.dashboard?.email?.composer?.aiComposeCancel ?? 'Cancel'}
        </Button>
        {!preview ? (
          <Button
            variant="outlined"
            onClick={onGenerate}
            disabled={loading || !prompt.trim()}
            startIcon={loading ? <CircularProgress size={16} /> : undefined}
          >
            {loading
              ? t.dashboard?.email?.composer?.sending ?? 'Generating...'
              : t.dashboard?.email?.composer?.aiComposeGenerate ?? 'Generate'}
          </Button>
        ) : (
          <>
            <Button
              variant="outlined"
              onClick={onGenerate}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : undefined}
            >
              {t.dashboard?.email?.composer?.aiComposeRegenerate ?? 'Regenerate'}
            </Button>
            <Button variant="contained" onClick={onSubmit} disabled={loading}>
              {t.dashboard?.email?.composer?.aiComposeConfirm ?? 'Insert draft'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
