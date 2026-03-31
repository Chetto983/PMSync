import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Avatar,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  CircularProgress,
  Box,
  Stack,
} from '@mui/material';
import { GitMerge } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useContactDuplicates } from '@/hooks/queries/use-contacts';
import type { Contact, DuplicateCandidate } from '@/lib/api/contacts';
import { contactsApi } from '@/lib/api/contacts';

interface ContactDuplicatesDialogProps {
  open: boolean;
  onClose: () => void;
  contact: Contact;
  onMergeRequest: (duplicate: Contact) => void;
}

const matchLabel = (type: string, t: Record<string, string | undefined>) => {
  const map: Record<string, string | undefined> = {
    email_exact: t.emailExact,
    name_fuzzy: t.nameFuzzy,
    phone_exact: t.phoneExact,
  };
  return map[type] ?? type;
};

const matchColor = (type: string): 'error' | 'warning' | 'info' => {
  if (type === 'email_exact') return 'error';
  if (type === 'name_fuzzy') return 'warning';
  return 'info';
};

export function ContactDuplicatesDialog({
  open,
  onClose,
  contact,
  onMergeRequest,
}: ContactDuplicatesDialogProps) {
  const t = useTranslations();
  const dc = t.contacts?.duplicates ?? {};
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data, isLoading } = useContactDuplicates(contact.id);
  const duplicates = data?.duplicates ?? [];

  const handleMerge = async (dup: DuplicateCandidate) => {
    setLoadingId(dup.contactId);
    try {
      const full = await contactsApi.getContact(dup.contactId);
      onMergeRequest(full);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <GitMerge size={20} />
        {dc.title ?? 'Possible Duplicates'}
      </DialogTitle>
      <DialogContent>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {!isLoading && duplicates.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            {dc.noDuplicates ?? 'No duplicates found.'}
          </Typography>
        )}

        {duplicates.length > 0 && (
          <List disablePadding>
            {duplicates.map((dup) => (
              <ListItem
                key={dup.contactId}
                sx={{ px: 0 }}
                secondaryAction={
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    startIcon={loadingId === dup.contactId ? <CircularProgress size={14} /> : <GitMerge size={14} />}
                    disabled={loadingId !== null}
                    onClick={() => handleMerge(dup)}
                  >
                    {dc.mergeWith ?? 'Merge'}
                  </Button>
                }
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: 'secondary.main', width: 36, height: 36, fontSize: '0.875rem' }}>
                    {(dup.displayName || '?')[0]?.toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={dup.displayName || dup.emails?.[0]?.value || '?'}
                  secondary={
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                      <Chip
                        label={matchLabel(dup.matchType, dc)}
                        size="small"
                        color={matchColor(dup.matchType)}
                        variant="outlined"
                      />
                      <Chip
                        label={`${Math.round(dup.confidence * 100)}%`}
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.common?.close ?? 'Close'}</Button>
      </DialogActions>
    </Dialog>
  );
}
