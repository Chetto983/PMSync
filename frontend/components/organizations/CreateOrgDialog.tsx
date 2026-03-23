import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateOrg } from '@/hooks/queries';

export function CreateOrgDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const createOrg = useCreateOrg();

  const getErrorMessage = (error: unknown) => (
    error instanceof Error && error.message
      ? error.message
      : t.common.genericError
  );

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate slug from name
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !slug.trim()) return;

    try {
      await createOrg.mutateAsync({ name: name.trim(), slug: slug.trim() });
      setName('');
      setSlug('');
      onClose();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  };

  const handleClose = () => {
    setName('');
    setSlug('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t.organizations.create}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label={t.organizations.name}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            disabled={createOrg.isPending}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            label={t.organizations.slug}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={createOrg.isPending}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={createOrg.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!name.trim() || !slug.trim() || createOrg.isPending}
            startIcon={
              createOrg.isPending ? <CircularProgress size={16} /> : null
            }
          >
            {t.organizations.create}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
