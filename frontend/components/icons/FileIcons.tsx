/**
 * Custom File Type Icons - TailAdmin Style
 *
 * Colorful, styled file type icons matching TailAdmin's design.
 * Each icon is a self-contained SVG component.
 */

import { SvgIcon, type SvgIconProps } from '@mui/material';

/**
 * PDF File Icon - Red document with "PDF" label
 */
export function PdfFileIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 40 40">
      {/* Document shape */}
      <path
        d="M8 4C8 2.89543 8.89543 2 10 2H24L32 10V36C32 37.1046 31.1046 38 30 38H10C8.89543 38 8 37.1046 8 36V4Z"
        fill="#FEE2E2"
      />
      {/* Folded corner */}
      <path
        d="M24 2L32 10H26C24.8954 10 24 9.10457 24 8V2Z"
        fill="#FECACA"
      />
      {/* PDF label background */}
      <rect x="11" y="22" width="18" height="10" rx="2" fill="#DC2626" />
      {/* PDF text */}
      <text
        x="20"
        y="29.5"
        textAnchor="middle"
        fill="white"
        fontSize="6"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        PDF
      </text>
    </SvgIcon>
  );
}

/**
 * Image File Icon - Blue/green landscape picture
 */
export function ImageFileIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 40 40">
      {/* Document shape */}
      <path
        d="M8 4C8 2.89543 8.89543 2 10 2H24L32 10V36C32 37.1046 31.1046 38 30 38H10C8.89543 38 8 37.1046 8 36V4Z"
        fill="#DBEAFE"
      />
      {/* Folded corner */}
      <path
        d="M24 2L32 10H26C24.8954 10 24 9.10457 24 8V2Z"
        fill="#BFDBFE"
      />
      {/* Image preview area */}
      <rect x="11" y="14" width="18" height="14" rx="2" fill="#3B82F6" />
      {/* Sun */}
      <circle cx="16" cy="19" r="2.5" fill="#FCD34D" />
      {/* Mountains */}
      <path d="M11 28L17 21L21 25L25 20L29 28H11Z" fill="#22C55E" />
      <path d="M11 28L15 23L19 28H11Z" fill="#16A34A" />
    </SvgIcon>
  );
}

/**
 * Video File Icon - Purple with play button
 */
export function VideoFileIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 40 40">
      {/* Document shape */}
      <path
        d="M8 4C8 2.89543 8.89543 2 10 2H24L32 10V36C32 37.1046 31.1046 38 30 38H10C8.89543 38 8 37.1046 8 36V4Z"
        fill="#F3E8FF"
      />
      {/* Folded corner */}
      <path
        d="M24 2L32 10H26C24.8954 10 24 9.10457 24 8V2Z"
        fill="#E9D5FF"
      />
      {/* Video preview area */}
      <rect x="11" y="14" width="18" height="14" rx="2" fill="#9333EA" />
      {/* Play button circle */}
      <circle cx="20" cy="21" r="5" fill="white" fillOpacity="0.9" />
      {/* Play triangle */}
      <path d="M18 18.5V23.5L23 21L18 18.5Z" fill="#9333EA" />
    </SvgIcon>
  );
}

/**
 * Audio File Icon - Amber with music note
 */
export function AudioFileIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 40 40">
      {/* Document shape */}
      <path
        d="M8 4C8 2.89543 8.89543 2 10 2H24L32 10V36C32 37.1046 31.1046 38 30 38H10C8.89543 38 8 37.1046 8 36V4Z"
        fill="#FEF3C7"
      />
      {/* Folded corner */}
      <path
        d="M24 2L32 10H26C24.8954 10 24 9.10457 24 8V2Z"
        fill="#FDE68A"
      />
      {/* Music note */}
      <path
        d="M23 14V24C23 25.6569 21.6569 27 20 27C18.3431 27 17 25.6569 17 24C17 22.3431 18.3431 21 20 21C20.7286 21 21.3973 21.2574 21.9231 21.6842V14H23Z"
        fill="#D97706"
      />
      <path
        d="M23 14L27 13V17L23 18V14Z"
        fill="#D97706"
      />
    </SvgIcon>
  );
}

/**
 * Archive/Zip File Icon - Emerald with zipper
 */
export function ArchiveFileIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 40 40">
      {/* Document shape */}
      <path
        d="M8 4C8 2.89543 8.89543 2 10 2H24L32 10V36C32 37.1046 31.1046 38 30 38H10C8.89543 38 8 37.1046 8 36V4Z"
        fill="#ECFDF5"
      />
      {/* Folded corner */}
      <path
        d="M24 2L32 10H26C24.8954 10 24 9.10457 24 8V2Z"
        fill="#D1FAE5"
      />
      {/* Zipper pattern */}
      <rect x="18" y="6" width="4" height="3" fill="#059669" />
      <rect x="18" y="11" width="4" height="3" fill="#059669" />
      <rect x="18" y="16" width="4" height="3" fill="#059669" />
      <rect x="18" y="21" width="4" height="3" fill="#059669" />
      {/* ZIP label */}
      <rect x="13" y="26" width="14" height="8" rx="2" fill="#059669" />
      <text
        x="20"
        y="32"
        textAnchor="middle"
        fill="white"
        fontSize="5"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        ZIP
      </text>
    </SvgIcon>
  );
}

/**
 * Generic Document File Icon - Gray
 */
export function DocumentFileIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 40 40">
      {/* Document shape */}
      <path
        d="M8 4C8 2.89543 8.89543 2 10 2H24L32 10V36C32 37.1046 31.1046 38 30 38H10C8.89543 38 8 37.1046 8 36V4Z"
        fill="#F3F4F6"
      />
      {/* Folded corner */}
      <path
        d="M24 2L32 10H26C24.8954 10 24 9.10457 24 8V2Z"
        fill="#E5E7EB"
      />
      {/* Text lines */}
      <rect x="12" y="14" width="16" height="2" rx="1" fill="#9CA3AF" />
      <rect x="12" y="19" width="14" height="2" rx="1" fill="#9CA3AF" />
      <rect x="12" y="24" width="16" height="2" rx="1" fill="#9CA3AF" />
      <rect x="12" y="29" width="10" height="2" rx="1" fill="#9CA3AF" />
    </SvgIcon>
  );
}

/**
 * Word Document Icon - Blue with "DOC" label
 */
export function WordFileIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 40 40">
      {/* Document shape */}
      <path
        d="M8 4C8 2.89543 8.89543 2 10 2H24L32 10V36C32 37.1046 31.1046 38 30 38H10C8.89543 38 8 37.1046 8 36V4Z"
        fill="#DBEAFE"
      />
      {/* Folded corner */}
      <path
        d="M24 2L32 10H26C24.8954 10 24 9.10457 24 8V2Z"
        fill="#BFDBFE"
      />
      {/* DOC label background */}
      <rect x="11" y="22" width="18" height="10" rx="2" fill="#2563EB" />
      {/* DOC text */}
      <text
        x="20"
        y="29.5"
        textAnchor="middle"
        fill="white"
        fontSize="5.5"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        DOC
      </text>
    </SvgIcon>
  );
}

/**
 * Excel/Spreadsheet Icon - Green with "XLS" label
 */
export function ExcelFileIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 40 40">
      {/* Document shape */}
      <path
        d="M8 4C8 2.89543 8.89543 2 10 2H24L32 10V36C32 37.1046 31.1046 38 30 38H10C8.89543 38 8 37.1046 8 36V4Z"
        fill="#ECFDF5"
      />
      {/* Folded corner */}
      <path
        d="M24 2L32 10H26C24.8954 10 24 9.10457 24 8V2Z"
        fill="#D1FAE5"
      />
      {/* XLS label background */}
      <rect x="11" y="22" width="18" height="10" rx="2" fill="#16A34A" />
      {/* XLS text */}
      <text
        x="20"
        y="29.5"
        textAnchor="middle"
        fill="white"
        fontSize="5.5"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        XLS
      </text>
    </SvgIcon>
  );
}

/**
 * Contact Picture Icon - Cyan with person silhouette
 * For downloading contact photos/avatars
 */
export function ContactPictureIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 40 40">
      {/* Card background */}
      <rect x="4" y="4" width="32" height="32" rx="4" fill="#ECFEFF" />
      {/* Inner frame */}
      <rect x="7" y="7" width="26" height="26" rx="3" fill="#06B6D4" />
      {/* Person circle (head) */}
      <circle cx="20" cy="16" r="5" fill="white" />
      {/* Person body */}
      <path
        d="M12 30C12 25.5817 15.5817 22 20 22C24.4183 22 28 25.5817 28 30V33H12V30Z"
        fill="white"
      />
    </SvgIcon>
  );
}
