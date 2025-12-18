import React from 'react';
import { Box, Typography } from '@mui/material';
import { Upload } from 'lucide-react';

interface ComposeDragOverlayProps {
  isDragging: boolean;
  t: {
    email: {
      composer: {
        dropFilesHere: string;
        releaseToAttachFiles: string;
      };
    };
  };
}

/**
 * Drag overlay shown when dragging files over compose dialog
 */
export function ComposeDragOverlay({ isDragging, t }: ComposeDragOverlayProps) {
  if (!isDragging) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        bgcolor: 'rgba(25, 118, 210, 0.08)',
        border: '2px dashed',
        borderColor: 'primary.main',
        borderRadius: 1,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        pointerEvents: 'none',
      }}
    >
      <Upload size={48} color="#1976d2" />
      <Typography variant="h6" color="primary">
        {t.email.composer.dropFilesHere}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t.email.composer.releaseToAttachFiles}
      </Typography>
    </Box>
  );
}
