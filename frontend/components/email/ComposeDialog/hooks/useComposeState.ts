import { useState, useCallback, useEffect } from 'react';
import type { EmailAttachmentUpload } from '@/lib/api/email';
import type { ComposePrefillData, ComposeFormState, ComposeFormActions } from '../types';

interface UseComposeStateOptions {
  open: boolean;
  prefillData?: ComposePrefillData;
}

interface UseComposeStateReturn extends ComposeFormState, ComposeFormActions {}

/**
 * Hook to manage compose form state
 * Handles form initialization, reset, and state updates
 */
export function useComposeState({ open, prefillData }: UseComposeStateOptions): UseComposeStateReturn {
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachmentUpload[]>([]);

  // Initialize form with prefill data when dialog opens
  useEffect(() => {
    if (!open) return;

    // Reset transient state every time the dialog opens/changes mode
    setAttachments([]);

    if (prefillData) {
      setTo(prefillData.to || []);
      setCc(prefillData.cc || []);
      setBcc(prefillData.bcc || []);
      setSubject(prefillData.subject || '');
      setBody(prefillData.body || '');
      setShowCc(!!prefillData.cc?.length);
      setShowBcc(!!prefillData.bcc?.length);
    } else {
      // Reset form for new compose
      setTo([]);
      setCc([]);
      setBcc([]);
      setSubject('');
      setBody('');
      setShowCc(false);
      setShowBcc(false);
    }
  }, [open, prefillData]);

  const resetForm = useCallback(() => {
    setTo([]);
    setCc([]);
    setBcc([]);
    setSubject('');
    setBody('');
    setShowCc(false);
    setShowBcc(false);
    setAttachments([]);
  }, []);

  return {
    // State
    to,
    cc,
    bcc,
    subject,
    body,
    showCc,
    showBcc,
    attachments,
    // Actions
    setTo,
    setCc,
    setBcc,
    setSubject,
    setBody,
    setShowCc,
    setShowBcc,
    setAttachments,
    resetForm,
  };
}
