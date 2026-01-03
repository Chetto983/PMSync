import { useState, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslations } from '@/lib/hooks/use-translations';
import { aiApi } from '@/lib/api/ai';

export type AIComposeDialogProps = {
  open: boolean;
  onClose: () => void;
  onInsert: (body: string, subject?: string) => void;
  isReply?: boolean;
  existingSubject?: string;
  recipientEmails?: string[];
};

type ToneOption = 'auto' | 'formal' | 'casual' | 'friendly' | 'professional';

const TONE_OPTIONS: ToneOption[] = ['auto', 'formal', 'casual', 'friendly', 'professional'];

export default function AIComposeDialog({
  open,
  onClose,
  onInsert,
  isReply = false,
  existingSubject,
  recipientEmails = [],
}: AIComposeDialogProps) {
  const t = useTranslations();
  const composer = t.email.composer;

  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState<ToneOption>('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ body: string; subject?: string } | null>(null);

  const examplePrompts = isReply
    ? [
        composer.aiComposeExampleReplyConfirm,
        composer.aiComposeExampleReplyDecline,
        composer.aiComposeExampleReplyInfo,
      ]
    : [
        composer.aiComposeExampleFollowUp,
        composer.aiComposeExampleThankYou,
        composer.aiComposeExampleRequest,
      ];

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError(composer.aiComposePrompt);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await aiApi.composeEmail({
        prompt: prompt.trim(),
        to: recipientEmails,
        subject: existingSubject,
        tone: tone === 'auto' ? undefined : tone,
        locale: t.locale,
      });

      if (response.data.success && response.data.body) {
        setPreview({
          body: response.data.body,
          subject: response.data.subject,
        });
      } else {
        setError(composer.aiComposeError);
      }
    } catch (err) {
      console.error('AI compose error:', err);
      setError(composer.aiComposeError);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, tone, recipientEmails, existingSubject, t.locale, composer]);

  const handleRegenerate = useCallback(() => {
    setPreview(null);
    handleGenerate();
  }, [handleGenerate]);

  const handleClose = useCallback(() => {
    setPrompt('');
    setTone('auto');
    setPreview(null);
    setError(null);
    onClose();
  }, [onClose]);

  const handleInsert = useCallback(() => {
    if (preview) {
      onInsert(preview.body, preview.subject);
      handleClose();
    }
  }, [preview, onInsert, handleClose]);

  const handleExampleClick = (example: string) => {
    setPrompt(example);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { minHeight: 400 },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon color="primary" />
        {composer.aiComposeTitle}
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }}>
        {!preview ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {composer.aiComposeHelp}
            </Typography>

            <TextField
              autoFocus
              multiline
              rows={3}
              fullWidth
              label={composer.aiComposePrompt}
              placeholder={isReply ? composer.aiComposePlaceholderReply : composer.aiComposePlaceholderCompose}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
              slotProps={{
                inputLabel: { shrink: true },
              }}
            />

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>{composer.aiComposeToneLabel}</InputLabel>
              <Select
                value={tone}
                label={composer.aiComposeToneLabel}
                onChange={(e) => setTone(e.target.value as ToneOption)}
                disabled={isLoading}
              >
                {TONE_OPTIONS.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t === 'auto' ? composer.aiComposeToneAuto : t.charAt(0).toUpperCase() + t.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                {composer.aiComposeExamples}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {examplePrompts.map((example, i) => (
                  <Chip
                    key={i}
                    label={example}
                    size="small"
                    onClick={() => handleExampleClick(example)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Box>

            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {composer.aiComposePreview}
            </Typography>

            {preview.subject && !isReply && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t.email.composer.subject}:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {preview.subject}
                </Typography>
              </Box>
            )}

            <Box
              sx={{
                p: 2,
                bgcolor: 'action.hover',
                borderRadius: 1,
                maxHeight: 250,
                overflow: 'auto',
              }}
            >
              <Typography
                variant="body2"
                sx={{ whiteSpace: 'pre-wrap' }}
                dangerouslySetInnerHTML={{ __html: preview.body }}
              />
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={isLoading}>
          {composer.aiComposeCancel}
        </Button>

        {!preview ? (
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            startIcon={isLoading ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
          >
            {composer.aiComposeGenerate}
          </Button>
        ) : (
          <>
            <Button
              variant="outlined"
              onClick={handleRegenerate}
              disabled={isLoading}
              startIcon={isLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
            >
              {composer.aiComposeRegenerate}
            </Button>
            <Button variant="contained" onClick={handleInsert}>
              {composer.aiComposeConfirm}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
