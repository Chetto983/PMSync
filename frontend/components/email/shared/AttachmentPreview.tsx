import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Chip,
  CircularProgress,
  alpha,
} from '@mui/material';
import {
  Download,
  X,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  File,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { emailApi } from '@/lib/api/email';

/**
 * Attachment interface
 */
export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  isInline?: boolean;
  contentId?: string;
}

/**
 * Props for AttachmentPreview component
 */
export interface AttachmentPreviewProps {
  /**
   * List of attachments to display
   */
  attachments: Attachment[];

  /**
   * Variant: inline (in email body) or panel (separate section)
   * @default 'panel'
   */
  variant?: 'inline' | 'panel';

  /**
   * Whether to show thumbnails for images
   * @default true
   */
  showThumbnails?: boolean;

  /**
   * Maximum height for the panel
   */
  maxHeight?: number | string;
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Get file category from content type
 */
function getFileCategory(contentType: string): 'image' | 'video' | 'audio' | 'document' | 'spreadsheet' | 'code' | 'archive' | 'other' {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.includes('pdf') || contentType.includes('document') || contentType.includes('msword')) return 'document';
  if (contentType.includes('spreadsheet') || contentType.includes('excel') || contentType.includes('csv')) return 'spreadsheet';
  if (contentType.includes('javascript') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('html')) return 'code';
  if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('rar') || contentType.includes('7z')) return 'archive';
  return 'other';
}

/**
 * Get icon for file type
 */
function getFileIcon(contentType: string, size = 24): React.ReactElement {
  const category = getFileCategory(contentType);
  switch (category) {
    case 'image': return <ImageIcon size={size} />;
    case 'video': return <Video size={size} />;
    case 'audio': return <Music size={size} />;
    case 'document': return <FileText size={size} />;
    case 'spreadsheet': return <FileSpreadsheet size={size} />;
    case 'code': return <FileCode size={size} />;
    case 'archive': return <FileArchive size={size} />;
    default: return <File size={size} />;
  }
}

/**
 * Get category color
 */
function getCategoryColor(contentType: string): string {
  const category = getFileCategory(contentType);
  switch (category) {
    case 'image': return '#4CAF50';
    case 'video': return '#9C27B0';
    case 'audio': return '#FF9800';
    case 'document': return '#2196F3';
    case 'spreadsheet': return '#4CAF50';
    case 'code': return '#607D8B';
    case 'archive': return '#795548';
    default: return '#9E9E9E';
  }
}

/**
 * Individual attachment item
 */
interface AttachmentItemProps {
  attachment: Attachment;
  onPreview: () => void;
  onDownload: () => void;
  compact?: boolean;
}

const AttachmentItem: React.FC<AttachmentItemProps> = ({
  attachment,
  onPreview,
  onDownload,
  compact = false,
}) => {
  const isPreviewable = getFileCategory(attachment.contentType) === 'image';
  const categoryColor = getCategoryColor(attachment.contentType);

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: compact ? 1 : 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        cursor: isPreviewable ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: isPreviewable ? 'primary.main' : 'divider',
          bgcolor: 'action.hover',
        },
      }}
      onClick={isPreviewable ? onPreview : undefined}
    >
      {/* Icon */}
      <Box
        sx={{
          width: compact ? 32 : 40,
          height: compact ? 32 : 40,
          borderRadius: 1,
          bgcolor: alpha(categoryColor, 0.1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {getFileIcon(attachment.contentType, compact ? 18 : 22)}
      </Box>

      {/* Info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant={compact ? 'body2' : 'body1'}
          sx={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {attachment.filename}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatFileSize(attachment.size)}
        </Typography>
      </Box>

      {/* Actions */}
      <Stack direction="row" spacing={0.5}>
        {isPreviewable && (
          <Tooltip title="Preview">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onPreview(); }}>
              <ExternalLink size={16} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Download">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <Download size={16} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
};

/**
 * Image preview dialog
 */
interface ImagePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  attachment: Attachment | null;
  imageUrl: string | null;
  isLoading: boolean;
}

const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({
  open,
  onClose,
  attachment,
  imageUrl,
  isLoading,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  // Reset on close
  const handleClose = () => {
    setZoom(1);
    setRotation(0);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.default',
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {attachment?.filename}
        </Typography>

        {/* Zoom controls */}
        <Tooltip title="Zoom out">
          <IconButton size="small" onClick={handleZoomOut} disabled={zoom <= 0.5}>
            <ZoomOut size={18} />
          </IconButton>
        </Tooltip>
        <Chip label={`${Math.round(zoom * 100)}%`} size="small" sx={{ minWidth: 60 }} />
        <Tooltip title="Zoom in">
          <IconButton size="small" onClick={handleZoomIn} disabled={zoom >= 3}>
            <ZoomIn size={18} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Rotate">
          <IconButton size="small" onClick={handleRotate}>
            <RotateCw size={18} />
          </IconButton>
        </Tooltip>

        <IconButton onClick={handleClose} size="small">
          <X size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          p: 2,
          minHeight: 400,
        }}
      >
        {isLoading ? (
          <CircularProgress />
        ) : imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt={attachment?.filename || 'Preview'}
            sx={{
              maxWidth: '100%',
              maxHeight: '70vh',
              objectFit: 'contain',
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease',
            }}
          />
        ) : (
          <Typography color="text.secondary">Failed to load preview</Typography>
        )}
      </DialogContent>
    </Dialog>
  );
};

/**
 * AttachmentPreview - Component for displaying and previewing email attachments
 *
 * Features:
 * - Grid or list view of attachments
 * - File type icons with category colors
 * - Image preview in modal with zoom/rotate
 * - Download functionality
 * - File size display
 *
 * @example
 * ```tsx
 * <AttachmentPreview
 *   attachments={email.attachments}
 *   variant="panel"
 *   showThumbnails
 * />
 * ```
 */
export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachments,
  variant = 'panel',
  // showThumbnails reserved for future PDF thumbnail support
  showThumbnails: _showThumbnails = true,
  maxHeight,
}) => {
  const t = useTranslations();
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Filter out inline attachments (CID images embedded in HTML)
  const displayAttachments = useMemo(
    () => attachments.filter((a) => !a.isInline),
    [attachments]
  );

  // Load image for preview
  const handlePreview = useCallback(async (attachment: Attachment) => {
    setPreviewAttachment(attachment);
    setIsLoadingPreview(true);
    setPreviewUrl(null);

    try {
      const response = await emailApi.downloadAttachment(attachment.id);
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (error) {
      console.error('Failed to load preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  // Download attachment
  const handleDownload = useCallback(async (attachment: Attachment) => {
    try {
      const response = await emailApi.downloadAttachment(attachment.id);
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download attachment:', error);
    }
  }, []);

  // Close preview and cleanup
  const handleClosePreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewAttachment(null);
    setPreviewUrl(null);
  }, [previewUrl]);

  if (displayAttachments.length === 0) {
    return null;
  }

  return (
    <>
      <Box
        sx={{
          maxHeight: maxHeight,
          overflow: maxHeight ? 'auto' : undefined,
        }}
      >
        {variant === 'panel' ? (
          <Paper
            elevation={0}
            sx={{
              p: 2,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {t.dashboard?.email?.attachment || 'Attachments'}
              </Typography>
              <Chip
                label={displayAttachments.length}
                size="small"
                sx={{ height: 20, fontSize: '0.75rem' }}
              />
            </Stack>

            <Stack spacing={1}>
              {displayAttachments.map((attachment) => (
                <AttachmentItem
                  key={attachment.id}
                  attachment={attachment}
                  onPreview={() => handlePreview(attachment)}
                  onDownload={() => handleDownload(attachment)}
                />
              ))}
            </Stack>
          </Paper>
        ) : (
          // Inline variant - compact chips
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {displayAttachments.map((attachment) => (
              <Chip
                key={attachment.id}
                icon={getFileIcon(attachment.contentType, 14)}
                label={attachment.filename}
                size="small"
                onClick={() =>
                  getFileCategory(attachment.contentType) === 'image'
                    ? handlePreview(attachment)
                    : handleDownload(attachment)
                }
                onDelete={() => handleDownload(attachment)}
                deleteIcon={<Download size={14} />}
                sx={{
                  maxWidth: 200,
                  '& .MuiChip-label': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  },
                }}
              />
            ))}
          </Stack>
        )}
      </Box>

      {/* Image Preview Dialog */}
      <ImagePreviewDialog
        open={!!previewAttachment}
        onClose={handleClosePreview}
        attachment={previewAttachment}
        imageUrl={previewUrl}
        isLoading={isLoadingPreview}
      />
    </>
  );
};

export default AttachmentPreview;
