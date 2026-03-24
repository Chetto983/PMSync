import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Tooltip } from '@mui/material';
import { Pencil } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { CrmAccountAddress } from '@/lib/api/crm-accounts';

interface AddressEditSectionProps {
  address: CrmAccountAddress | null;
  onSave: (addr: CrmAccountAddress) => void;
}

export function AddressEditSection({ address, onSave }: AddressEditSectionProps) {
  const t = useTranslations();
  const ta = t.crmAccounts;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CrmAccountAddress>(
    address ?? { street: '', city: '', state: '', zip: '', country: '' },
  );

  const addressStr = address
    ? [address.street, address.city, address.state, address.zip, address.country]
        .filter(Boolean)
        .join(', ')
    : null;

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(address ?? { street: '', city: '', state: '', zip: '', country: '' });
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        <TextField
          label={ta?.form?.street ?? 'Street'}
          value={draft.street ?? ''}
          onChange={(e) => setDraft({ ...draft, street: e.target.value })}
          size="small"
          fullWidth
          autoFocus
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label={ta?.form?.city ?? 'City'}
            value={draft.city ?? ''}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            size="small"
            fullWidth
          />
          <TextField
            label={ta?.form?.state ?? 'State'}
            value={draft.state ?? ''}
            onChange={(e) => setDraft({ ...draft, state: e.target.value })}
            size="small"
            fullWidth
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label={ta?.form?.zip ?? 'ZIP'}
            value={draft.zip ?? ''}
            onChange={(e) => setDraft({ ...draft, zip: e.target.value })}
            size="small"
            fullWidth
          />
          <TextField
            label={ta?.form?.country ?? 'Country'}
            value={draft.country ?? ''}
            onChange={(e) => setDraft({ ...draft, country: e.target.value })}
            size="small"
            fullWidth
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button size="small" variant="contained" onClick={handleSave}>
            {ta?.save ?? 'Save'}
          </Button>
          <Button size="small" onClick={handleCancel}>
            {ta?.cancel ?? 'Cancel'}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Tooltip title={ta?.detail?.info?.editField ?? 'Click to edit'}>
      <Box
        onClick={() => setEditing(true)}
        sx={{
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 1,
          px: 1,
          py: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flex: 1,
        }}
      >
        <Typography
          variant="body2"
          color={addressStr ? 'text.primary' : 'text.disabled'}
          sx={{ flex: 1 }}
        >
          {addressStr || (ta?.detail?.info?.noAddress ?? 'No address')}
        </Typography>
        <Pencil size={14} style={{ opacity: 0.4 }} />
      </Box>
    </Tooltip>
  );
}
