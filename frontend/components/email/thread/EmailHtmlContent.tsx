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

interface EmailHtmlContentProps {
  /** Raw HTML content from email */
  html: string;
  /** Optional className for container */
  className?: string;
}

/**
 * DOMPurify configuration for email content
 * - Allow safe tags and attributes
 * - Remove scripts, event handlers
 * - Allow data: URIs for embedded images
 */
const PURIFY_CONFIG = {
  RETURN_TRUSTED_TYPE: false as const, // Return string, not TrustedHTML
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
    'align', 'valign', 'bgcolor', 'border',
    'cellpadding', 'cellspacing',
    'colspan', 'rowspan',
    'target', 'rel',
    'color', 'face', 'size',
  ],
  // Allow data: URIs for embedded images
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
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

/**
 * Safely renders HTML email content using Shadow DOM
 *
 * Features:
 * - XSS protection via DOMPurify
 * - CSS isolation via Shadow DOM
 * - Dark/light mode support
 * - External links open in new tab
 */
export function EmailHtmlContent({ html, className }: EmailHtmlContentProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  // Sanitize HTML with DOMPurify
  // CRITICAL FIX: Wrap hook management in try/finally to prevent global leak
  const sanitizedHtml = useMemo(() => {
    // Configure DOMPurify to add target="_blank" to all links
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });

    try {
      return DOMPurify.sanitize(html, PURIFY_CONFIG);
    } finally {
      // Always remove the hook, even if sanitization throws
      DOMPurify.removeHook('afterSanitizeAttributes');
    }
  }, [html]);

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
    contentWrapper.innerHTML = sanitizedHtml;

    // Clear and update shadow root
    shadowRootRef.current.innerHTML = '';
    shadowRootRef.current.appendChild(styleElement);
    shadowRootRef.current.appendChild(contentWrapper);
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
