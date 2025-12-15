import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import type { AppTranslations } from '@/locales';

/**
 * AI Compose Dialog used inside ComposeDialog
 * Enhanced with example prompts, preview, and two-step flow
 */
export function AiComposeDialog({
  open,
  onClose,
  onSubmit,
  onGenerate,
  prompt,
  setPrompt,
  tone,
  setTone,
  variant,
  setVariant,
  loading,
  mode,
  preview,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onGenerate: () => void;
  prompt: string;
  setPrompt: (v: string) => void;
  tone: string;
  setTone: (v: 'formal' | 'casual' | 'technical' | '') => void;
  variant: 'A' | 'B';
  setVariant: (v: 'A' | 'B') => void;
  loading: boolean;
  mode: 'compose' | 'reply' | 'forward';
  preview: string | null;
  t: AppTranslations;
}) {
  const examplePrompts = useMemo(() => {
    const composer = t.email?.composer;
    if (mode === 'reply') {
      return [
        composer?.aiComposeExampleReplyConfirm ?? 'Confirm receipt and schedule call',
        composer?.aiComposeExampleReplyDecline ?? 'Politely decline with alternative',
        composer?.aiComposeExampleReplyInfo ?? 'Request more information',
      ];
    }
    return [
      composer?.aiComposeExampleFollowUp ?? 'Write a follow-up about our meeting',
      composer?.aiComposeExampleThankYou ?? 'Thank you note for their help',
      composer?.aiComposeExampleRequest ?? 'Request information about...',
    ];
  }, [mode, t]);

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t.email?.composer?.aiComposeTitle ?? 'Draft with AI'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {t.email?.composer?.aiComposeHelp ??
            'Provide a short prompt. AI will draft the email body and suggest a subject.'}
        </Typography>

        {!preview && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              {t.email?.composer?.aiComposeExamples ?? 'Try these:'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {examplePrompts.map((example, i) => (
                <Chip
                  key={i}
                  label={example}
                  size="small"
                  variant="outlined"
                  onClick={() => setPrompt(example)}
                  disabled={loading}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        <TextField
          label={t.email?.composer?.aiComposePrompt ?? 'Prompt'}
          multiline
          minRows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          fullWidth
          disabled={loading}
          placeholder={
            mode === 'reply'
              ? 'e.g., Reply confirming the meeting and suggest Tuesday at 3pm'
              : 'e.g., Introduce our new product features to the marketing team'
          }
        />
        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
          <FormControl fullWidth size="small">
            <InputLabel id="ai-tone-label">{t.email?.composer?.aiComposeToneLabel ?? 'Tone'}</InputLabel>
            <Select
              labelId="ai-tone-label"
              label={t.email?.composer?.aiComposeToneLabel ?? 'Tone'}
              value={tone || ''}
              onChange={(e) => setTone(e.target.value as 'formal' | 'casual' | 'technical' | '')}
              disabled={loading}
            >
              <MenuItem value="">
                <em>Auto</em>
              </MenuItem>
              <MenuItem value="formal">Formal</MenuItem>
              <MenuItem value="casual">Casual</MenuItem>
              <MenuItem value="technical">Technical</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel id="ai-variant-label">
              {t.email?.composer?.aiComposeVariantLabel ?? 'Variant'}
            </InputLabel>
            <Select
              labelId="ai-variant-label"
              label={t.email?.composer?.aiComposeVariantLabel ?? 'Variant'}
              value={variant}
              onChange={(e) => setVariant(e.target.value as 'A' | 'B')}
              disabled={loading}
            >
              <MenuItem value="A">A</MenuItem>
              <MenuItem value="B">B</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {preview && (
          <Box
            sx={{
              mt: 1,
              p: 2,
              bgcolor: 'action.hover',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontWeight: 500 }}>
              {t.email?.composer?.aiComposePreview ?? 'Preview'}:
            </Typography>
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-wrap',
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {preview}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          {t.email?.composer?.aiComposeCancel ?? 'Cancel'}
        </Button>
        {!preview ? (
          <Button
            variant="outlined"
            onClick={onGenerate}
            disabled={loading || !prompt.trim()}
            startIcon={loading ? <CircularProgress size={16} /> : undefined}
          >
            {loading ? t.email?.composer?.sending ?? 'Generating...' : t.email?.composer?.aiComposeGenerate ?? 'Generate'}
          </Button>
        ) : (
          <>
            <Button
              variant="outlined"
              onClick={onGenerate}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : undefined}
            >
              {t.email?.composer?.aiComposeRegenerate ?? 'Regenerate'}
            </Button>
            <Button variant="contained" onClick={onSubmit} disabled={loading}>
              {t.email?.composer?.aiComposeConfirm ?? 'Insert draft'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

