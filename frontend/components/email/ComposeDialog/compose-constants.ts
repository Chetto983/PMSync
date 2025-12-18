/**
 * Constants for email composition
 */

/** Maximum file size per attachment (10MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum total attachment size (25MB - common email limit) */
export const MAX_TOTAL_SIZE = 25 * 1024 * 1024;

/**
 * Allowed MIME types for attachments (security whitelist)
 * Common document, image, and archive types
 */
export const ALLOWED_FILE_TYPES = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/rtf',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
  // Audio/Video (common formats)
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  // Other common types
  'application/json',
  'application/xml',
]);

/**
 * File extensions whitelist (fallback when MIME type is not available)
 */
export const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'html', 'md', 'rtf',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff',
  'zip', 'rar', '7z', 'gz', 'tar',
  'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov',
  'json', 'xml',
]);

/**
 * Check if a file type is allowed based on MIME type or extension
 */
export function isFileTypeAllowed(file: File): boolean {
  // Check MIME type first
  if (file.type && ALLOWED_FILE_TYPES.has(file.type)) {
    return true;
  }
  // Fallback to extension check
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext ? ALLOWED_EXTENSIONS.has(ext) : false;
}

/**
 * Calculate size from base64 string
 */
export function getBase64Size(base64: string): number {
  // Base64 encoding increases size by ~33%
  return Math.floor((base64.length * 3) / 4);
}
