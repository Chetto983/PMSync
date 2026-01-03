import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useTranslations } from '@/lib/hooks/use-translations';

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

function parseEmails(input: string): Recipient[] {
  if (!input.trim()) return [];
  return input.split(/[,;]/).map((email) => ({
    email: email.trim(),
  })).filter((r) => r.email);
}

function RecipientField({
  label,
  recipients,
  onChange,
}: {
  label: string;
  recipients: Recipient[];
  onChange: (recipients: Recipient[]) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const parsed = parseEmails(inputValue);
      if (parsed.length > 0) {
        onChange([...recipients, ...parsed]);
        setInputValue('');
      }
    } else if (e.key === 'Backspace' && !inputValue && recipients.length > 0) {
      onChange(recipients.slice(0, -1));
    }
  };

  const handleBlur = () => {
    const parsed = parseEmails(inputValue);
    if (parsed.length > 0) {
      onChange([...recipients, ...parsed]);
      setInputValue('');
    }
  };

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
            key={index}
            label={recipient.name || recipient.email}
            size="small"
            onDelete={() => handleDelete(index)}
            sx={{ maxWidth: 200 }}
          />
        ))}
        <TextField
          variant="standard"
          size="small"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={recipients.length === 0 ? 'Add recipients...' : ''}
          InputProps={{
            disableUnderline: true,
          }}
          sx={{
            flex: 1,
            minWidth: 150,
            '& .MuiInputBase-input': {
              py: 0.5,
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
          <RecipientField label={t.email.composer.to} recipients={to} onChange={onToChange} />
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
        <RecipientField label={t.email.composer.cc} recipients={cc} onChange={onCcChange} />
        <RecipientField label={t.email.composer.bcc} recipients={bcc} onChange={onBccChange} />
      </Collapse>
    </Box>
  );
}
