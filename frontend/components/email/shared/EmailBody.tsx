import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import DOMPurify from 'dompurify';
import { apiClient } from '@/lib/api-client';
import logger from '@/lib/logger';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Props for EmailBody component
 */
interface EmailBodyProps {
  /**
   * Raw HTML content to render
   */
  html: string;

  /**
   * Whether to enable lazy loading for images
   * @default true
   */
  lazyLoadImages?: boolean;

  /**
   * Root margin for lazy loading (preload distance)
   * @default '200px'
   */
  lazyLoadMargin?: string;

  /**
   * Whether using dark theme
   */
  isDark?: boolean;

  /**
   * Additional sx styles
   */
  sx?: SxProps<Theme>;

  /**
   * Callback when all images have loaded
   */
  onImagesLoaded?: () => void;

  /**
   * Attachment metadata for resolving inline cid images
   */
  attachments?: Array<{
    id: string;
    contentId?: string;
    isInline?: boolean;
  }>;
}

/**
 * Sanitize HTML for email bodies
 * Opens all links in a new tab for security and UX
 * Uses DOMPurify with FORCE_BODY to handle full HTML documents
 */
function sanitizeEmailBody(content: string): string {
  if (typeof window === 'undefined') {
    return content;
  }

  // Use DOMParser to handle malformed HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');

  // Get the body content - DOMParser automatically creates a proper structure
  const bodyContent = doc.body?.innerHTML || '';

  if (!bodyContent || bodyContent.length < 10) {
    // If body is empty, the HTML is severely malformed - return plain text
    const textContent = doc.body?.textContent || content;
    return `<pre style="white-space: pre-wrap; font-family: inherit;">${textContent}</pre>`;
  }

  // Sanitize the extracted body content
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  const sanitized = DOMPurify.sanitize(bodyContent, {
    ADD_ATTR: ['target', 'rel'],
    ADD_TAGS: ['style'],
    ALLOW_DATA_ATTR: true,
  });

  DOMPurify.removeHook('afterSanitizeAttributes');

  return sanitized;
}

function normalizeContentId(value: string): string {
  return value.replace(/^cid:/i, '').replace(/[<>]/g, '').trim().toLowerCase();
}

/**
 * EmailBody - Renders email HTML content with lazy-loaded images
 *
 * Features:
 * - DOMPurify sanitization for XSS protection
 * - Lazy loading for all images using Intersection Observer
 * - Skeleton placeholders while images load
 * - Smooth fade-in transitions
 * - External links open in new tab
 *
 * Best practices (2025):
 * - Native loading="lazy" as baseline
 * - Intersection Observer for precise control
 * - Progressive image loading for better UX
 *
 * @see https://web.dev/articles/lazy-loading-images
 *
 * @example
 * ```tsx
 * <EmailBody
 *   html={email.bodyHtml}
 *   isDark={theme.palette.mode === 'dark'}
 *   lazyLoadImages={true}
 *   onImagesLoaded={() => console.log('All images loaded')}
 * />
 * ```
 */
export const EmailBody: React.FC<EmailBodyProps> = ({
  html,
  lazyLoadImages = true,
  lazyLoadMargin = '200px',
  isDark = false,
  sx,
  onImagesLoaded,
  attachments,
}) => {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const [imagesProcessed, setImagesProcessed] = useState(false);
  const [sanitizedHtml, setSanitizedHtml] = useState('');
  const inlineUrlCacheRef = useRef<Map<string, string>>(new Map());
  const inlineUrlPromisesRef = useRef<Map<string, Promise<string>>>(new Map());

  const inlineAttachmentMap = useMemo(() => {
    const map = new Map<string, { id: string }>();
    (attachments || []).forEach((attachment) => {
      if (!attachment.contentId) return;
      const normalized = normalizeContentId(attachment.contentId);
      if (normalized) {
        map.set(normalized, { id: attachment.id });
      }
    });
    return map;
  }, [attachments]);

  const resolveInlineAttachmentUrl = useCallback(async (attachmentId: string): Promise<string> => {
    const cached = inlineUrlCacheRef.current.get(attachmentId);
    if (cached) {
      return cached;
    }

    const pending = inlineUrlPromisesRef.current.get(attachmentId);
    if (pending) {
      return pending;
    }

    const request = apiClient
      .get<Blob>(`/email/attachments/${attachmentId}/download`, {
        responseType: 'blob',
      })
      .then((response) => {
        const url = URL.createObjectURL(response.data);
        inlineUrlCacheRef.current.set(attachmentId, url);
        inlineUrlPromisesRef.current.delete(attachmentId);
        return url;
      })
      .catch((error) => {
        inlineUrlPromisesRef.current.delete(attachmentId);
        throw error;
      });

    inlineUrlPromisesRef.current.set(attachmentId, request);
    return request;
  }, []);

  // Avoid rendering untrusted HTML during SSR: sanitize after hydration on the client
  useEffect(() => {
    setSanitizedHtml(sanitizeEmailBody(html || ''));
  }, [html]);

  // Get the download image label
  const downloadImageLabel = t.email.view.downloadImage;

  // Process images for lazy loading after initial render
  useEffect(() => {
    const container = containerRef.current;
    if (!container || imagesProcessed || !sanitizedHtml) return;

    // Find all images in the rendered content
    const images = container.querySelectorAll('img');
    if (images.length === 0) {
      setImagesProcessed(true);
      onImagesLoaded?.();
      return;
    }

    let loadedCount = 0;
    const totalImages = images.length;

    // Check if IntersectionObserver is available
    const hasIO = lazyLoadImages && 'IntersectionObserver' in window;

    images.forEach((img) => {
      // Skip if already has loading attribute set
      if (img.hasAttribute('data-lazy-processed')) return;

      // Store original src
      const originalSrc = img.getAttribute('src') || img.src;
      if (!originalSrc || originalSrc.startsWith('data:')) {
        loadedCount++;
        return;
      }

      const isCid = originalSrc.toLowerCase().startsWith('cid:');
      const normalizedCid = isCid ? normalizeContentId(originalSrc) : '';
      const inlineAttachment = isCid ? inlineAttachmentMap.get(normalizedCid) : undefined;
      if (isCid) {
        img.setAttribute('data-inline-cid', normalizedCid);
        img.removeAttribute('src');
      }

      // Mark as processed
      img.setAttribute('data-lazy-processed', 'true');

      // Add native lazy loading attribute
      img.loading = 'lazy';
      img.decoding = 'async';

      // Create wrapper for skeleton effect
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        position: relative;
        display: inline-block;
        max-width: 100%;
        overflow: hidden;
      `;
      wrapper.className = 'email-img-wrapper';

      // Create skeleton placeholder
      const skeleton = document.createElement('div');
      skeleton.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        min-height: 100px;
        background: linear-gradient(90deg,
          ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} 25%,
          ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} 50%,
          ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 4px;
        pointer-events: none;
        transition: opacity 0.3s ease;
      `;
      skeleton.className = 'email-img-skeleton';

      // Create download button overlay
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'email-img-download';
      downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      downloadBtn.title = downloadImageLabel;
      downloadBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: none;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
        z-index: 10;
        padding: 0;
      `;
      downloadBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const imgSrc = img.src;
        if (!imgSrc) return;

        try {
          const response = await fetch(imgSrc);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          // Extract filename from URL or use default
          const urlParts = imgSrc.split('/');
          const fileName = urlParts[urlParts.length - 1]?.split('?')[0] || 'image.png';
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch {
          logger.error('Failed to download image:');
        }
      });

      // Style the image
      img.style.cssText = `
        max-width: 100%;
        height: auto;
        opacity: 0;
        transition: opacity 0.3s ease;
        display: block;
      `;

      // Insert wrapper
      if (img.parentNode) {
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(skeleton);
        wrapper.appendChild(downloadBtn);
        wrapper.appendChild(img);

        // Add hover events to show/hide download button
        wrapper.addEventListener('mouseenter', () => {
          if (img.complete && img.naturalWidth > 0) {
            downloadBtn.style.opacity = '1';
          }
        });
        wrapper.addEventListener('mouseleave', () => {
          downloadBtn.style.opacity = '0';
        });
      }

      // Handle image load
      const handleLoad = () => {
        img.style.opacity = '1';
        skeleton.style.opacity = '0';
        setTimeout(() => skeleton.remove(), 300);
        loadedCount++;
        if (loadedCount >= totalImages) {
          onImagesLoaded?.();
        }
      };

      // Handle image error
      const handleError = () => {
        skeleton.style.opacity = '0';
        setTimeout(() => skeleton.remove(), 300);
        loadedCount++;
        if (loadedCount >= totalImages) {
          onImagesLoaded?.();
        }
      };

      // If image already loaded (cached), show immediately
      if (img.complete && img.naturalWidth > 0) {
        handleLoad();
        return;
      }

      img.addEventListener('load', handleLoad, { once: true });
      img.addEventListener('error', handleError, { once: true });

      const loadImage = () => {
        if (isCid) {
          if (!inlineAttachment) {
            handleError();
            return;
          }
          resolveInlineAttachmentUrl(inlineAttachment.id)
            .then((url) => {
              img.src = url;
            })
            .catch(() => handleError());
          return;
        }

        if (!img.src) {
          img.src = originalSrc;
        }
      };

      // Use Intersection Observer for more precise lazy loading
      if (hasIO) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                loadImage();
                observer.unobserve(entry.target);
              }
            });
          },
          {
            rootMargin: lazyLoadMargin,
            threshold: 0.01,
          }
        );
        observer.observe(wrapper);
      } else {
        loadImage();
      }
    });

    // Add shimmer animation styles if not already present
    if (!document.getElementById('email-img-shimmer-styles')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'email-img-shimmer-styles';
      styleSheet.textContent = `
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `;
      document.head.appendChild(styleSheet);
    }

    setImagesProcessed(true);
  }, [
    sanitizedHtml,
    lazyLoadImages,
    lazyLoadMargin,
    isDark,
    imagesProcessed,
    onImagesLoaded,
    inlineAttachmentMap,
    resolveInlineAttachmentUrl,
    downloadImageLabel,
  ]);

  useEffect(() => {
    const promises = inlineUrlPromisesRef.current;
    const cache = inlineUrlCacheRef.current;

    return () => {
      promises.clear();
      for (const url of cache.values()) {
        URL.revokeObjectURL(url);
      }
      cache.clear();
    };
  }, [sanitizedHtml]);

  // Reset processed state when html changes
  useEffect(() => {
    setImagesProcessed(false);
  }, [html]);

  return (
    <Box
      ref={containerRef}
      sx={{
        // Light background in dark mode for HTML emails
        ...(isDark && {
          bgcolor: '#FAFAFA',
          color: '#1a1a1a',
        }),
        ...(!isDark && {
          color: 'text.primary',
        }),
        // Image styles
        '& img': {
          maxWidth: '100%',
          height: 'auto',
        },
        // Link styles
        '& a': {
          color: isDark ? '#1976d2' : 'primary.main',
          textDecoration: 'underline',
        },
        // Code block styles
        '& pre, & code': {
          backgroundColor: isDark ? '#f5f5f5' : 'rgba(0, 0, 0, 0.05)',
          borderRadius: 1,
          padding: '4px 8px',
          fontSize: '0.9375rem',
        },
        // Typography defaults - 2025 Best Practices: 16px body, 1.5 line-height
        fontSize: '1rem', // 16px - minimum readable size for email bodies
        lineHeight: 1.5, // 24px line-height for 16px font (1.5x ratio)
        letterSpacing: '0.01em', // Slight letter spacing for readability
        // Paragraph spacing
        '& p': {
          marginBottom: '1em',
          marginTop: 0,
        },
        // Heading styles for better hierarchy
        '& h1, & h2, & h3, & h4, & h5, & h6': {
          marginTop: '1.5em',
          marginBottom: '0.5em',
          lineHeight: 1.3,
        },
        // List spacing
        '& ul, & ol': {
          paddingLeft: '1.5em',
          marginBottom: '1em',
        },
        '& li': {
          marginBottom: '0.25em',
        },
        // Word wrap for long URLs
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        ...sx,
      }}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};

export default EmailBody;
