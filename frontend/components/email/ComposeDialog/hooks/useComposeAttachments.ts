import { useState, useCallback, useRef } from 'react';
import type { EmailAttachmentUpload } from '@/lib/api/email';
import { logger } from '@/lib/logger';
import {
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  isFileTypeAllowed,
  getBase64Size,
} from '../compose-constants';

interface UseComposeAttachmentsOptions {
  attachments: EmailAttachmentUpload[];
  setAttachments: React.Dispatch<React.SetStateAction<EmailAttachmentUpload[]>>;
  onError?: (message: string) => void;
  t: {
    email: {
      composer: {
        fileTooLarge: string;
        fileTypeNotAllowed: string;
        totalSizeExceeded: string;
        uploadError: string;
      };
    };
  };
}

interface UseComposeAttachmentsReturn {
  uploading: boolean;
  isDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRemoveAttachment: (index: number) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
}

/**
 * Hook to manage email attachments with drag-and-drop support
 */
export function useComposeAttachments({
  attachments,
  setAttachments,
  onError,
  t,
}: UseComposeAttachmentsOptions): UseComposeAttachmentsReturn {
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Process files and add them as attachments
   */
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      try {
        const newAttachments: EmailAttachmentUpload[] = [];
        const currentTotalSize = attachments.reduce(
          (sum, att) => sum + getBase64Size(att.contentBase64),
          0
        );
        let runningTotal = currentTotalSize;

        for (const file of Array.from(files)) {
          // Check file type (security whitelist)
          if (!isFileTypeAllowed(file)) {
            onError?.(t.email.composer.fileTypeNotAllowed.replace('{filename}', file.name));
            continue;
          }

          // Check file size (max per file)
          if (file.size > MAX_FILE_SIZE) {
            onError?.(t.email.composer.fileTooLarge.replace('{filename}', file.name));
            continue;
          }

          // Check total size limit
          if (runningTotal + file.size > MAX_TOTAL_SIZE) {
            onError?.(t.email.composer.totalSizeExceeded);
            break;
          }

          // Convert to base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64Content = result.split(',')[1];
              resolve(base64Content);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          runningTotal += file.size;

          newAttachments.push({
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            contentBase64: base64,
          });
        }

        setAttachments((prev) => [...prev, ...newAttachments]);
      } catch (error) {
        logger.error('Failed to process files', { error });
        onError?.(t.email.composer.uploadError);
      } finally {
        setUploading(false);
      }
    },
    [attachments, onError, setAttachments, t]
  );

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      await processFiles(files);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processFiles]
  );

  const handleRemoveAttachment = useCallback(
    (index: number) => {
      setAttachments((prev) => prev.filter((_, i) => i !== index));
    },
    [setAttachments]
  );

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      await processFiles(files);
    },
    [processFiles]
  );

  return {
    uploading,
    isDragging,
    fileInputRef,
    handleFileSelect,
    handleRemoveAttachment,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
}
