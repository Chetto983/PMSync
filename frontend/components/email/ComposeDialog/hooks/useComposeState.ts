import { useState, useCallback, useRef, useLayoutEffect } from 'react';
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

  // Track previous open state to detect when dialog opens
  const prevOpenRef = useRef(open);
  const isInitializedRef = useRef(false);

  // Initialize form synchronously on open change (useLayoutEffect for synchronous updates)
  useLayoutEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    // Only initialize when dialog opens (transitions from closed to open)
    // or on first render when open
    if (open && (!wasOpen || !isInitializedRef.current)) {
      isInitializedRef.current = true;

      // Reset all state synchronously
      if (prefillData) {
        setTo(prefillData.to || []);
        setCc(prefillData.cc || []);
        setBcc(prefillData.bcc || []);
        setSubject(prefillData.subject || '');
        setBody(prefillData.body || '');
        setShowCc(!!prefillData.cc?.length);
        setShowBcc(!!prefillData.bcc?.length);
      } else {
        setTo([]);
        setCc([]);
        setBcc([]);
        setSubject('');
        setBody('');
        setShowCc(false);
        setShowBcc(false);
      }
      setAttachments([]);
    }

    // Reset initialization flag when dialog closes
    if (!open && wasOpen) {
      isInitializedRef.current = false;
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
