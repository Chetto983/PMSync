/**
 * Compose Recipients Component
 *
 * To/Cc/Bcc fields with contact autocomplete.
 * Uses MUI Autocomplete with TanStack Query for contact search.
 */

import { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  Chip,
  Autocomplete,
  Avatar,
  Typography,
  Button,
  Collapse,
} from '@mui/material';
import { Plus, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useContacts } from '@/hooks/queries';

interface RecipientOption {
  email: string;
  name?: string;
  avatarUrl?: string;
}

// Recipient field component - defined outside to prevent re-creation on each render
interface RecipientFieldProps {
  label: string;
  value: string[];
  onChange: (emails: string[]) => void;
  placeholder: string;
  contactOptions: RecipientOption[];
  readOnly: boolean;
  onSearchChange: (query: string) => void;
  isValidEmail: (email: string) => boolean;
}

function RecipientField({
  label,
  value,
  onChange,
  placeholder,
  contactOptions,
  readOnly,
  onSearchChange,
  isValidEmail,
}: RecipientFieldProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: 32, pt: 1, fontWeight: 500 }}
      >
        {label}
      </Typography>
      <Autocomplete
        multiple
        freeSolo
        fullWidth
        size="small"
        disabled={readOnly}
        options={contactOptions}
        getOptionLabel={(option) =>
          typeof option === 'string' ? option : option.name || option.email
        }
        value={value}
        onInputChange={(_, newValue) => onSearchChange(newValue)}
        onChange={(_, newValue) => {
          const emails = newValue
            .map((v) => (typeof v === 'string' ? v : v.email))
            .filter((e) => isValidEmail(e));
          onChange(emails);
        }}
        renderOption={(props, option) => {
          const { key, ...restProps } = props;
          return (
            <Box
              key={key}
              component="li"
              {...restProps}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}
            >
              <Avatar
                src={option.avatarUrl}
                sx={{ width: 28, height: 28, fontSize: '0.75rem' }}
              >
                {option.name?.[0] || option.email[0].toUpperCase()}
              </Avatar>
              <Box>
                {option.name && (
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {option.name}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {option.email}
                </Typography>
              </Box>
            </Box>
          );
        }}
        renderTags={(tagValue, getTagProps) =>
          tagValue.map((emailOrOption, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            // Extract email string from option or use directly if string
            const emailStr = typeof emailOrOption === 'string'
              ? emailOrOption
              : emailOrOption.email;
            return (
              <Chip
                key={key}
                {...tagProps}
                label={emailStr}
                size="small"
                deleteIcon={<X size={14} />}
                sx={{
                  height: 24,
                  '& .MuiChip-label': { px: 1, fontSize: '0.8125rem' },
                }}
              />
            );
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            variant="standard"
            placeholder={value.length === 0 ? placeholder : ''}
            InputProps={{
              ...params.InputProps,
              disableUnderline: true,
            }}
            sx={{
              '& .MuiInputBase-root': {
                py: 0.5,
                flexWrap: 'wrap',
                gap: 0.5,
              },
            }}
          />
        )}
        sx={{
          flex: 1,
          '& .MuiAutocomplete-inputRoot': {
            py: 0.5,
          },
        }}
      />
    </Box>
  );
}

interface ComposeRecipientsProps {
  to: string[];
  cc: string[];
  bcc: string[];
  onToChange: (emails: string[]) => void;
  onCcChange: (emails: string[]) => void;
  onBccChange: (emails: string[]) => void;
  /** Show Cc/Bcc fields initially */
  showCcBcc?: boolean;
  /** Read-only mode */
  readOnly?: boolean;
}

export function ComposeRecipients({
  to,
  cc,
  bcc,
  onToChange,
  onCcChange,
  onBccChange,
  showCcBcc: initialShowCcBcc = false,
  readOnly = false,
}: ComposeRecipientsProps) {
  const t = useTranslations();
  const [showCcBcc, setShowCcBcc] = useState(initialShowCcBcc || cc.length > 0 || bcc.length > 0);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch contacts for autocomplete
  const { data: contactsData } = useContacts({ search: searchQuery, limit: 10 });

  // Map contacts to options
  const contactOptions: RecipientOption[] = (contactsData?.contacts || []).flatMap((contact) =>
    (contact.emails || []).map((email) => ({
      email: email.value,
      name: contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      avatarUrl: contact.photoUrl || undefined,
    }))
  );

  // Validate email format
  const isValidEmail = useCallback((email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }, []);

  // Handle search query change
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        px: 2,
      }}
    >
      {/* To field */}
      <RecipientField
        label={t.email?.composer?.toLabel || 'To:'}
        value={to}
        onChange={onToChange}
        placeholder={t.email?.composer?.toPlaceholder || 'recipient@example.com'}
        contactOptions={contactOptions}
        readOnly={readOnly}
        onSearchChange={handleSearchChange}
        isValidEmail={isValidEmail}
      />

      {/* Cc/Bcc toggle */}
      {!showCcBcc && !readOnly && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pb: 1 }}>
          <Button
            size="small"
            startIcon={<Plus size={14} />}
            onClick={() => setShowCcBcc(true)}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            {t.email?.composer?.cc || 'Cc'} / {t.email?.composer?.bcc || 'Bcc'}
          </Button>
        </Box>
      )}

      {/* Cc/Bcc fields */}
      <Collapse in={showCcBcc}>
        <RecipientField
          label={t.email?.composer?.ccLabel || 'Cc:'}
          value={cc}
          onChange={onCcChange}
          placeholder=""
          contactOptions={contactOptions}
          readOnly={readOnly}
          onSearchChange={handleSearchChange}
          isValidEmail={isValidEmail}
        />
        <RecipientField
          label={t.email?.composer?.bccLabel || 'Bcc:'}
          value={bcc}
          onChange={onBccChange}
          placeholder=""
          contactOptions={contactOptions}
          readOnly={readOnly}
          onSearchChange={handleSearchChange}
          isValidEmail={isValidEmail}
        />
      </Collapse>
    </Box>
  );
}

export default ComposeRecipients;
