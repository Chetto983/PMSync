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
        py: 1.75,
        borderBottom: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        minHeight: 72,
        flexShrink: 0,
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--mui-palette-background-paper) 90%, var(--mui-palette-primary-light) 10%) 0%, var(--mui-palette-background-paper) 100%)',
      }}
    >
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: '12px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          backgroundColor: 'rgba(14, 165, 233, 0.10)',
          color: 'primary.main',
          border: 1,
          borderColor: 'rgba(14, 165, 233, 0.18)',
          boxShadow: '0 10px 24px rgba(14, 165, 233, 0.12)',
        }}
      >
        <Box component={Sparkles} sx={{ width: 18, height: 18 }} />
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {t.ai.overlay.title}
          </Typography>
          <Chip
            size="small"
            label="Beta"
            sx={{
              height: 22,
              borderRadius: '999px',
              backgroundColor: 'rgba(14, 165, 233, 0.10)',
              color: 'primary.main',
              fontSize: '0.68rem',
              fontWeight: 700,
            }}
          />
        </Box>
        <Box
          sx={{
            mt: 0.9,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'wrap',
          }}
        >
          <ContextIndicator />
          <Chip
            size="small"
            label={t.ai.overlay.shortcutHint}
            variant="outlined"
            sx={{
              height: 24,
              fontSize: '0.72rem',
              fontWeight: 600,
              bgcolor: 'background.paper',
            }}
          />
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
            }}
          >
            <X size={18} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
