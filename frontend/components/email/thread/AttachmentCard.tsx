/**
 * Attachment Card Component - TailAdmin Style
 *
 * Card-style attachment display with:
 * - Custom file type icons (TailAdmin style)
 * - Filename
 * - Type label + Download link
 *
 * Matches TailAdmin's inbox-details attachment design.
 */

import { memo } from 'react';
import { Box, Typography, Link } from '@mui/material';
import { Download as DownloadIcon } from 'lucide-react';
import {
  PdfFileIcon,
  ImageFileIcon,
  VideoFileIcon,
  AudioFileIcon,
  ArchiveFileIcon,
  DocumentFileIcon,
  WordFileIcon,
  ExcelFileIcon,
} from '@/components/icons';
import { useTranslations } from '@/lib/hooks/use-translations';

interface AttachmentCardProps {
  attachment: {
    id: string;
    name: string;
    size: number;
    mimeType?: string;
    contentId?: string | null;
  };
  onDownload?: (attachmentId: string) => void;
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Get file type category from extension or mime type
 */
function getFileType(filename: string, mimeType?: string): 'pdf' | 'image' | 'video' | 'audio' | 'archive' | 'word' | 'excel' | 'document' {
  const ext = getFileExtension(filename);
  const mime = mimeType?.toLowerCase() || '';

  // PDF
  if (ext === 'pdf' || mime.includes('pdf')) {
    return 'pdf';
  }

  // Word documents
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || mime.includes('word') || mime.includes('document')) {
    return 'word';
  }

  // Excel/Spreadsheets
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return 'excel';
  }

  // Images (includes contact photos)
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'].includes(ext) || mime.startsWith('image/')) {
    return 'image';
  }

  // Videos
  if (['mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'm4v'].includes(ext) || mime.startsWith('video/')) {
    return 'video';
  }

  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext) || mime.startsWith('audio/')) {
    return 'audio';
  }

  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext) || mime.includes('zip') || mime.includes('archive')) {
    return 'archive';
  }

  return 'document';
}

/**
 * Get icon component and label for file type
 */
function getFileTypeConfig(type: ReturnType<typeof getFileType>) {
  switch (type) {
    case 'pdf':
      return { Icon: PdfFileIcon, label: 'PDF' };
    case 'word':
      return { Icon: WordFileIcon, label: 'Document' };
    case 'excel':
      return { Icon: ExcelFileIcon, label: 'Spreadsheet' };
    case 'image':
      return { Icon: ImageFileIcon, label: 'Image' };
    case 'video':
      return { Icon: VideoFileIcon, label: 'Media' };
    case 'audio':
      return { Icon: AudioFileIcon, label: 'Audio' };
    case 'archive':
      return { Icon: ArchiveFileIcon, label: 'Archive' };
    default:
      return { Icon: DocumentFileIcon, label: 'File' };
  }
}

export const AttachmentCard = memo(function AttachmentCard({
  attachment,
  onDownload,
}: AttachmentCardProps) {
  const t = useTranslations();
  const fileType = getFileType(attachment.name, attachment.mimeType);
  const { Icon, label } = getFileTypeConfig(fileType);

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDownload?.(attachment.id);
  };

  return (
    <Box
      onClick={onDownload ? handleDownload : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        cursor: onDownload ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        minWidth: 180,
        maxWidth: 280,
        '&:hover': onDownload ? {
          borderColor: 'primary.main',
          bgcolor: 'action.hover',
        } : {},
      }}
    >
      {/* Custom File Type Icon - TailAdmin Style */}
      <Icon sx={{ fontSize: 40, flexShrink: 0 }} />

      {/* File Info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Filename */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            fontSize: '0.875rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {attachment.name}
        </Typography>

        {/* Type + Download */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.75rem' }}
          >
            {label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            •
          </Typography>
          {onDownload ? (
            <Link
              component="button"
              variant="caption"
              onClick={handleDownload}
              sx={{
                fontSize: '0.75rem',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.25,
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              <DownloadIcon size={14} />
              {t.threadMessage?.download || 'Download'}
            </Link>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {Math.round(attachment.size / 1024)} KB
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
});

export default AttachmentCard;
