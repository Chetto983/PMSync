'use client';

/**
 * AskUserModal - Claude Code-style clarifying questions modal
 *
 * Shows a dialog when the LLM needs user input to proceed.
 * Supports single-select (radio) and multi-select (checkbox) options.
 * Always includes "Other" option for custom text input.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/user-input
 */

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  RadioGroup,
  Radio,
  FormControlLabel,
  Checkbox,
  TextField,
  Box,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { HelpCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface AskUserOption {
  label: string;
  description?: string;
}

export interface AskUserData {
  question: string;
  header: string;
  options: AskUserOption[];
  multiSelect?: boolean;
}

interface AskUserModalProps {
  open: boolean;
  data: AskUserData | null;
  onSubmit: (answer: string | string[]) => void;
  onClose: () => void;
}

export function AskUserModal({ open, data, onSubmit, onClose }: AskUserModalProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [selected, setSelected] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  // Reset state when modal opens with new data
  React.useEffect(() => {
    if (open && data) {
      setSelected([]);
      setCustomText('');
      setUseCustom(false);
    }
  }, [open, data]);

  const handleSubmit = useCallback(() => {
    if (useCustom && customText.trim()) {
      onSubmit(customText.trim());
    } else if (data?.multiSelect) {
      onSubmit(selected);
    } else {
      onSubmit(selected[0] || '');
    }
  }, [useCustom, customText, data?.multiSelect, selected, onSubmit]);

  const handleRadioChange = useCallback((value: string) => {
    if (value === '__custom') {
      setUseCustom(true);
      setSelected([]);
    } else {
      setUseCustom(false);
      setSelected([value]);
    }
  }, []);

  const handleCheckboxChange = useCallback((label: string, checked: boolean) => {
    setUseCustom(false);
    setSelected(prev =>
      checked ? [...prev, label] : prev.filter(l => l !== label)
    );
  }, []);

  if (!data) return null;

  const { question, header, options, multiSelect } = data;
  const canSubmit = useCustom ? customText.trim().length > 0 : selected.length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: 'background.paper',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          pb: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
          }}
        >
          <HelpCircle size={18} />
        </Box>
        <Typography variant="h6" fontWeight={600}>
          {header}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5 }}>
        <Typography sx={{ mb: 2.5, color: 'text.primary' }}>
          {question}
        </Typography>

        <FormControl component="fieldset" fullWidth>
          {multiSelect ? (
            // Multi-select: Checkboxes
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {options.map((opt) => (
                <FormControlLabel
                  key={opt.label}
                  control={
                    <Checkbox
                      checked={selected.includes(opt.label)}
                      onChange={(e) => handleCheckboxChange(opt.label, e.target.checked)}
                      sx={{ py: 0.5 }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {opt.label}
                      </Typography>
                      {opt.description && (
                        <Typography variant="caption" color="text.secondary">
                          {opt.description}
                        </Typography>
                      )}
                    </Box>
                  }
                  sx={{
                    alignItems: 'flex-start',
                    mx: 0,
                    p: 1,
                    borderRadius: 2,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                />
              ))}
            </Box>
          ) : (
            // Single-select: Radio buttons
            <RadioGroup
              value={useCustom ? '__custom' : selected[0] || ''}
              onChange={(e) => handleRadioChange(e.target.value)}
            >
              {options.map((opt) => (
                <FormControlLabel
                  key={opt.label}
                  value={opt.label}
                  control={<Radio sx={{ py: 0.5 }} />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {opt.label}
                      </Typography>
                      {opt.description && (
                        <Typography variant="caption" color="text.secondary">
                          {opt.description}
                        </Typography>
                      )}
                    </Box>
                  }
                  sx={{
                    alignItems: 'flex-start',
                    mx: 0,
                    p: 1,
                    borderRadius: 2,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                />
              ))}
              {/* Other option */}
              <FormControlLabel
                value="__custom"
                control={<Radio sx={{ py: 0.5 }} />}
                label={
                  <Typography variant="body2" fontWeight={500}>
                    {t.ai?.askUser?.other || 'Other (type your answer)'}
                  </Typography>
                }
                sx={{
                  alignItems: 'flex-start',
                  mx: 0,
                  p: 1,
                  borderRadius: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              />
            </RadioGroup>
          )}
        </FormControl>

        {/* Custom text input */}
        {useCustom && (
          <TextField
            fullWidth
            autoFocus
            multiline
            minRows={2}
            placeholder={t.ai?.askUser?.placeholder || 'Type your answer...'}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            sx={{ mt: 2 }}
          />
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={onClose} color="inherit">
          {t.ai?.askUser?.cancel || 'Cancel'}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {t.ai?.askUser?.continue || 'Continue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AskUserModal;
