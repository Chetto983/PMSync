import React, { useCallback, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  IconButton,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Divider,
  Chip,
} from '@mui/material';
import { Edit2, Trash2, Plus, Star, Check } from 'lucide-react';
import {
  RichTextEditor,
  MenuButtonBold,
  MenuButtonItalic,
  MenuButtonUnderline,
  MenuButtonStrikethrough,
  MenuDivider,
  MenuControlsContainer,
  MenuButtonAddLink,
  type RichTextEditorRef,
} from 'mui-tiptap';
import { SectionCard } from './SectionCard';
import useExtensions from '@/components/email/compose/useExtensions';

export interface EmailSignature {
  id: string;
  name: string;
  content: string; // HTML content
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SignatureSettingsProps {
  signatures: EmailSignature[];
  onSave: (signature: Omit<EmailSignature, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  loading?: boolean;
  error?: string;
  onClearError?: () => void;
  copy: {
    title: string;
    description: string;
    addSignature: string;
    editSignature: string;
    deleteSignature: string;
    signatureName: string;
    signatureNamePlaceholder: string;
    signatureContent: string;
    setAsDefault: string;
    defaultBadge: string;
    save: string;
    cancel: string;
    deleteConfirmTitle: string;
    deleteConfirmMessage: string;
    noSignatures: string;
    previewTitle: string;
  };
}

function SignatureEditorControls() {
  return (
    <MenuControlsContainer>
      <MenuButtonBold />
      <MenuButtonItalic />
      <MenuButtonUnderline />
      <MenuButtonStrikethrough />
      <MenuDivider />
      <MenuButtonAddLink />
    </MenuControlsContainer>
  );
}

export function SignatureSettings({
  signatures,
  onSave,
  onDelete,
  onSetDefault,
  loading = false,
  error,
  onClearError,
  copy,
}: SignatureSettingsProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSignature, setSelectedSignature] = useState<EmailSignature | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [signatureContent, setSignatureContent] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const extensions = useExtensions({ placeholder: '' });
  const rteRef = useRef<RichTextEditorRef>(null);

  const handleOpenEditor = useCallback((signature?: EmailSignature) => {
    if (signature) {
      setSelectedSignature(signature);
      setSignatureName(signature.name);
      setSignatureContent(signature.content);
      setIsDefault(signature.isDefault);
    } else {
      setSelectedSignature(null);
      setSignatureName('');
      setSignatureContent('');
      setIsDefault(signatures.length === 0); // First signature is default
    }
    setEditorOpen(true);
  }, [signatures.length]);

  const handleCloseEditor = useCallback(() => {
    setEditorOpen(false);
    setSelectedSignature(null);
    setSignatureName('');
    setSignatureContent('');
    setIsDefault(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!signatureName.trim()) return;

    const content = rteRef.current?.editor?.getHTML() || signatureContent;

    onSave({
      id: selectedSignature?.id,
      name: signatureName.trim(),
      content,
      isDefault,
    });

    handleCloseEditor();
  }, [signatureName, signatureContent, isDefault, selectedSignature, onSave, handleCloseEditor]);

  const handleOpenDeleteDialog = useCallback((signature: EmailSignature) => {
    setSelectedSignature(signature);
    setDeleteDialogOpen(true);
  }, []);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setSelectedSignature(null);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (selectedSignature) {
      onDelete(selectedSignature.id);
    }
    handleCloseDeleteDialog();
  }, [selectedSignature, onDelete, handleCloseDeleteDialog]);

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {copy.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {copy.description}
      </Typography>

      {error && (
        <Alert severity="error" onClose={onClearError} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <SectionCard
        title={copy.title}
        description={copy.description}
      >
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => handleOpenEditor()}
              disabled={loading}
            >
              {copy.addSignature}
            </Button>
          </Box>

          {signatures.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">{copy.noSignatures}</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {signatures.map((signature, index) => (
                <React.Fragment key={signature.id}>
                  {index > 0 && <Divider />}
                  <ListItem
                    sx={{
                      py: 2,
                      px: 0,
                      '&:hover': { bgcolor: 'action.hover' },
                      borderRadius: 1,
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle1" fontWeight={500}>
                            {signature.name}
                          </Typography>
                          {signature.isDefault && (
                            <Chip
                              size="small"
                              label={copy.defaultBadge}
                              color="primary"
                              icon={<Star size={12} />}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            mt: 0.5,
                            '& p': { m: 0 },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                          dangerouslySetInnerHTML={{
                            __html: signature.content.replace(/<[^>]*>/g, ' ').substring(0, 100) + '...',
                          }}
                        />
                      }
                    />
                    <ListItemSecondaryAction>
                      <Stack direction="row" spacing={0.5}>
                        {!signature.isDefault && (
                          <IconButton
                            size="small"
                            onClick={() => onSetDefault(signature.id)}
                            title={copy.setAsDefault}
                          >
                            <Star size={18} />
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleOpenEditor(signature)}
                        >
                          <Edit2 size={18} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDeleteDialog(signature)}
                          color="error"
                        >
                          <Trash2 size={18} />
                        </IconButton>
                      </Stack>
                    </ListItemSecondaryAction>
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          )}
        </Stack>
      </SectionCard>

      {/* Signature Editor Dialog */}
      <Dialog
        open={editorOpen}
        onClose={handleCloseEditor}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { minHeight: 500 } }}
      >
        <DialogTitle>
          {selectedSignature ? copy.editSignature : copy.addSignature}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <TextField
              fullWidth
              label={copy.signatureName}
              placeholder={copy.signatureNamePlaceholder}
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              size="small"
              autoFocus
            />

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                {copy.signatureContent}
              </Typography>
              <Box
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                <RichTextEditor
                  ref={rteRef}
                  extensions={extensions}
                  content={signatureContent}
                  immediatelyRender={false}
                  renderControls={() => <SignatureEditorControls />}
                  onUpdate={({ editor }) => setSignatureContent(editor.getHTML())}
                  RichTextFieldProps={{
                    variant: 'standard',
                    MenuBarProps: { hide: false },
                  }}
                  sx={{
                    '& .ProseMirror': {
                      minHeight: 150,
                      padding: 2,
                      outline: 'none',
                    },
                  }}
                />
              </Box>
            </Box>

            <Box>
              <Button
                variant={isDefault ? 'contained' : 'outlined'}
                size="small"
                startIcon={isDefault ? <Check size={16} /> : <Star size={16} />}
                onClick={() => setIsDefault(!isDefault)}
                color={isDefault ? 'primary' : 'inherit'}
              >
                {copy.setAsDefault}
              </Button>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditor} color="inherit">
            {copy.cancel}
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!signatureName.trim() || loading}
          >
            {copy.save}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>{copy.deleteConfirmTitle}</DialogTitle>
        <DialogContent>
          <Typography>{copy.deleteConfirmMessage}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} color="inherit">
            {copy.cancel}
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            {copy.deleteSignature}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
