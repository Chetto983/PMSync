import React from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Trash2 } from 'lucide-react';
import { SectionCard } from './SectionCard';

export interface AccountSettingsProps {
  accountName: string;
  email: string;
  role: string;
  language: string;
  // Delete dialog state
  deleteDialogOpen: boolean;
  deleteConfirmText: string;
  deleteLoading: boolean;
  deleteError: string;
  onOpenDeleteDialog: () => void;
  onCloseDeleteDialog: () => void;
  onDeleteConfirmTextChange: (text: string) => void;
  onDeleteAccount: () => void;
  copy: {
    title: string;
    description: string;
    profileTitle: string;
    fullName: string;
    email: string;
    role: string;
    contactAdmin: string;
    dangerZoneTitle: string;
    dangerZoneDescription: string;
    deleteAccount: string;
    deleteDialogTitle: string;
    deleteDialogDescription: string;
    deleteDialogConfirmLabel: string;
    deleteDialogCancel: string;
    deleteDialogConfirm: string;
    deleteDialogDeleting: string;
    deleteDialogError: string;
  };
}

export function AccountSettings({
  accountName,
  email,
  role,
  language,
  deleteDialogOpen,
  deleteConfirmText,
  deleteLoading,
  deleteError,
  onOpenDeleteDialog,
  onCloseDeleteDialog,
  onDeleteConfirmTextChange,
  onDeleteAccount,
  copy,
}: AccountSettingsProps) {
  const confirmWord = language === 'it' ? 'ELIMINA' : 'DELETE';

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {copy.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {copy.description}
      </Typography>

      <SectionCard title={copy.profileTitle || 'Profile'}>
        <Stack spacing={2}>
          <TextField label={copy.fullName} value={accountName} fullWidth size="small" disabled />
          <TextField label={copy.email} value={email} fullWidth size="small" disabled />
          <TextField label={copy.role} value={role} fullWidth size="small" disabled />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          {copy.contactAdmin}
        </Typography>
      </SectionCard>

      <Card variant="outlined" sx={{ borderColor: 'error.main' }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'error.main', mb: 1 }}>
            {copy.dangerZoneTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {copy.dangerZoneDescription}
          </Typography>
          <Button
            variant="outlined"
            color="error"
            startIcon={<Trash2 size={16} />}
            onClick={onOpenDeleteDialog}
          >
            {copy.deleteAccount}
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={deleteDialogOpen}
        onClose={onCloseDeleteDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: 'error.main' }}>
          {copy.deleteDialogTitle}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {copy.deleteDialogDescription}
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label={copy.deleteDialogConfirmLabel}
            value={deleteConfirmText}
            onChange={(e) => onDeleteConfirmTextChange(e.target.value.toUpperCase())}
            placeholder={confirmWord}
            error={deleteConfirmText.length > 0 && deleteConfirmText !== confirmWord}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onCloseDeleteDialog} disabled={deleteLoading}>
            {copy.deleteDialogCancel}
          </Button>
          <Button
            onClick={onDeleteAccount}
            color="error"
            variant="contained"
            disabled={deleteLoading || deleteConfirmText !== confirmWord}
            startIcon={deleteLoading ? <CircularProgress size={16} color="inherit" /> : <Trash2 size={16} />}
          >
            {deleteLoading ? copy.deleteDialogDeleting : copy.deleteDialogConfirm}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
