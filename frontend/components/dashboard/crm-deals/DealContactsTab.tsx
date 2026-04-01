/**
 * DealContactsTab — shows linked contacts for a deal with add/remove.
 * Mirrors AccountContactsTab pattern.
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Skeleton,
  Alert,
} from '@mui/material';
import { Plus, Trash2, Search, UserPlus } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useDealContacts,
  useLinkDealContact,
  useUnlinkDealContact,
} from '@/hooks/queries/use-crm-deals';
import { useContacts } from '@/hooks/queries/use-contacts';
import type { Contact } from '@/lib/api/contacts';
import type { CrmDealContactLink } from '@/lib/api/crm-deals';
import { useGlobalToast } from '@/lib/context/toast-context';

const CONTACT_ROLES = [
  'buyer',
  'influencer',
  'champion',
  'decisionMaker',
  'technicalEvaluator',
  'endUser',
  'other',
] as const;

// ---- Add Contact Dialog ----

function AddContactDialog({
  open,
  onClose,
  dealId,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
}) {
  const t = useTranslations();
  const tc = t.crmDeals?.detail?.contacts;
  const tr = t.crmDeals?.detail?.contactRoles;
  const toast = useGlobalToast();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [role, setRole] = useState('');

  const { data: contactsData, isLoading } = useContacts({
    search: search || undefined,
    limit: 20,
  });
  const linkContact = useLinkDealContact(dealId);

  const contacts = contactsData?.contacts ?? [];

  const handleSubmit = async () => {
    if (!selectedId) return;
    try {
      await linkContact.mutateAsync({
        contactId: selectedId,
        role: role || undefined,
      });
      toast.success(tc?.linked ?? 'Contact linked');
      setSearch('');
      setSelectedId('');
      setRole('');
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr?.response?.status === 409) {
        toast.error(tc?.alreadyLinked ?? 'Already linked');
      } else {
        toast.error(tc?.linkError ?? 'Failed to link contact to deal');
      }
    }
  };

  const handleClose = () => {
    setSearch('');
    setSelectedId('');
    setRole('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{tc?.addContact ?? 'Add Contact'}</DialogTitle>
      <DialogContent>
        <TextField
          placeholder={tc?.searchContacts ?? 'Search contacts...'}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedId('');
          }}
          size="small"
          fullWidth
          sx={{ mt: 1, mb: 2 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            },
          }}
        />

        {isLoading && (
          <Box>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />
            ))}
          </Box>
        )}

        <Box sx={{ maxHeight: 240, overflow: 'auto', mb: 2 }}>
          {contacts.map((contact: Contact) => (
            <Box
              key={contact.id}
              role="option"
              tabIndex={0}
              aria-selected={selectedId === contact.id}
              onClick={() => setSelectedId(contact.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(contact.id); } }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 1,
                px: 1.5,
                borderRadius: 1,
                cursor: 'pointer',
                bgcolor: selectedId === contact.id ? 'primary.main' : 'transparent',
                color: selectedId === contact.id ? 'primary.contrastText' : 'text.primary',
                '&:hover, &:focus-visible': {
                  bgcolor: selectedId === contact.id ? 'primary.dark' : 'action.hover',
                },
              }}
            >
              <UserPlus size={16} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={500}>
                  {contact.displayName || 'Unnamed'}
                </Typography>
                {contact.company && (
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    {contact.company}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
          {!isLoading && contacts.length === 0 && search && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              {t.contacts?.noContactsFound ?? 'No results'}
            </Typography>
          )}
        </Box>

        <FormControl size="small" fullWidth>
          <InputLabel>{tr?.label ?? 'Role'}</InputLabel>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            label={tr?.label ?? 'Role'}
          >
            <MenuItem value="">
              <em>{tr?.placeholder ?? 'Select role'}</em>
            </MenuItem>
            {CONTACT_ROLES.map((r) => (
              <MenuItem key={r} value={r}>
                {tr?.[r as keyof typeof tr] ?? r}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t.common?.cancel ?? 'Cancel'}</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!selectedId || linkContact.isPending}
        >
          {tc?.addContact ?? 'Add Contact'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- Main Component ----

export function DealContactsTab({ dealId }: { dealId: string }) {
  const t = useTranslations();
  const tc = t.crmDeals?.detail?.contacts;
  const tr = t.crmDeals?.detail?.contactRoles;
  const toast = useGlobalToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: links, isLoading, isError } = useDealContacts(dealId);
  const unlinkContact = useUnlinkDealContact(dealId);

  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);

  const handleUnlink = async () => {
    if (!confirmUnlinkId) return;
    try {
      await unlinkContact.mutateAsync(confirmUnlinkId);
      toast.success(tc?.unlinked ?? 'Contact removed');
    } catch {
      toast.error(tc?.unlinkError ?? 'Failed to remove contact from deal');
    } finally {
      setConfirmUnlinkId(null);
    }
  };

  const getRoleLabel = (role: string | null) => {
    if (!role) return null;
    return tr?.[role as keyof typeof tr] ?? role;
  };

  if (isLoading) {
    return (
      <Box>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={48} sx={{ mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (isError) {
    return <Alert severity="error">{tc?.loadError ?? 'Failed to load deal contacts'}</Alert>;
  }

  const contacts = links ?? [];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2">
          {tc?.title ?? 'Linked Contacts'} ({contacts.length})
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Plus size={16} />}
          onClick={() => setDialogOpen(true)}
        >
          {tc?.addContact ?? 'Add Contact'}
        </Button>
      </Box>

      {contacts.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary" gutterBottom>
            {tc?.noContacts ?? 'No contacts linked'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {tc?.noContactsDescription ?? 'Link contacts to track stakeholders for this deal.'}
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<Plus size={16} />}
            onClick={() => setDialogOpen(true)}
          >
            {tc?.addContact ?? 'Add Contact'}
          </Button>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t.crmDeals?.columns?.name ?? 'Name'}</TableCell>
                <TableCell>{t.contacts?.details?.company ?? 'Company'}</TableCell>
                <TableCell>{tr?.label ?? 'Role'}</TableCell>
                <TableCell width={50} />
              </TableRow>
            </TableHead>
            <TableBody>
              {contacts.map((link: CrmDealContactLink) => (
                <TableRow key={link.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {link.contact.displayName || 'Unnamed'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {link.contact.company || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {link.role ? (
                      <Chip label={getRoleLabel(link.role)} size="small" variant="outlined" />
                    ) : (
                      <Typography variant="body2" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => setConfirmUnlinkId(link.contactId)}
                      sx={{ minWidth: 44, minHeight: 44 }}
                      aria-label={tc?.removeContact ?? 'Remove contact'}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <AddContactDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        dealId={dealId}
      />

      <Dialog open={!!confirmUnlinkId} onClose={() => setConfirmUnlinkId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{tc?.removeContact ?? 'Remove Contact'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {tc?.removeConfirm ?? 'Remove this contact from the deal?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmUnlinkId(null)} disabled={unlinkContact.isPending}>
            {t.common?.cancel ?? 'Cancel'}
          </Button>
          <Button onClick={handleUnlink} color="error" variant="contained" disabled={unlinkContact.isPending}>
            {tc?.removeButton ?? 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
