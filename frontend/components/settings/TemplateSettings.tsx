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
import { Edit2, Trash2, Plus, Star, Check, Copy } from 'lucide-react';
import {
  RichTextEditor,
  MenuButtonBold,
  MenuButtonItalic,
  MenuButtonUnderline,
  MenuButtonStrikethrough,
  MenuDivider,
  MenuControlsContainer,
  MenuButtonEditLink,
  MenuButtonTextColor,
  MenuButtonHorizontalRule,
  type RichTextEditorRef,
} from 'mui-tiptap';
import { SectionCard } from './SectionCard';
import useExtensions from '@/components/email/compose/useExtensions';
import type { EmailTemplate } from '@/lib/api/templates';

const CATEGORIES = ['sales', 'support', 'marketing', 'followUp', 'other'] as const;

export interface TemplateSettingsProps {
  templates: EmailTemplate[];
  onSave: (template: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  onDuplicate: (id: string) => void;
  loading?: boolean;
  error?: string;
  onClearError?: () => void;
  copy: {
    title: string;
    description: string;
    create: string;
    edit: string;
    delete: string;
    duplicate: string;
    templateName: string;
    templateNamePlaceholder: string;
    subject: string;
    subjectPlaceholder: string;
    category: string;
    body: string;
    setAsDefault: string;
    defaultBadge: string;
    save: string;
    cancel: string;
    deleteConfirmTitle: string;
    deleteConfirmMessage: string;
    noTemplates: string;
  };
}

function TemplateEditorControls() {
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
      <MenuButtonHorizontalRule />
    </MenuControlsContainer>
  );
}

export function TemplateSettings({
  templates,
  onSave,
  onDelete,
  onSetDefault,
  onDuplicate,
  loading = false,
  error,
  onClearError,
  copy,
}: TemplateSettingsProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateCategory, setTemplateCategory] = useState<string>('other');
  const [templateBody, setTemplateBody] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const extensions = useExtensions({ placeholder: '' });
  const rteRef = useRef<RichTextEditorRef>(null);

  const handleOpenEditor = useCallback((template?: EmailTemplate) => {
    if (template) {
      setSelectedTemplate(template);
      setTemplateName(template.name);
      setTemplateSubject(template.subject);
      setTemplateCategory(template.category || 'other');
      setTemplateBody(template.bodyHtml);
      setIsDefault(template.isDefault);
    } else {
      setSelectedTemplate(null);
      setTemplateName('');
      setTemplateSubject('');
      setTemplateCategory('other');
      setTemplateBody('');
      setIsDefault(templates.length === 0);
    }
    setEditorOpen(true);
  }, [templates.length]);

  const handleCloseEditor = useCallback(() => {
    setEditorOpen(false);
    setSelectedTemplate(null);
    setTemplateName('');
    setTemplateSubject('');
    setTemplateCategory('other');
    setTemplateBody('');
    setIsDefault(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!templateName.trim()) return;

    const bodyHtml = rteRef.current?.editor?.getHTML() || templateBody;

    onSave({
      id: selectedTemplate?.id,
      name: templateName.trim(),
      subject: templateSubject.trim(),
      bodyHtml,
      category: templateCategory,
      isDefault,
    });

    handleCloseEditor();
  }, [templateName, templateSubject, templateCategory, templateBody, isDefault, selectedTemplate, onSave, handleCloseEditor]);

  const handleOpenDeleteDialog = useCallback((template: EmailTemplate) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
  }, []);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setSelectedTemplate(null);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (selectedTemplate) {
      onDelete(selectedTemplate.id);
    }
    handleCloseDeleteDialog();
  }, [selectedTemplate, onDelete, handleCloseDeleteDialog]);

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

      <SectionCard title={copy.title} description={copy.description}>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => handleOpenEditor()}
              disabled={loading}
            >
              {copy.create}
            </Button>
          </Box>

          {templates.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">{copy.noTemplates}</Typography>
            </Box>
          ) : (
            <List disablePadding>
              {templates.map((template, index) => (
                <React.Fragment key={template.id}>
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
                            {template.name}
                          </Typography>
                          {template.isDefault && (
                            <Chip
                              size="small"
                              label={copy.defaultBadge}
                              color="primary"
                              icon={<Star size={12} />}
                            />
                          )}
                          {template.category && (
                            <Chip
                              size="small"
                              label={template.category}
                              variant="outlined"
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
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {template.subject}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Stack direction="row" spacing={0.5}>
                        {!template.isDefault && (
                          <IconButton
                            size="small"
                            onClick={() => onSetDefault(template.id)}
                            title={copy.setAsDefault}
                          >
                            <Star size={18} />
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => onDuplicate(template.id)}
                          title={copy.duplicate}
                        >
                          <Copy size={18} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenEditor(template)}
                        >
                          <Edit2 size={18} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDeleteDialog(template)}
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

      {/* Template Editor Dialog */}
      <Dialog
        open={editorOpen}
        onClose={handleCloseEditor}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { minHeight: 500 } }}
      >
        <DialogTitle>
          {selectedTemplate ? copy.edit : copy.create}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <TextField
              fullWidth
              label={copy.templateName}
              placeholder={copy.templateNamePlaceholder}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              size="small"
              autoFocus
            />

            <TextField
              fullWidth
              label={copy.subject}
              placeholder={copy.subjectPlaceholder}
              value={templateSubject}
              onChange={(e) => setTemplateSubject(e.target.value)}
              size="small"
            />

            <FormControl fullWidth size="small">
              <InputLabel>{copy.category}</InputLabel>
              <Select
                value={templateCategory}
                label={copy.category}
                onChange={(e) => setTemplateCategory(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                {copy.body}
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
                  content={templateBody}
                  immediatelyRender={false}
                  renderControls={() => <TemplateEditorControls />}
                  onUpdate={({ editor }) => setTemplateBody(editor.getHTML())}
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
            disabled={!templateName.trim() || loading}
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
            {copy.delete}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
