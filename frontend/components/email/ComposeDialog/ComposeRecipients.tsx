import React, { useMemo, useCallback, useEffect, useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Collapse,
  Typography,
  Autocomplete,
  createFilterOptions,
} from '@mui/material';
import { contactsApi, type Contact } from '@/lib/api/contacts';
import { logger } from '@/lib/logger';

interface ComposeRecipientsProps {
  to: string[];
  cc: string[];
  bcc: string[];
  showCc: boolean;
  showBcc: boolean;
  sending: boolean;
  onToChange: (value: string[]) => void;
  onCcChange: (value: string[]) => void;
  onBccChange: (value: string[]) => void;
  onShowCcChange: (show: boolean) => void;
  onShowBccChange: (show: boolean) => void;
  t: {
    email: {
      composer: {
        toLabel: string;
        toPlaceholder: string;
        ccLabel: string;
        cc: string;
        bccLabel: string;
        bcc: string;
      };
    };
  };
}

/**
 * Recipient fields (To/Cc/Bcc) with contact autocomplete
 */
export function ComposeRecipients({
  to,
  cc,
  bcc,
  showCc,
  showBcc,
  sending,
  onToChange,
  onCcChange,
  onBccChange,
  onShowCcChange,
  onShowBccChange,
  t,
}: ComposeRecipientsProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);

  // Fetch contacts on mount
  useEffect(() => {
    let cancelled = false;
    contactsApi
      .listContacts({ limit: 1000 })
      .then((response) => {
        if (!cancelled) setContacts(response.contacts);
      })
      .catch((error) => {
        logger.error('Failed to load contacts', { error });
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Custom filter for Autocomplete - search anywhere in the string
  const contactFilterOptions = useMemo(() => {
    return createFilterOptions<string>({
      matchFrom: 'any',
      stringify: (option) => option.toLowerCase(),
    });
  }, []);

  // Get email options from contacts for autocomplete
  const emailOptions = useMemo(() => {
    const options: string[] = [];
    contacts.forEach((contact) => {
      if (contact.emails && contact.emails.length > 0) {
        contact.emails.forEach((emailObj) => {
          if (emailObj.value) {
            const displayName =
              contact.displayName ||
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

  const renderRecipientField = useCallback(
    (
      label: string,
      value: string[],
      onChange: (value: string[]) => void,
      testId?: string
    ) => (
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 500 }}>
            {label}
          </Typography>
          <Autocomplete
            multiple
            freeSolo
            autoSelect
            fullWidth
            size="small"
            options={emailOptions}
            value={value}
            onChange={(_, newValue) => onChange(newValue)}
            disabled={sending}
            loading={contactsLoading}
            filterOptions={contactFilterOptions}
            renderInput={(params) => (
              <TextField
                {...params}
                inputProps={{
                  ...params.inputProps,
                  ...(testId && { 'data-testid': testId }),
                }}
                placeholder={t.email.composer.toPlaceholder}
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
    ),
    [contactFilterOptions, contactsLoading, emailOptions, sending, t]
  );

  return (
    <>
      {/* To Field */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ minWidth: 40, fontWeight: 500 }}>
            {t.email.composer.toLabel}
          </Typography>
          <Autocomplete
            multiple
            freeSolo
            autoSelect
            fullWidth
            size="small"
            options={emailOptions}
            value={to}
            onChange={(_, newValue) => onToChange(newValue)}
            disabled={sending}
            loading={contactsLoading}
            filterOptions={contactFilterOptions}
            renderInput={(params) => (
              <TextField
                {...params}
                inputProps={{
                  ...params.inputProps,
                  'data-testid': 'compose-to-input',
                }}
                placeholder={t.email.composer.toPlaceholder}
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
              <Button size="small" onClick={() => onShowCcChange(true)}>
                {t.email.composer.cc}
              </Button>
            )}
            {!showBcc && (
              <Button size="small" onClick={() => onShowBccChange(true)}>
                {t.email.composer.bcc}
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      {/* CC Field */}
      <Collapse in={showCc}>
        {renderRecipientField(t.email.composer.ccLabel, cc, onCcChange)}
      </Collapse>

      {/* BCC Field */}
      <Collapse in={showBcc}>
        {renderRecipientField(t.email.composer.bccLabel, bcc, onBccChange)}
      </Collapse>
    </>
  );
}
