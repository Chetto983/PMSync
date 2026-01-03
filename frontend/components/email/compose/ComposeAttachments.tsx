import { useCallback } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useDropzone } from 'react-dropzone';
import { useTranslations } from '@/lib/hooks/use-translations';

export type Attachment = {
  file: File;
  id: string;
};

export type ComposeAttachmentsProps = {
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  maxSize?: number;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ComposeAttachments({
  attachments,
  onAttachmentsChange,
  maxSize = 25 * 1024 * 1024, // 25MB default
}: ComposeAttachmentsProps) {
  const t = useTranslations();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newAttachments = acceptedFiles.map((file) => ({
        file,
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }));
      onAttachmentsChange([...attachments, ...newAttachments]);
    },
    [attachments, onAttachmentsChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize,
    noClick: true,
    noKeyboard: true,
  });

  const handleRemove = (id: string) => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const handleAttachClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        onDrop(Array.from(files));
      }
    };
    input.click();
  };

  return (
    <Box {...getRootProps()} sx={{ position: 'relative' }}>
      <input {...getInputProps()} />

      {isDragActive && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: 'action.hover',
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <Typography color="primary">{t.email.composer.dropFilesHere}</Typography>
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <IconButton size="small" onClick={handleAttachClick}>
          <AttachFileIcon fontSize="small" />
        </IconButton>

        {attachments.length > 0 ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {attachments.map((attachment) => (
              <Chip
                key={attachment.id}
                label={`${attachment.file.name} (${formatFileSize(attachment.file.size)})`}
                size="small"
                onDelete={() => handleRemove(attachment.id)}
                sx={{ maxWidth: 200 }}
              />
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t.email.composer.attachFiles}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
