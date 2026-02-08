import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';


import { ChevronDown as ExpandMoreIcon, ChevronUp as ExpandLessIcon, User as PersonIcon } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useContactSearch } from '@/hooks/queries/use-contacts';
import type { Contact } from '@/lib/api/contacts';

export type Recipient = {
  email: string;
  name?: string;
};

export type ComposeRecipientsProps = {
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  onToChange: (recipients: Recipient[]) => void;
  onCcChange: (recipients: Recipient[]) => void;
  onBccChange: (recipients: Recipient[]) => void;
};

function getContactDisplayName(contact: Contact): string {
  if (contact.displayName) return contact.displayName;
  if (contact.firstName && contact.lastName) {
    return `${contact.firstName} ${contact.lastName}`;
  }
  if (contact.firstName) return contact.firstName;
  if (contact.lastName) return contact.lastName;
  return contact.emails?.[0]?.value || '';
}

function getContactPrimaryEmail(contact: Contact): string | null {
  if (!contact.emails || contact.emails.length === 0) return null;
  const primary = contact.emails.find((e) => e.primary);
  return primary?.value || contact.emails[0]?.value || null;
}

function contactToRecipient(contact: Contact): Recipient | null {
  const email = getContactPrimaryEmail(contact);
  if (!email) return null;
  return {
    email,
    name: getContactDisplayName(contact),
  };
}

type AutocompleteOption = {
  type: 'contact';
  contact: Contact;
  email: string;
  name: string;
} | {
  type: 'custom';
  email: string;
};

function RecipientField({
  label,
  recipients,
  onChange,
  placeholder,
  addPrefix,
}: {
  label: string;
  recipients: Recipient[];
  onChange: (recipients: Recipient[]) => void;
  placeholder?: string;
  addPrefix: string;
}) {
  const [inputValue, setInputValue] = useState('');

  // Search contacts - hook only fires when input >= 2 chars
  const { data: searchResults, isLoading } = useContactSearch(inputValue.trim());

  // Convert contacts to autocomplete options
  const options: AutocompleteOption[] = useMemo(() => {
    const contactOptions: AutocompleteOption[] = [];

    if (searchResults?.contacts) {
      for (const contact of searchResults.contacts) {
        const email = getContactPrimaryEmail(contact);
        if (email) {
          // Skip if already in recipients
          if (!recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
            contactOptions.push({
              type: 'contact',
              contact,
              email,
              name: getContactDisplayName(contact),
            });
          }
        }
      }
    }

    // Add custom email option if input looks like an email
    const trimmedInput = inputValue.trim();
    if (
      trimmedInput &&
      trimmedInput.includes('@') &&
      !contactOptions.some((o) => o.email.toLowerCase() === trimmedInput.toLowerCase()) &&
      !recipients.some((r) => r.email.toLowerCase() === trimmedInput.toLowerCase())
    ) {
      contactOptions.push({
        type: 'custom',
        email: trimmedInput,
      });
    }

    return contactOptions;
  }, [searchResults, inputValue, recipients]);

  const handleDelete = (index: number) => {
    onChange(recipients.filter((_, i) => i !== index));
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
      <Box
        sx={{
          minWidth: 40,
          pt: 1,
          color: 'text.secondary',
          fontSize: '0.875rem',
        }}
      >
        {label}:
      </Box>
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.5,
          alignItems: 'center',
        }}
      >
        {recipients.map((recipient, index) => (
          <Chip
            key={`${recipient.email}-${index}`}
            label={recipient.name || recipient.email}
            size="small"
            onDelete={() => handleDelete(index)}
            avatar={
              <Avatar sx={{ width: 24, height: 24 }}>
                {(recipient.name || recipient.email).charAt(0).toUpperCase()}
              </Avatar>
            }
            sx={{ maxWidth: 200 }}
          />
        ))}
        <Autocomplete
          multiple
          freeSolo
          disableClearable
          size="small"
          options={options}
          value={[]}
          inputValue={inputValue}
          onInputChange={(_, value, reason) => {
            if (reason !== 'reset') {
              setInputValue(value);
            }
          }}
          onChange={(_, newValue) => {
            // Handle selection
            const lastValue = newValue[newValue.length - 1];
            if (lastValue) {
              if (typeof lastValue === 'string') {
                // Typed email address
                if (lastValue.includes('@')) {
                  onChange([...recipients, { email: lastValue.trim() }]);
                }
              } else if (lastValue.type === 'contact') {
                const recipient = contactToRecipient(lastValue.contact);
                if (recipient) {
                  onChange([...recipients, recipient]);
                }
              } else if (lastValue.type === 'custom') {
                onChange([...recipients, { email: lastValue.email }]);
              }
              setInputValue('');
            }
          }}
          getOptionLabel={(option) => {
            if (typeof option === 'string') return option;
            return option.type === 'contact' ? option.name : option.email;
          }}
          isOptionEqualToValue={(option, value) => {
            if (typeof option === 'string' || typeof value === 'string') return false;
            return option.email === value.email;
          }}
          filterOptions={(x) => x} // Disable built-in filtering, we handle it
          loading={isLoading}
          renderOption={(props, option) => {
            if (option.type === 'contact') {
              return (
                <Box
                  component="li"
                  {...props}
                  key={option.contact.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
                >
                  <Avatar
                    src={option.contact.photoUrl || undefined}
                    sx={{ width: 32, height: 32 }}
                  >
                    {option.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {option.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {option.email}
                    </Typography>
                  </Box>
                </Box>
              );
            }
            // Custom email option
            return (
              <Box
                component="li"
                {...props}
                key={option.email}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
              >
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                  <PersonIcon size={18} />
                </Avatar>
                <Typography variant="body2">
                  {addPrefix} {option.email}
                </Typography>
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="standard"
              placeholder={recipients.length === 0 ? placeholder : ''}
              inputProps={{
                ...params.inputProps,
                'aria-label': label,
              }}
              InputProps={{
                ...params.InputProps,
                disableUnderline: true,
                endAdornment: (
                  <>
                    {isLoading ? <CircularProgress size={16} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
          sx={{
            flex: 1,
            minWidth: 150,
            '& .MuiAutocomplete-inputRoot': {
              py: 0.5,
            },
            '& .MuiAutocomplete-input': {
              minWidth: '100px !important',
            },
          }}
          slotProps={{
            popper: {
              sx: { zIndex: 1400 }, // Above dialog
            },
          }}
        />
      </Box>
    </Box>
  );
}

export default function ComposeRecipients({
  to,
  cc,
  bcc,
  onToChange,
  onCcChange,
  onBccChange,
}: ComposeRecipientsProps) {
  const t = useTranslations();
  const [showCcBcc, setShowCcBcc] = useState(cc.length > 0 || bcc.length > 0);

  return (
    <Box sx={{ px: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Box sx={{ flex: 1 }}>
          <RecipientField
            label={t.email.composer.to}
            recipients={to}
            onChange={onToChange}
            placeholder={t.email.composer.addRecipients}
            addPrefix={t.email.composer.addEmailPrefix}
          />
        </Box>
        <IconButton
          size="small"
          onClick={() => setShowCcBcc(!showCcBcc)}
          sx={{ ml: 1 }}
        >
          {showCcBcc ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={showCcBcc}>
        <RecipientField
          label={t.email.composer.cc}
          recipients={cc}
          onChange={onCcChange}
          placeholder={t.email.composer.addRecipients}
          addPrefix={t.email.composer.addEmailPrefix}
        />
        <RecipientField
          label={t.email.composer.bcc}
          recipients={bcc}
          onChange={onBccChange}
          placeholder={t.email.composer.addRecipients}
          addPrefix={t.email.composer.addEmailPrefix}
        />
      </Collapse>
    </Box>
  );
}
