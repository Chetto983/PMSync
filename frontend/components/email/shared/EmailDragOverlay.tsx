import React from 'react';
import { DragOverlay } from '@dnd-kit/core';
import { Box, Paper, Typography, Avatar, Chip, Stack } from '@mui/material';
import { Mail, GripVertical } from 'lucide-react';
import type { Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Props for EmailDragOverlay component
 */
export interface EmailDragOverlayProps {
  /**
   * The email(s) being dragged
   */
  activeEmail: Email | Conversation | null;

  /**
   * Number of emails being dragged (for bulk drag)
   */
  dragCount?: number;
}

/**
 * Visual preview shown while dragging emails
 *
 * Features:
 * - Clean, Gmail-like design with subtle shadow
 * - Shows email count badge for bulk drags
 * - Animated entrance with scale and opacity
 * - Semi-transparent to show drop targets underneath
 */
export const EmailDragOverlay: React.FC<EmailDragOverlayProps> = ({
  activeEmail,
  dragCount = 1,
}) => {
  const t = useTranslations();

  if (!activeEmail) {
    return <DragOverlay dropAnimation={null} />;
  }

  // Parse sender name from email "from" field
  const senderName = (() => {
    const from = activeEmail.from || '';
    // Extract name from "Name <email@domain.com>" format
    const match = from.match(/^([^<]+)</);
    if (match) return match[1].trim();
    // Or just use the email part before @
    return from.split('@')[0] || t.email.view.memoryUnknownSender;
  })();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <DragOverlay
      dropAnimation={{
        duration: 200,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: 1.5,
          pr: 2,
          minWidth: 280,
          maxWidth: 360,
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'primary.main',
          opacity: 0.95,
          cursor: 'grabbing',
          transform: 'rotate(-2deg)',
          transition: 'transform 0.1s ease',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        {/* Drag handle indicator */}
        <Box
          sx={{
            color: 'text.disabled',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <GripVertical size={16} />
        </Box>

        {/* Avatar */}
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: 'primary.main',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {getInitials(senderName)}
        </Avatar>

        {/* Email preview */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {senderName}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {activeEmail.subject || t.common.noSubject}
          </Typography>
        </Box>

        {/* Count badge for bulk drags */}
        {dragCount > 1 && (
          <Chip
            label={dragCount}
            size="small"
            color="primary"
            sx={{
              fontWeight: 700,
              minWidth: 28,
              height: 24,
            }}
          />
        )}
      </Paper>
    </DragOverlay>
  );
};

/**
 * Compact drag overlay for list view
 */
export const EmailDragOverlayCompact: React.FC<EmailDragOverlayProps> = ({
  activeEmail,
  dragCount = 1,
}) => {
  const t = useTranslations();

  if (!activeEmail) {
    return <DragOverlay dropAnimation={null} />;
  }

  return (
    <DragOverlay
      dropAnimation={{
        duration: 150,
        easing: 'ease-out',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{
          p: 1,
          px: 1.5,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          boxShadow: 4,
          cursor: 'grabbing',
        }}
      >
        <Mail size={16} />
        <Typography variant="body2" fontWeight={600}>
          {dragCount === 1
            ? t.email.view.dragMoveSingle
            : t.email.view.dragMoveMultiple.replace('{count}', String(dragCount))}
        </Typography>
      </Stack>
    </DragOverlay>
  );
};

export default EmailDragOverlay;
