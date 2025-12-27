import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/lib/logger';
import { Autocomplete, TextField, Chip, Avatar, Box, Typography, CircularProgress } from '@mui/material';
import { Mail } from 'lucide-react';
import { contactsApi, type Contact } from '@/lib/api/contacts';

interface ContactOption {
  label: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  isManual?: boolean;
}

interface ContactAutocompleteProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * ContactAutocomplete Component
 *
 * Autocomplete input for email recipients with contact suggestions
 * Supports multiple email addresses and manual entry
 *
 * @example
 * ```tsx
 * <ContactAutocomplete
 *   label="To"
 *   value={toEmails}
 *   onChange={(value) => setToEmails(value)}
 * />
 * ```
 */
export const ContactAutocomplete: React.FC<ContactAutocompleteProps> = ({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // Load contacts on mount
  useEffect(() => {
    const loadContacts = async () => {
      try {
        setLoading(true);
        const response = await contactsApi.listContacts({ limit: 200 });
        setContacts(response.contacts);
      } catch (error) {
        logger.error('Failed to load contacts', { error });
      } finally {
        setLoading(false);
      }
    };

    loadContacts();
  }, []);

  // Convert contacts to options
  const contactOptions: ContactOption[] = useMemo(() => {
    return contacts
      .filter((contact) => contact.emails && contact.emails.length > 0)
      .flatMap((contact) => {
        const primaryEmail = contact.emails?.find((e) => e.primary) || contact.emails?.[0];
        if (!primaryEmail) return [];

        return {
          label: contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || primaryEmail.value,
          email: primaryEmail.value,
          displayName: contact.displayName || undefined,
          photoUrl: contact.photoUrl || undefined,
          isManual: false,
        };
      });
  }, [contacts]);

  // Parse current value into array of email strings
  const selectedEmails = useMemo(() => {
    if (!value) return [];
    return value
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
  }, [value]);

  // Convert selected emails to ContactOption format
  const selectedOptions: ContactOption[] = useMemo(() => {
    return selectedEmails.map((email) => {
      const matchingContact = contactOptions.find((opt) => opt.email === email);
      if (matchingContact) {
        return matchingContact;
      }
      // Manual email entry
      return {
        label: email,
        email,
        isManual: true,
      };
    });
  }, [selectedEmails, contactOptions]);

  // Handle value change
  const handleChange = (_event: React.SyntheticEvent, newValue: (string | ContactOption)[]) => {
    const emails = newValue.map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      return item.email;
    });
    onChange(emails.join(', '));
  };

  // Validate email format
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      options={contactOptions}
      value={selectedOptions}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={(_event, newInputValue) => setInputValue(newInputValue)}
      loading={loading}
      disabled={disabled}
      getOptionLabel={(option) => {
        if (typeof option === 'string') return option;
        return option.label;
      }}
      isOptionEqualToValue={(option, value) => {
        const optionEmail = typeof option === 'string' ? option : option.email;
        const valueEmail = typeof value === 'string' ? value : value.email;
        return optionEmail === valueEmail;
      }}
      filterOptions={(options, { inputValue }) => {
        const filtered = options.filter((option) => {
          const searchTerm = inputValue.toLowerCase();
          return (
            option.label.toLowerCase().includes(searchTerm) ||
            option.email.toLowerCase().includes(searchTerm)
          );
        });
        return filtered.slice(0, 10); // Limit to 10 suggestions
      }}
      renderOption={(props, option) => (
        <li {...props} key={option.email}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
            {option.photoUrl ? (
              <Avatar src={option.photoUrl} sx={{ width: 32, height: 32 }} />
            ) : (
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                <Mail size={16} />
              </Avatar>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {option.displayName || option.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {option.email}
              </Typography>
            </Box>
          </Box>
        </li>
      )}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => {
          const email = typeof option === 'string' ? option : option.email;
          const displayLabel = typeof option === 'string' ? option : option.label;
          const isValid = isValidEmail(email);

          return (
            <Chip
              {...getTagProps({ index })}
              key={email}
              label={displayLabel}
              size="small"
              color={isValid ? 'default' : 'error'}
              sx={{
                maxWidth: 200,
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              }}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={selectedOptions.length === 0 ? placeholder : undefined}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};
