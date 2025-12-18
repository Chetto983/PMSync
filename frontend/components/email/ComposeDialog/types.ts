import type { SendEmailPayload, EmailAttachmentUpload } from '@/lib/api/email';

export interface ComposeDialogProps {
  /** Whether the dialog is open */
  open: boolean;

  /** Mode: compose new, reply, or forward */
  mode?: 'compose' | 'reply' | 'forward';

  /** Default provider ID */
  defaultProviderId?: string;

  /** Pre-fill data (for reply/forward/edit draft) */
  prefillData?: ComposePrefillData;

  /** Callback when dialog closes */
  onClose: () => void;

  /** Callback when email is sent successfully */
  onSent?: () => void;

  /** Callback for errors */
  onError?: (message: string) => void;
}

export interface ComposePrefillData {
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
}

export interface ComposeFormState {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  showCc: boolean;
  showBcc: boolean;
  attachments: EmailAttachmentUpload[];
}

export interface ComposeFormActions {
  setTo: (to: string[]) => void;
  setCc: (cc: string[]) => void;
  setBcc: (bcc: string[]) => void;
  setSubject: (subject: string) => void;
  setBody: (body: string) => void;
  setShowCc: (show: boolean) => void;
  setShowBcc: (show: boolean) => void;
  setAttachments: React.Dispatch<React.SetStateAction<EmailAttachmentUpload[]>>;
  resetForm: () => void;
}

export type ComposeMode = 'compose' | 'reply' | 'forward';

export { SendEmailPayload, EmailAttachmentUpload };
