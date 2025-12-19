import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  File,
} from 'lucide-react';

export function getFileIcon(filename: string, size = 14): React.ReactElement {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return <FileText size={size} />;
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return <ImageIcon size={size} />;
  if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'mpeg', 'mpg'].includes(ext)) return <Video size={size} />;
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) return <Music size={size} />;
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return <FileSpreadsheet size={size} />;
  if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'swift'].includes(ext)) {
    return <FileCode size={size} />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return <FileArchive size={size} />;
  return <File size={size} />;
}

/**
 * Format relative time with locale-aware output.
 * @param dateStr - The date string to format
 * @param locale - Optional locale (defaults to browser locale)
 * @param relativeLabels - Optional localized labels for relative times
 */
export function formatRelativeTime(
  dateStr: string,
  locale?: string,
  relativeLabels?: {
    justNow?: string;
    minutesAgo?: string;
    hoursAgo?: string;
    daysAgo?: string;
  }
): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  const labels = {
    justNow: relativeLabels?.justNow ?? 'Just now',
    minutesAgo: relativeLabels?.minutesAgo ?? '{n}m ago',
    hoursAgo: relativeLabels?.hoursAgo ?? '{n}h ago',
    daysAgo: relativeLabels?.daysAgo ?? '{n}d ago',
  };

  if (diffMins < 1) return labels.justNow;
  if (diffMins < 60) return labels.minutesAgo.replace('{n}', String(diffMins));
  if (diffHours < 24) return labels.hoursAgo.replace('{n}', String(diffHours));
  if (diffDays < 7) return labels.daysAgo.replace('{n}', String(diffDays));
  return date.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
}

