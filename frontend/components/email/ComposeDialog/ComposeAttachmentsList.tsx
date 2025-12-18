import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { FileText, Trash2 } from 'lucide-react';
import type { EmailAttachmentUpload } from '@/lib/api/email';
import { formatFileSize } from '@/lib/utils/format-file-size';
import { getBase64Size } from './compose-constants';

interface ComposeAttachmentsListProps {
  attachments: EmailAttachmentUpload[];
  onRemove: (index: number) => void;
  locale: string;
  t: {
    email: {
      composer: {
        attachments: string;
      };
    };
  };
}

/**
 * Display list of attachments with remove functionality
 */
export function ComposeAttachmentsList({
  attachments,
  onRemove,
  locale,
  t,
}: ComposeAttachmentsListProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {t.email.composer.attachments.replace('{count}', String(attachments.length))}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {attachments.map((attachment, index) => (
          <Chip
            key={index}
            icon={<FileText size={14} />}
            label={`${attachment.filename} (${formatFileSize(getBase64Size(attachment.contentBase64), locale)})`}
            onDelete={() => onRemove(index)}
            deleteIcon={<Trash2 size={14} />}
            size="small"
            sx={{ maxWidth: '100%' }}
          />
        ))}
      </Box>
    </Box>
  );
}
