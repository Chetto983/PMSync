'use client';

import { Box, IconButton, Tooltip, Typography, Chip } from '@mui/material';
import { Sparkles, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAiOverlay } from '@/stores/ai-overlay-store';
import { ContextIndicator } from './ContextIndicator';

/**
 * Header bar for the AI overlay drawer.
 * Shows: Sparkles icon + title, ContextIndicator chip, shortcut hint, close button.
 */
export function AiOverlayHeader() {
  const t = useTranslations();
  const close = useAiOverlay((s) => s.close);

  return (
    <Box
      sx={{
        px: 2,
        py: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 48,
        flexShrink: 0,
      }}
    >
      {/* Title group */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          component={Sparkles}
          sx={{ width: 20, height: 20, color: 'primary.main' }}
        />
        <Typography variant="subtitle2">{t.ai.overlay.title}</Typography>
      </Box>

      {/* Context chip */}
      <ContextIndicator />

      {/* Right group: shortcut hint + close */}
      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          size="small"
          label={t.ai.overlay.shortcutHint}
          variant="outlined"
          sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
        />
        <Tooltip title={t.ai.overlay.close}>
          <IconButton
            onClick={close}
            size="small"
            aria-label={t.ai.overlay.close}
          >
            <X size={18} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
