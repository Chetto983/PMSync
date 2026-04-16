'use client';

import { useCallback } from 'react';
import { Box, alpha } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';

interface ResizeHandleProps {
  currentWidth: number;
  onResize: (width: number) => void;
}

/**
 * Left-edge drag handle for the AI overlay drawer.
 * Uses pointer capture for reliable cross-browser resize.
 * Supports keyboard arrow keys for accessibility.
 */
export function ResizeHandle({ currentWidth, onResize }: ResizeHandleProps) {
  const t = useTranslations();

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const startX = e.clientX;
      const startWidth = currentWidth;

      el.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        // Moving mouse LEFT increases width (drawer is right-anchored)
        const delta = startX - ev.clientX;
        onResize(startWidth + delta);
      };

      const onUp = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
      };

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
    },
    [currentWidth, onResize],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onResize(currentWidth + 20);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onResize(currentWidth - 20);
      }
    },
    [currentWidth, onResize],
  );

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label={t.ai.overlay.resizeHandle}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      sx={{
        width: 8,
        cursor: 'col-resize',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 150ms',
        '&:hover, &:active': {
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
        },
        '&:focus-visible': {
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.15),
          outline: (theme) => `2px solid ${theme.palette.primary.main}`,
          outlineOffset: -2,
        },
      }}
    >
      {/* Subtle vertical grip indicator */}
      <Box
        sx={{
          width: 2,
          height: 24,
          borderRadius: 1,
          bgcolor: 'divider',
        }}
      />
    </Box>
  );
}
