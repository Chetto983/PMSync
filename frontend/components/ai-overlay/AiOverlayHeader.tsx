'use client';

import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Sparkles, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAiOverlay } from '@/stores/ai-overlay-store';
import { ContextIndicator } from './ContextIndicator';

/**
 * Header bar for the AI overlay drawer.
 * Shows: compact product identity, context chip, shortcut hint, close button.
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
        alignItems: 'flex-start',
        gap: 1.5,
        minHeight: 70,
        flexShrink: 0,
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--mui-palette-background-paper) 96%, white 4%) 0%, var(--mui-palette-background-paper) 100%)',
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '11px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          backgroundColor: 'rgba(14, 165, 233, 0.08)',
          color: 'text.primary',
          border: 1,
          borderColor: 'rgba(14, 165, 233, 0.12)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        <Box component={Sparkles} sx={{ width: 16, height: 16 }} />
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            mb: 0.25,
          }}
        >
          Workspace
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em' }}
          >
            {t.ai.overlay.title}
          </Typography>
        </Box>
        <Box
          sx={{
            mt: 0.8,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'wrap',
          }}
        >
          <ContextIndicator />
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 24,
              px: 1.1,
              borderRadius: '999px',
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'text.secondary',
            }}
          >
            {t.ai.overlay.shortcutHint}
          </Box>
        </Box>
      </Box>

      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title={t.ai.overlay.close}>
          <IconButton
            onClick={close}
            size="small"
            aria-label={t.ai.overlay.close}
            sx={{
              mt: 0.25,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              color: 'text.secondary',
            }}
          >
            <X size={18} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
