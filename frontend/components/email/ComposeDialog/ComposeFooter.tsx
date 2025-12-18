import React from 'react';
import { Box, Button, IconButton, CircularProgress, DialogActions } from '@mui/material';
import { Send, Paperclip } from 'lucide-react';

interface ComposeFooterProps {
  sending: boolean;
  uploading: boolean;
  canSend: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDiscard: () => void;
  onSend: () => void;
  t: {
    email: {
      composer: {
        attachFiles: string;
        discard: string;
        send: string;
        sending: string;
      };
    };
  };
}

/**
 * Compose dialog footer with send/discard buttons and attachment input
 */
export function ComposeFooter({
  sending,
  uploading,
  canSend,
  fileInputRef,
  onFileSelect,
  onDiscard,
  onSend,
  t,
}: ComposeFooterProps) {
  return (
    <DialogActions sx={{ px: 2, py: 1.5, flexWrap: 'wrap' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          justifyContent: { xs: 'flex-end', sm: 'flex-start' },
        }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={onFileSelect}
          style={{ display: 'none' }}
          accept="*/*"
          aria-label={t.email.composer.attachFiles}
        />

        {/* Attach files button */}
        <IconButton
          size="small"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || uploading}
          title={t.email.composer.attachFiles}
          sx={{
            width: { xs: 44, sm: 'auto' },
            height: { xs: 44, sm: 'auto' },
          }}
        >
          {uploading ? <CircularProgress size={18} /> : <Paperclip size={18} />}
        </IconButton>

        <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />

        <Button onClick={onDiscard} disabled={sending}>
          {t.email.composer.discard}
        </Button>

        <Button
          variant="contained"
          startIcon={sending ? <CircularProgress size={16} /> : <Send size={16} />}
          onClick={onSend}
          disabled={sending || !canSend}
          data-testid="compose-send-button"
        >
          {sending ? t.email.composer.sending : t.email.composer.send}
        </Button>
      </Box>
    </DialogActions>
  );
}
