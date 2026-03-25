import React, { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Divider,
  TextField,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Button,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { Mail, Calendar, Users, Pencil } from 'lucide-react';
import { ProviderConfig, providersApi, UpdateProviderDto } from '@/lib/api/providers';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useLocale } from '@/lib/hooks/use-locale';
import { formatDateTimeInTz } from '@/lib/utils/format-date-tz';

interface ProvidersListProps {
  providers: ProviderConfig[];
  onDelete: () => void;
  onUpdate?: () => void;
}

export function ProvidersList({ providers, onDelete, onUpdate }: ProvidersListProps) {
  const translations = useTranslations();
  const providersCopy = translations.providers;
  const timezone = useUserTimezone();
  const { locale } = useLocale();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<{ id: string; email: string } | null>(null);
  const [providerToEdit, setProviderToEdit] = useState<ProviderConfig | null>(null);
  const [editForm, setEditForm] = useState<UpdateProviderDto>({});

  const openDeleteDialog = (id: string, email: string) => {
    setProviderToDelete({ id, email });
    setDeleteDialogOpen(true);
  };

  const openEditDialog = (provider: ProviderConfig) => {
    setProviderToEdit(provider);
    setEditForm({
      displayName: provider.displayName || '',
      scope: provider.scope || '',
      isDefault: provider.isDefault,
    });
    setEditDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!providerToDelete) return;
    setDeletingId(providerToDelete.id);
    setError('');
    try {
      await providersApi.deleteProvider(providerToDelete.id);
      onDelete();
      setDeleteDialogOpen(false);
      setProviderToDelete(null);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || providersCopy.errors.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpdate = async () => {
    if (!providerToEdit) return;
    setUpdatingId(providerToEdit.id);
    setError('');
    try {
      await providersApi.updateProvider(providerToEdit.id, editForm);
      onUpdate?.();
      setEditDialogOpen(false);
      setProviderToEdit(null);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || providersCopy.errors.updateFailed);
    } finally {
      setUpdatingId(null);
    }
  };

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'google':
        return (
          <svg width={24} height={24} viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        );
      case 'microsoft':
        return (
          <svg width={24} height={24} viewBox="0 0 23 23">
            <path fill="#f3f3f3" d="M0 0h23v23H0z" />
            <path fill="#f35325" d="M1 1h10v10H1z" />
            <path fill="#81bc06" d="M12 1h10v10H12z" />
            <path fill="#05a6f0" d="M1 12h10v10H1z" />
            <path fill="#ffba08" d="M12 12h10v10H12z" />
          </svg>
        );
      default:
        return <Mail size={24} />;
    }
  };

  const getProviderName = (type: string) => {
    switch (type) {
      case 'google': return providersCopy.googleTitle;
      case 'microsoft': return providersCopy.microsoftTitle;
      case 'generic': return providersCopy.genericTitle;
      default: return type;
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return providersCopy.neverSynced;
    return formatDateTimeInTz(date, timezone, locale);
  };

  if (providers.length === 0) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ py: 3 }}>
          <Typography variant="body2" color="text.secondary" align="center">
            {providersCopy.noProvidersMessage}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={3}>
      {error && (
        <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
      )}

      {providers.map((provider) => (
        <Card key={provider.id} variant="outlined" sx={{ borderRadius: 3 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 1.5 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              {getProviderIcon(provider.providerType)}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {provider.email}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {getProviderName(provider.providerType)}
                  {provider.displayName && ` — ${provider.displayName}`}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              {provider.scope && (
                <Chip label={provider.scope} size="small" color="info" variant="outlined" />
              )}
              {provider.isDefault && (
                <Chip label={providersCopy.badges.default} size="small" color="success" variant="outlined" />
              )}
              <Chip
                label={provider.isActive ? providersCopy.badges.active : providersCopy.badges.inactive}
                size="small"
                color={provider.isActive ? 'default' : 'error'}
                variant="outlined"
              />
              <Tooltip title={providersCopy.editTooltip}>
                <IconButton size="small" onClick={() => openEditDialog(provider)}>
                  <Pencil size={16} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>

          <Divider />

          <CardContent sx={{ px: 3, py: 2 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {provider.supportsEmail && (
                  <Chip icon={<Mail size={14} />} label={providersCopy.badges.email} size="small" variant="outlined" />
                )}
                {provider.supportsCalendar && (
                  <Chip icon={<Calendar size={14} />} label={providersCopy.badges.calendar} size="small" variant="outlined" />
                )}
                {provider.supportsContacts && (
                  <Chip icon={<Users size={14} />} label={providersCopy.badges.contacts} size="small" variant="outlined" />
                )}
              </Stack>

              <Typography variant="caption" color="text.secondary">
                {providersCopy.lastSynced.replace('{date}', formatDate(provider.lastSyncedAt))}
              </Typography>

              <Box>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  onClick={() => openDeleteDialog(provider.id, provider.email)}
                  disabled={deletingId === provider.id}
                >
                  {deletingId === provider.id ? providersCopy.disconnecting : providersCopy.disconnect}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      ))}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {providersCopy.deleteConfirm.replace('{email}', providerToDelete?.email || '')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{providersCopy.deleteDialogDescription}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deletingId !== null}>
            {translations.common.cancel}
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deletingId !== null}>
            {deletingId !== null ? providersCopy.disconnecting : providersCopy.disconnect}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Provider Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{providersCopy.editDialogTitle}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label={providersCopy.editForm.displayNameLabel}
              placeholder={providersCopy.editForm.displayNamePlaceholder}
              value={editForm.displayName || ''}
              onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
              fullWidth
              helperText={providersCopy.editForm.displayNameHelper}
            />
            <TextField
              label={providersCopy.editForm.scopeLabel}
              placeholder={providersCopy.editForm.scopePlaceholder}
              value={editForm.scope || ''}
              onChange={(e) => setEditForm({ ...editForm, scope: e.target.value })}
              fullWidth
              helperText={providersCopy.editForm.scopeHelper}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={updatingId !== null}>
            {translations.common.cancel}
          </Button>
          <Button onClick={handleUpdate} variant="contained" disabled={updatingId !== null}>
            {updatingId !== null ? translations.common.saving : providersCopy.saveChanges}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
