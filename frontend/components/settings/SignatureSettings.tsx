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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
  MenuButtonEditLink,
  MenuButtonImageUpload,
  MenuButtonTextColor,
  MenuButtonHorizontalRule,
  type RichTextEditorRef,
} from 'mui-tiptap';
import { SectionCard } from './SectionCard';
import useExtensions from '@/components/email/compose/useExtensions';

export interface EmailSignature {
  id: string;
  name: string;
  content: string; // HTML content
  providerId: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailProvider {
  id: string;
  email: string;
  providerType: string;
  isDefault?: boolean;
}

export interface SignatureSettingsProps {
  signatures: EmailSignature[];
  providers: EmailProvider[];
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
    provider?: string;
    allProviders?: string;
  };
}

/**
 * Convert file to base64 data URL for embedding in signature
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function SignatureEditorControls() {
  return (
    <MenuControlsContainer>
      <MenuButtonBold />
      <MenuButtonItalic />
      <MenuButtonUnderline />
      <MenuButtonStrikethrough />
      <MenuDivider />
      <MenuButtonEditLink />
      <MenuDivider />
      <MenuButtonTextColor />
      <MenuDivider />
      <MenuButtonImageUpload
        onUploadFiles={async (files) => {
          // Convert images to base64 for persistent embedding in signature
          const results = await Promise.all(
            files.map(async (file) => ({
              src: await fileToBase64(file),
              alt: file.name,
            }))
          );
          return results;
        }}
      />
      <MenuButtonHorizontalRule />
    </MenuControlsContainer>
  );
}

export function SignatureSettings({
  signatures,
  providers,
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
  const [providerId, setProviderId] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);

  const extensions = useExtensions({ placeholder: '' });
  const rteRef = useRef<RichTextEditorRef>(null);

  // Get provider email by ID for display
  const getProviderEmail = useCallback((id: string | null) => {
    if (!id) return copy.allProviders || 'All accounts';
    const provider = providers.find((p) => p.id === id);
    return provider?.email || id;
  }, [providers, copy.allProviders]);

  const handleOpenEditor = useCallback((signature?: EmailSignature) => {
    if (signature) {
      setSelectedSignature(signature);
      setSignatureName(signature.name);
      setSignatureContent(signature.content);
      setProviderId(signature.providerId);
      setIsDefault(signature.isDefault);
    } else {
      setSelectedSignature(null);
      setSignatureName('');
      setSignatureContent('');
      // Default to first provider or null (all accounts)
      setProviderId(providers.length > 0 ? providers[0].id : null);
      setIsDefault(signatures.length === 0); // First signature is default
    }
    setEditorOpen(true);
  }, [signatures.length, providers]);

  const handleCloseEditor = useCallback(() => {
    setEditorOpen(false);
    setSelectedSignature(null);
    setSignatureName('');
    setSignatureContent('');
    setProviderId(null);
    setIsDefault(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!signatureName.trim()) return;

    const content = rteRef.current?.editor?.getHTML() || signatureContent;

    onSave({
      id: selectedSignature?.id,
      name: signatureName.trim(),
      content,
      providerId,
      isDefault,
    });

    handleCloseEditor();
  }, [signatureName, signatureContent, providerId, isDefault, selectedSignature, onSave, handleCloseEditor]);

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
                          <Chip
                            size="small"
                            label={getProviderEmail(signature.providerId)}
                            variant="outlined"
                          />
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

            {providers.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>{copy.provider || 'Account'}</InputLabel>
                <Select
                  value={providerId || ''}
                  label={copy.provider || 'Account'}
                  onChange={(e) => setProviderId(e.target.value || null)}
                >
                  <MenuItem value="">
                    <em>{copy.allProviders || 'All accounts'}</em>
                  </MenuItem>
                  {providers.map((provider) => (
                    <MenuItem key={provider.id} value={provider.id}>
                      {provider.email}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

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
