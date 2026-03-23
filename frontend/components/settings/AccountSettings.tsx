import React, { useRef, useState } from 'react';
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
  Avatar,
  alpha,
} from '@mui/material';
import { Trash2, Camera, X } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { AvatarEditorDialog } from './AvatarEditorDialog';

export interface AccountSettingsProps {
  accountName: string;
  email: string;
  role: string;
  language: string;
  // Avatar
  avatarUrl?: string | null;
  avatarUploading?: boolean;
  onAvatarUpload?: (file: File) => void;
  onAvatarSave?: (avatarUrl: string) => Promise<void>;
  onAvatarRemove?: () => void;
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
    avatar?: {
      title: string;
      upload: string;
      change: string;
      remove: string;
      dropHint: string;
      sizeHint: string;
      uploading: string;
      uploadSuccess: string;
      uploadError: string;
      removeConfirm: string;
      editor?: {
        title: string;
        uploadTab: string;
        chooseTab: string;
        zoom: string;
        rotate: string;
        randomize: string;
        styleLabel: string;
        cancel: string;
        save: string;
        saving: string;
      };
    };
  };
}

/**
 * Get initials from name
 */
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

export function AccountSettings({
  accountName,
  email,
  role,
  language,
  avatarUrl,
  avatarUploading = false,
  onAvatarUpload,
  onAvatarSave,
  onAvatarRemove,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAvatarUpload) {
      // Validate file type and size
      if (!file.type.startsWith('image/')) {
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        // 2MB max
        return;
      }
      onAvatarUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAvatarClick = () => {
    // Open editor dialog if available, otherwise fallback to file input
    if (onAvatarSave && copy.avatar?.editor) {
      setEditorDialogOpen(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleRemoveConfirm = () => {
    onAvatarRemove?.();
    setRemoveDialogOpen(false);
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {copy.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {copy.description}
      </Typography>

      {/* Avatar Section */}
      {copy.avatar && (
        <SectionCard title={copy.avatar.title} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {/* Avatar with hover overlay */}
            <Box
              sx={{
                position: 'relative',
                cursor: 'pointer',
                '&:hover .avatar-overlay': {
                  opacity: 1,
                },
                '@media (hover: none)': {
                  '& .avatar-overlay': { opacity: 0.6 },
                },
              }}
              onClick={handleAvatarClick}
            >
              <Avatar
                src={avatarUrl || undefined}
                sx={{
                  width: 96,
                  height: 96,
                  fontSize: '2rem',
                  fontWeight: 600,
                  bgcolor: 'primary.main',
                }}
              >
                {getInitials(accountName)}
              </Avatar>
              <Box
                className="avatar-overlay"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  bgcolor: (theme) => alpha(theme.palette.common.black, 0.5),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {avatarUploading ? (
                  <CircularProgress size={24} sx={{ color: 'white' }} />
                ) : (
                  <Camera size={24} color="white" />
                )}
              </Box>
            </Box>

            {/* Upload/Remove buttons */}
            <Stack spacing={1}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleAvatarClick}
                disabled={avatarUploading}
                startIcon={avatarUploading ? <CircularProgress size={16} /> : <Camera size={16} />}
              >
                {avatarUploading
                  ? copy.avatar.uploading
                  : avatarUrl
                    ? copy.avatar.change
                    : copy.avatar.upload}
              </Button>
              {avatarUrl && onAvatarRemove && (
                <Button
                  variant="text"
                  size="small"
                  color="error"
                  onClick={() => setRemoveDialogOpen(true)}
                  startIcon={<X size={16} />}
                >
                  {copy.avatar.remove}
                </Button>
              )}
              <Typography variant="caption" color="text.secondary">
                {copy.avatar.sizeHint}
              </Typography>
            </Stack>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload profile picture"
              tabIndex={-1}
              onChange={handleFileSelect}
              hidden
            />
          </Box>
        </SectionCard>
      )}

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

      {/* Delete Account Dialog */}
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

      {/* Remove Avatar Confirmation Dialog */}
      {copy.avatar && (
        <Dialog
          open={removeDialogOpen}
          onClose={() => setRemoveDialogOpen(false)}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>{copy.avatar.remove}</DialogTitle>
          <DialogContent>
            <DialogContentText>{copy.avatar.removeConfirm}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRemoveDialogOpen(false)}>
              {copy.deleteDialogCancel}
            </Button>
            <Button onClick={handleRemoveConfirm} color="error" variant="contained">
              {copy.avatar.remove}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Avatar Editor Dialog */}
      {copy.avatar?.editor && onAvatarSave && (
        <AvatarEditorDialog
          open={editorDialogOpen}
          onClose={() => setEditorDialogOpen(false)}
          onSave={onAvatarSave}
          currentAvatar={avatarUrl}
          userName={accountName}
          userEmail={email}
          copy={{
            title: copy.avatar.editor.title,
            uploadTab: copy.avatar.editor.uploadTab,
            chooseTab: copy.avatar.editor.chooseTab,
            zoom: copy.avatar.editor.zoom,
            rotate: copy.avatar.editor.rotate,
            dropHint: copy.avatar.dropHint,
            randomize: copy.avatar.editor.randomize,
            styleLabel: copy.avatar.editor.styleLabel,
            cancel: copy.avatar.editor.cancel,
            save: copy.avatar.editor.save,
            saving: copy.avatar.editor.saving,
          }}
        />
      )}
    </Box>
  );
}
