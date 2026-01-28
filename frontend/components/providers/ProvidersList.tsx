import React, { useState } from 'react';
import { Box, Stack, Typography, Divider, TextField, IconButton, Tooltip } from '@mui/material';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProviderConfig, providersApi, UpdateProviderDto } from '@/lib/api/providers';
import { useTranslations } from '@/lib/hooks/use-translations';

const EditIcon = () => (
  <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

interface ProvidersListProps {
  providers: ProviderConfig[];
  onDelete: () => void;
  onUpdate?: () => void;
}

export function ProvidersList({ providers, onDelete, onUpdate }: ProvidersListProps) {
  const translations = useTranslations();
  const providersCopy = translations.providers;
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
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
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
        return (
          <svg width={24} height={24} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        );
    }
  };

  const getProviderName = (type: string) => {
    switch (type) {
      case 'google':
        return providersCopy.googleTitle;
      case 'microsoft':
        return providersCopy.microsoftTitle;
      case 'generic':
        return providersCopy.genericTitle;
      default:
        return type;
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return providersCopy.neverSynced;
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (providers.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
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
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {providers.map((provider) => (
        <Card key={provider.id} className="rounded-xl">
          <CardHeader className="flex flex-col md:flex-row gap-2 items-start md:items-center justify-between">
            <Stack direction="row" spacing={2} alignItems="center">
              {getProviderIcon(provider.providerType)}
              <Box>
                <CardTitle className="font-semibold mb-0.5 text-base">
                  {provider.email}
                </CardTitle>
                <CardDescription>
                  {getProviderName(provider.providerType)}
                  {provider.displayName && ` — ${provider.displayName}`}
                </CardDescription>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              {provider.scope && (
                <Badge variant="info" className="text-[0.7rem] px-1.5 py-0.5">{provider.scope}</Badge>
              )}
              {provider.isDefault && (
                <Badge variant="success" className="text-[0.7rem] px-1.5 py-0.5">{providersCopy.badges.default}</Badge>
              )}
              {provider.isActive ? (
                <Badge variant="outline" className="text-[0.7rem] px-1.5 py-0.5">{providersCopy.badges.active}</Badge>
              ) : (
                <Badge variant="destructive" className="text-[0.7rem] px-1.5 py-0.5">
                  {providersCopy.badges.inactive}
                </Badge>
              )}
              <Tooltip title={providersCopy.editTooltip}>
                <IconButton size="small" onClick={() => openEditDialog(provider)}>
                  <EditIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </CardHeader>
          <Divider />
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {provider.supportsEmail && (
                  <Badge variant="secondary" className="text-[0.72rem] px-1 py-0.5">
                    <span className="inline-flex mr-0.5">
                      <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </span>
                    {providersCopy.badges.email}
                  </Badge>
                )}
                {provider.supportsCalendar && (
                  <Badge variant="secondary" className="text-[0.72rem] px-1 py-0.5">
                    <span className="inline-flex mr-0.5">
                      <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </span>
                    {providersCopy.badges.calendar}
                  </Badge>
                )}
                {provider.supportsContacts && (
                  <Badge variant="secondary" className="text-[0.72rem] px-1 py-0.5">
                    <span className="inline-flex mr-0.5">
                      <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </span>
                    {providersCopy.badges.contacts}
                  </Badge>
                )}
              </Stack>

              <Typography variant="caption" color="text.secondary">
                {providersCopy.lastSynced.replace('{date}', formatDate(provider.lastSyncedAt))}
              </Typography>

              <div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive hover:bg-destructive/10"
                  onClick={() => openDeleteDialog(provider.id, provider.email)}
                  disabled={deletingId === provider.id}
                >
                  {deletingId === provider.id ? providersCopy.disconnecting : providersCopy.disconnect}
                </Button>
              </div>
            </Stack>
          </CardContent>
        </Card>
      ))}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{providersCopy.deleteConfirm.replace('{email}', providerToDelete?.email || '')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {providersCopy.deleteDialogDescription}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} disabled={deletingId !== null}>
            {translations.common.cancel}
          </Button>
          <Button
            onClick={handleDelete}
            variant="destructive"
            disabled={deletingId !== null}
          >
            {deletingId !== null ? providersCopy.disconnecting : providersCopy.disconnect}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Provider Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
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
          <Button variant="ghost" onClick={() => setEditDialogOpen(false)} disabled={updatingId !== null}>
            {translations.common.cancel}
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={updatingId !== null}
          >
            {updatingId !== null ? translations.common.saving : providersCopy.saveChanges}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
