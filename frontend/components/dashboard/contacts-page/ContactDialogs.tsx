import React from 'react';
import {
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  DialogContentText,
  Typography,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { type ProviderConfig } from '@/lib/api/providers';
import { type ContactFormState } from './useContactForm';

interface ContactFormDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  form: ContactFormState;
  onFormChange: (field: keyof ContactFormState, value: string | boolean) => void;
  onSubmit: () => void;
  providers: ProviderConfig[];
  actionLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contactsCopy: any;
}

export function ContactFormDialog({
  open,
  onClose,
  mode,
  form,
  onFormChange,
  onSubmit,
  providers,
  actionLoading,
  contactsCopy,
}: ContactFormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {mode === 'create'
          ? contactsCopy.createDialog?.title || 'New Contact'
          : contactsCopy.editDialog?.title || 'Edit Contact'}
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          <FormControl fullWidth disabled={mode === 'edit'}>
            <InputLabel>{contactsCopy.createDialog?.provider || 'Provider'}</InputLabel>
            <Select
              label={contactsCopy.createDialog?.provider || 'Provider'}
              value={form.providerId || ''}
              onChange={(e) => onFormChange('providerId', String(e.target.value))}
            >
              {providers.map((provider) => (
                <MenuItem key={provider.id} value={provider.id}>
                  {provider.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
              {contactsCopy.createDialog?.personalInformation || 'Personal Information'}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <TextField
                  label={contactsCopy.createDialog?.firstName || 'First Name'}
                  value={form.firstName}
                  onChange={(e) => onFormChange('firstName', e.target.value)}
                  fullWidth
                />
                <TextField
                  label={contactsCopy.createDialog?.lastName || 'Last Name'}
                  value={form.lastName}
                  onChange={(e) => onFormChange('lastName', e.target.value)}
                  fullWidth
                />
              </Box>
              <TextField
                label={contactsCopy.createDialog?.name || 'Name'}
                value={form.displayName}
                onChange={(e) => onFormChange('displayName', e.target.value)}
                fullWidth
                helperText={contactsCopy.createDialog?.displayNameHelper || 'Display name'}
              />
              <TextField
                label={contactsCopy.createDialog?.birthday || 'Birthday'}
                type="date"
                value={form.birthday}
                onChange={(e) => onFormChange('birthday', e.target.value)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.isVip}
                    onChange={(e) => onFormChange('isVip', e.target.checked)}
                    color="warning"
                  />
                }
                label={contactsCopy.details?.vipLabel || 'VIP Contact'}
              />
            </Box>
          </Box>

          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
              {contactsCopy.createDialog?.contactInformation || 'Contact Information'}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label={contactsCopy.createDialog?.email || 'Email'}
                type="email"
                value={form.email}
                onChange={(e) => onFormChange('email', e.target.value)}
                fullWidth
                required
              />
              <TextField
                label={contactsCopy.createDialog?.phoneNumber || 'Phone Number'}
                type="tel"
                value={form.phone}
                onChange={(e) => onFormChange('phone', e.target.value)}
                fullWidth
              />
              <TextField
                label={contactsCopy.createDialog?.website || 'Website'}
                type="url"
                value={form.website}
                onChange={(e) => onFormChange('website', e.target.value)}
                fullWidth
                placeholder={contactsCopy.createDialog?.websitePlaceholder || 'https://example.com'}
              />
            </Box>
          </Box>

          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
              {contactsCopy.createDialog?.professionalInformation || 'Professional Information'}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label={contactsCopy.createDialog?.company || 'Company'}
                value={form.company}
                onChange={(e) => onFormChange('company', e.target.value)}
                fullWidth
              />
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <TextField
                  label={contactsCopy.createDialog?.jobTitle || 'Job Title'}
                  value={form.jobTitle}
                  onChange={(e) => onFormChange('jobTitle', e.target.value)}
                  fullWidth
                />
                <TextField
                  label={contactsCopy.createDialog?.department || 'Department'}
                  value={form.department}
                  onChange={(e) => onFormChange('department', e.target.value)}
                  fullWidth
                />
              </Box>
            </Box>
          </Box>

          <TextField
            label={contactsCopy.createDialog?.notes || 'Notes'}
            value={form.notes}
            onChange={(e) => onFormChange('notes', e.target.value)}
            fullWidth
            multiline
            minRows={3}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{contactsCopy.createDialog?.cancel || 'Cancel'}</Button>
        <Button
          variant="contained"
          onClick={onSubmit}
          disabled={actionLoading || (mode === 'create' && !form.providerId)}
        >
          {mode === 'create' ? contactsCopy.createDialog?.create || 'Create' : contactsCopy.editDialog?.save || 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface DeleteContactDialogProps {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  actionLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contactsCopy: any;
}

export function DeleteContactDialog({
  open,
  onClose,
  onDelete,
  actionLoading,
  contactsCopy,
}: DeleteContactDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{contactsCopy.alerts?.deleteConfirmTitle || 'Delete'}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {contactsCopy.alerts?.deleteConfirmDescription || 'Are you sure?'}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={actionLoading}>
          {contactsCopy.createDialog.cancel}
        </Button>
        <Button onClick={onDelete} color="error" variant="contained" disabled={actionLoading}>
          {contactsCopy.alerts.deleteConfirmTitle}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
