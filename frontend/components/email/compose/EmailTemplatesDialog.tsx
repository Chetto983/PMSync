/**
 * Email Templates Dialog
 *
 * Provides template management for email composition:
 * - Save current email as template
 * - Load templates into compose
 * - Delete saved templates
 *
 * Templates are stored in localStorage for simplicity.
 * @see https://react.email/templates
 */

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  Button,
  IconButton,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Alert,
  Tab,
  Tabs,
} from '@mui/material';
import { X, FileText, Trash2, Save } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

// Storage key for templates
const TEMPLATES_STORAGE_KEY = 'email-templates';

// Template interface
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

// Built-in template keys - actual content comes from translations
const BUILT_IN_TEMPLATE_KEYS = ['meetingRequest', 'followUp', 'thankYou', 'outOfOffice'] as const;
type BuiltInTemplateKey = typeof BUILT_IN_TEMPLATE_KEYS[number];

export interface EmailTemplatesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Callback when a template is selected */
  onSelect: (template: { subject: string; body: string }) => void;
  /** Current email content for saving as template */
  currentEmail?: { subject: string; body: string };
  /** Mode: load or save */
  mode?: 'load' | 'save';
}

export function EmailTemplatesDialog({
  open,
  onClose,
  onSelect,
  currentEmail,
  mode = 'load',
}: EmailTemplatesDialogProps) {
  const t = useTranslations();

  // State
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Reset state when dialog opens (called via TransitionProps.onEnter)
  const handleDialogEnter = useCallback(() => {
    // Load templates from localStorage
    try {
      const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      if (stored) {
        setTemplates(JSON.parse(stored));
      } else {
        setTemplates([]);
      }
    } catch {
      setTemplates([]);
    }
    // Reset form state
    setNewTemplateName('');
    setError(null);
    setSaveSuccess(false);
    setTabIndex(mode === 'save' ? 1 : 0);
  }, [mode]);

  // Save templates to localStorage
  const saveTemplates = useCallback((newTemplates: EmailTemplate[]) => {
    try {
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(newTemplates));
      setTemplates(newTemplates);
    } catch {
      setError(t.email?.templates?.saveError || 'Failed to save templates');
    }
  }, [t]);

  // Handle template selection
  const handleSelectTemplate = useCallback((template: { subject: string; body: string }) => {
    onSelect(template);
    onClose();
  }, [onSelect, onClose]);

  // Handle save as template
  const handleSaveAsTemplate = useCallback(() => {
    if (!newTemplateName.trim()) {
      setError(t.email?.templates?.nameRequired || 'Please enter a template name');
      return;
    }
    if (!currentEmail?.body) {
      setError(t.email?.templates?.contentRequired || 'Email body is required');
      return;
    }

    const newTemplate: EmailTemplate = {
      id: `template-${Date.now()}`,
      name: newTemplateName.trim(),
      subject: currentEmail.subject || '',
      body: currentEmail.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveTemplates([...templates, newTemplate]);
    setSaveSuccess(true);
    setNewTemplateName('');
    setTimeout(() => {
      onClose();
    }, 1500);
  }, [newTemplateName, currentEmail, templates, saveTemplates, onClose, t]);

  // Handle delete template
  const handleDeleteTemplate = useCallback((id: string) => {
    saveTemplates(templates.filter((t) => t.id !== id));
  }, [templates, saveTemplates]);

  // Get built-in templates from translations
  const builtInTemplates = BUILT_IN_TEMPLATE_KEYS.map((key) => {
    const tmpl = t.email?.templates?.builtInTemplates?.[key as BuiltInTemplateKey];
    return {
      id: `builtin-${key}`,
      name: tmpl?.name || key,
      subject: tmpl?.subject || '',
      body: tmpl?.body || '',
      createdAt: '',
      updatedAt: '',
      isBuiltIn: true,
    };
  });

  // Get all templates (built-in + user)
  const allTemplates = [
    ...builtInTemplates,
    ...templates.map((tmpl) => ({ ...tmpl, isBuiltIn: false })),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        transition: { onEnter: handleDialogEnter },
        paper: { sx: { maxHeight: '80vh' } },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: 1.5,
          px: 2,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FileText size={20} />
          <Typography variant="h6" component="span">
            {t.email?.templates?.title || 'Email Templates'}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label={t.email?.templates?.loadTab || 'Load Template'} />
          <Tab label={t.email?.templates?.saveTab || 'Save as Template'} />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 0 }}>
        {/* Error/Success alerts */}
        {error && (
          <Alert severity="error" sx={{ m: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {saveSuccess && (
          <Alert severity="success" sx={{ m: 2 }}>
            {t.email?.templates?.savedSuccessfully || 'Template saved successfully!'}
          </Alert>
        )}

        {/* Load Template Tab */}
        {tabIndex === 0 && (
          <List sx={{ py: 0 }}>
            {allTemplates.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  {t.email?.templates?.noTemplates || 'No templates available'}
                </Typography>
              </Box>
            ) : (
              allTemplates.map((template, index) => (
                <Box key={template.id}>
                  {index > 0 && <Divider />}
                  <ListItem disablePadding>
                    <ListItemButton onClick={() => handleSelectTemplate(template)}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {template.name}
                            {template.isBuiltIn && (
                              <Typography
                                variant="caption"
                                sx={{
                                  px: 0.75,
                                  py: 0.25,
                                  bgcolor: 'action.selected',
                                  borderRadius: 0.5,
                                }}
                              >
                                {t.email?.templates?.builtIn || 'Built-in'}
                              </Typography>
                            )}
                          </Box>
                        }
                        secondary={template.subject || (t.email?.templates?.noSubject || 'No subject')}
                      />
                    </ListItemButton>
                    {!template.isBuiltIn && (
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleDeleteTemplate(template.id)}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </ListItemSecondaryAction>
                    )}
                  </ListItem>
                </Box>
              ))
            )}
          </List>
        )}

        {/* Save Template Tab */}
        {tabIndex === 1 && (
          <Box sx={{ p: 2 }}>
            <TextField
              fullWidth
              label={t.email?.templates?.templateName || 'Template Name'}
              placeholder={t.email?.templates?.templateNamePlaceholder || 'e.g., Weekly Report'}
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              sx={{ mb: 2 }}
            />

            {currentEmail?.body ? (
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  {t.email?.templates?.preview || 'Preview'}
                </Typography>
                {currentEmail.subject && (
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                    {t.email?.templates?.subject || 'Subject'}: {currentEmail.subject}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  sx={{
                    maxHeight: 150,
                    overflow: 'auto',
                  }}
                  dangerouslySetInnerHTML={{ __html: currentEmail.body.slice(0, 500) + (currentEmail.body.length > 500 ? '...' : '') }}
                />
              </Box>
            ) : (
              <Alert severity="info">
                {t.email?.templates?.composeFirst || 'Compose your email first, then save it as a template.'}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Button variant="outlined" onClick={onClose}>
          {t.common?.cancel || 'Cancel'}
        </Button>
        {tabIndex === 1 && (
          <Button
            variant="contained"
            onClick={handleSaveAsTemplate}
            disabled={!newTemplateName.trim() || !currentEmail?.body}
            startIcon={<Save size={16} />}
          >
            {t.email?.templates?.saveTemplate || 'Save Template'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default EmailTemplatesDialog;
