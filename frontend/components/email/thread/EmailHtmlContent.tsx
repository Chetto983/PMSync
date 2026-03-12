/**
 * Email HTML Content Component
 *
 * Safely renders HTML email content with:
 * - DOMPurify sanitization to prevent XSS
 * - Shadow DOM for CSS isolation
 * - Dark/light mode support
 * - External link handling (opens in new tab)
 *
 * @see https://github.com/cure53/DOMPurify
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { Box } from '@mui/material';
import DOMPurify from 'dompurify';

/** Inline attachment for CID resolution */
interface InlineAttachment {
  id: string;
  contentId?: string | null;
  /** Filename - can be 'filename' or 'name' depending on source */
  filename?: string | null;
  name?: string | null;
  isInline?: boolean;
}

interface EmailHtmlContentProps {
  /** Raw HTML content from email */
  html: string;
  /** Optional className for container */
  className?: string;
  /** Attachments for resolving cid: URLs */
  attachments?: InlineAttachment[];
}

/**
 * Replace cid: URLs with actual attachment download URLs
 * cid:agenda_icon → /api/email/attachments/{id}/download (Next.js proxy route)
 *
 * Uses Next.js API route to proxy requests with authentication,
 * since img src attributes cannot include Authorization headers.
 *
 * Matching strategy:
 * 1. Exact contentId match (e.g., cid:image001.png@xxx)
 * 2. Filename match without extension (e.g., cid:agenda_icon matches agenda_icon.png)
 * 3. Partial contentId match (e.g., cid:agenda_icon matches <agenda_icon@mailserver>)
 */
function replaceCidUrls(html: string, attachments?: InlineAttachment[]): string {
  if (!attachments || attachments.length === 0) return html;

  // Build multiple lookup maps for flexible matching
  const cidMap = new Map<string, string>(); // contentId → URL
  const filenameMap = new Map<string, string>(); // filename without ext → URL
  const inlineAttachments: InlineAttachment[] = []; // Fallback for inline attachments

  for (const att of attachments) {
    const url = `/api/email/attachments/${att.id}/download`;

    // Map by contentId (cleaned)
    if (att.contentId) {
      // contentId may include angle brackets like <image001.png@xxx>
      const cleanCid = att.contentId.replace(/^<|>$/g, '');
      cidMap.set(cleanCid, url);

      // Also map the part before @ for partial matching
      const cidBeforeAt = cleanCid.split('@')[0];
      if (cidBeforeAt && cidBeforeAt !== cleanCid) {
        cidMap.set(cidBeforeAt, url);
      }
    }

    // Map by filename (without extension) - support both 'filename' and 'name' props
    const filename = att.filename || att.name;
    if (filename) {
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
      filenameMap.set(nameWithoutExt.toLowerCase(), url);
      // Also map full filename
      filenameMap.set(filename.toLowerCase(), url);
    }

    // Track inline attachments for fallback
    if (att.isInline) {
      inlineAttachments.push(att);
    }
  }

  if (cidMap.size === 0 && filenameMap.size === 0) return html;

  // Replace all cid: references in src attributes
  // Handles: src="cid:xxx", src='cid:xxx', src=cid:xxx
  return html.replace(/src=["']?cid:([^"'\s>]+)["']?/gi, (match, cid) => {
    // Strategy 1: Exact contentId match
    let url = cidMap.get(cid);
    if (url) {
      return `src="${url}"`;
    }

    // Strategy 2: Match by filename (case-insensitive)
    url = filenameMap.get(cid.toLowerCase());
    if (url) {
      return `src="${url}"`;
    }

    // Strategy 3: Partial match (cid might be part of contentId)
    for (const [key, value] of cidMap.entries()) {
      if (key.toLowerCase().includes(cid.toLowerCase()) ||
          cid.toLowerCase().includes(key.toLowerCase())) {
        return `src="${value}"`;
      }
    }

    // Keep original if no matching attachment
    return match;
  });
}

/**
 * DOMPurify configuration for email content
 * - Allow safe tags and attributes
 * - Remove scripts, event handlers
 * - Allow data: and cid: URIs for embedded/inline images
 */
const PURIFY_CONFIG = {
  RETURN_TRUSTED_TYPE: false, // Return string, not TrustedHTML
  ALLOWED_TAGS: [
    // Structure
    'div', 'span', 'p', 'br', 'hr',
    // Text formatting
    'b', 'i', 'u', 's', 'strong', 'em', 'mark', 'small', 'del', 'ins', 'sub', 'sup',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Links and images
    'a', 'img',
    // Formatting
    'blockquote', 'pre', 'code', 'cite', 'q',
    // Layout
    'center', 'font', 'address',
    // Semantic
    'article', 'section', 'header', 'footer', 'aside', 'nav', 'main',
    // Media
    'figure', 'figcaption',
    // Style (for inline styles in emails)
    'style',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'width', 'height',
    'style', 'class', 'id',
    'align', 'valign', 'bgcolor', 'border', 'background',
    'cellpadding', 'cellspacing',
    'colspan', 'rowspan',
    'target', 'rel',
    'color', 'face', 'size',
  ],
  // Allow data: URIs for embedded images (base64)
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ['target'],
  // Allow cid: protocol for inline images and data: for embedded
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  // Force all links to open in new tab
  ADD_TAGS: [],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
};

/**
 * Base styles for email content
 * Ensures consistent rendering regardless of email source
 */
const getBaseStyles = (isDark: boolean) => `
  * {
    box-sizing: border-box;
  }
  body, html {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: ${isDark ? '#e0e0e0' : '#333'};
    background: transparent;
  }
  a {
    color: ${isDark ? '#64b5f6' : '#1976d2'};
  }
  a:hover {
    text-decoration: underline;
  }
  img {
    max-width: 100%;
    height: auto;
  }
  table {
    border-collapse: collapse;
    max-width: 100%;
  }
  blockquote {
    margin: 8px 0;
    padding-left: 12px;
    border-left: 3px solid ${isDark ? '#555' : '#ddd'};
    color: ${isDark ? '#aaa' : '#666'};
  }
  pre, code {
    font-family: 'Fira Code', 'Consolas', monospace;
    background: ${isDark ? '#2d2d2d' : '#f5f5f5'};
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 0.9em;
  }
  pre {
    padding: 12px;
    overflow-x: auto;
  }
  hr {
    border: none;
    border-top: 1px solid ${isDark ? '#444' : '#eee'};
    margin: 16px 0;
  }
`;

function normalizeMobileEmailLayout(contentRoot: HTMLElement, hostWidth: number) {
  if (hostWidth > 640) return;

  const tables = Array.from(contentRoot.querySelectorAll('table'));
  for (const table of tables) {
    const width = table.getBoundingClientRect().width;
    if (width <= hostWidth + 8) continue;

    table.style.width = '100%';
    table.style.maxWidth = '100%';
    table.style.marginLeft = '0';
    table.style.marginRight = 'auto';
  }

  const centeredTables = Array.from(
    contentRoot.querySelectorAll('table[align="center"], center > table')
  );
  for (const table of centeredTables) {
    if (!(table instanceof HTMLElement)) continue;
    table.style.width = '100%';
    table.style.maxWidth = '100%';
    table.style.marginLeft = '0';
    table.style.marginRight = 'auto';
  }

  const images = Array.from(contentRoot.querySelectorAll('img'));
  for (const image of images) {
    image.style.maxWidth = '100%';
    image.style.height = 'auto';
  }
}

/**
 * Safely renders HTML email content using Shadow DOM
 *
 * Features:
 * - XSS protection via DOMPurify
 * - CSS isolation via Shadow DOM
 * - Dark/light mode support
 * - External links open in new tab
 */
export function EmailHtmlContent({ html, className, attachments }: EmailHtmlContentProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  // Sanitize HTML with DOMPurify
  // CRITICAL FIX: Wrap hook management in try/finally to prevent global leak
  const sanitizedHtml = useMemo(() => {
    // First, replace cid: URLs with actual attachment download URLs
    const htmlWithResolvedCids = replaceCidUrls(html, attachments);

    // Configure DOMPurify to add target="_blank" to all links
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });

    try {
      return DOMPurify.sanitize(htmlWithResolvedCids, PURIFY_CONFIG) as string;
    } finally {
      // Always remove the hook, even if sanitization throws
      DOMPurify.removeHook('afterSanitizeAttributes');
    }
  }, [html, attachments]);

  // Create shadow root on mount
  useEffect(() => {
    if (!hostRef.current || shadowRootRef.current) return;

    shadowRootRef.current = hostRef.current.attachShadow({ mode: 'open' });
  }, []);

  // Update shadow root content when HTML changes
  useEffect(() => {
    if (!shadowRootRef.current) return;

    const styleElement = document.createElement('style');
    styleElement.textContent = getBaseStyles(isDark);

    const contentWrapper = document.createElement('div');
    contentWrapper.style.width = '100%';
    contentWrapper.style.maxWidth = '100%';
    contentWrapper.style.overflowX = 'auto';
    contentWrapper.innerHTML = sanitizedHtml;

    // Clear and update shadow root
    shadowRootRef.current.innerHTML = '';
    shadowRootRef.current.appendChild(styleElement);
    shadowRootRef.current.appendChild(contentWrapper);

    const hostWidth = hostRef.current?.clientWidth ?? 0;
    if (hostWidth > 0) {
      normalizeMobileEmailLayout(contentWrapper, hostWidth);
    }
  }, [sanitizedHtml, isDark]);

  // Handle link clicks within shadow DOM
  const handleLinkClick = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A') {
      e.preventDefault();
      const href = target.getAttribute('href');
      if (href) {
        if (href.startsWith('mailto:')) {
          window.location.href = href;
        } else if (href.startsWith('http://') || href.startsWith('https://')) {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
    }
  }, []);

  // Add click listener to shadow root
  // CRITICAL FIX: Removed sanitizedHtml from dependencies - click handler doesn't depend on HTML
  // This prevents unnecessary listener re-registration on every HTML change
  useEffect(() => {
    if (!shadowRootRef.current) return;

    const root = shadowRootRef.current;
    root.addEventListener('click', handleLinkClick);

    return () => {
      root.removeEventListener('click', handleLinkClick);
    };
  }, [handleLinkClick]); // Only re-register when handler changes

  return (
    <Box
      ref={hostRef}
      className={className}
      sx={{
        width: '100%',
        minHeight: 50,
        overflow: 'auto',
      }}
    />
  );
}

export default EmailHtmlContent;
