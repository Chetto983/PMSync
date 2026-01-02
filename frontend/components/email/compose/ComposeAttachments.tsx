/**
 * Compose Attachments Component
 *
 * File upload with drag-and-drop support using react-dropzone.
 * Displays attachment list with remove capability.
 *
 * @see https://react-dropzone.js.org/
 */

import { useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  alpha,
} from '@mui/material';
import { Paperclip, X, Upload, FileIcon } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useTranslations } from '@/lib/hooks/use-translations';

interface AttachmentFile {
  id: string;
  file: File;
  name: string;
  size: number;
  uploading?: boolean;
  progress?: number;
  error?: string;
}

interface ComposeAttachmentsProps {
  attachments: AttachmentFile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  maxFileSize?: number; // in bytes, default 10MB
  maxTotalSize?: number; // in bytes, default 25MB
  readOnly?: boolean;
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ComposeAttachments({
  attachments,
  onAdd,
  onRemove,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
  readOnly = false,
}: ComposeAttachmentsProps) {
  const t = useTranslations();

  const totalSize = attachments.reduce((sum, att) => sum + att.size, 0);

  // Handle file drop/selection with validation
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const validFiles: File[] = [];
      let newTotalSize = totalSize;

      for (const file of acceptedFiles) {
        // Check individual file size
        if (file.size > maxFileSize) {
          continue;
        }

        // Check total size limit
        if (newTotalSize + file.size > maxTotalSize) {
          break;
        }

        validFiles.push(file);
        newTotalSize += file.size;
      }

      if (validFiles.length > 0) {
        onAdd(validFiles);
      }
    },
    [totalSize, maxFileSize, maxTotalSize, onAdd]
  );

  // Configure dropzone
  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open,
  } = useDropzone({
    onDrop,
    multiple: true,
    disabled: readOnly,
    // Don't open file dialog on click - we use the button
    noClick: true,
    // Don't trigger on keyboard events
    noKeyboard: true,
    // File size validation (per-file)
    maxSize: maxFileSize,
  });

  // Memoize dropzone root props for stable reference
  const rootProps = useMemo(() => getRootProps(), [getRootProps]);
  const inputProps = useMemo(() => getInputProps(), [getInputProps]);

  if (readOnly && attachments.length === 0) {
    return null;
  }

  return (
    <Box
      {...rootProps}
      sx={{ px: 2, py: 0.5 }}
    >
      {/* Hidden file input managed by react-dropzone */}
      <Box component="input" {...inputProps} sx={{ display: 'none' }} />

      {/* Drop zone overlay - only visible when dragging */}
      {isDragActive && !readOnly && (
        <Box
          sx={{
            border: 2,
            borderStyle: 'dashed',
            borderColor: 'primary.main',
            borderRadius: 1,
            p: 1.5,
            textAlign: 'center',
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
            mb: 1,
          }}
        >
          <Upload size={20} />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {t.email?.composer?.releaseToAttachFiles || 'Release to attach files'}
          </Typography>
        </Box>
      )}

      {/* Compact inline: attach button + attachment chips */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        {/* Attach button - uses dropzone open() function */}
        {!readOnly && (
          <Button
            type="button"
            onClick={open}
            size="small"
            startIcon={<Paperclip size={14} />}
            sx={{
              textTransform: 'none',
              minWidth: 'auto',
              py: 0.25,
              px: 1,
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            {t.email?.composer?.attachFiles || 'Attach'}
          </Button>
        )}

        {/* Attachment chips inline */}
        {attachments.map((att) => (
          <Chip
            key={att.id}
            icon={<FileIcon size={12} />}
            label={`${att.name} (${formatFileSize(att.size)})`}
            onDelete={readOnly ? undefined : () => onRemove(att.id)}
            deleteIcon={<X size={12} />}
            size="small"
            sx={{
              maxWidth: 180,
              height: 24,
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: '0.7rem',
                px: 0.5,
              },
              '& .MuiChip-icon': {
                ml: 0.5,
              },
            }}
          />
        ))}

        {/* Size indicator - inline */}
        {attachments.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {formatFileSize(totalSize)} / {formatFileSize(maxTotalSize)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default ComposeAttachments;
