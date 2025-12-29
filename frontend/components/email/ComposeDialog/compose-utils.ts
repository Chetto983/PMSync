export function htmlToPlainText(html: string): string {
  if (!html) return '';

  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    try {
      const doc = new window.DOMParser().parseFromString(html, 'text/html');
      return doc.body.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
    } catch {
      // Fall through to regex fallback.
    }
  }

  return html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Sanitize HTML for TipTap editor
 * TipTap StarterKit only supports basic HTML tags.
 * This function converts complex email HTML to TipTap-compatible HTML.
 *
 * Supported tags: p, br, blockquote, ul, ol, li, strong, b, em, i, a, h1-h3
 * Unsupported tags (table, div, span, etc.) are converted to paragraphs or stripped.
 */
export function sanitizeHtmlForTiptap(html: string): string {
  if (!html) return '';

  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    try {
      const doc = new window.DOMParser().parseFromString(html, 'text/html');

      // Remove style and script tags completely
      doc.querySelectorAll('style, script, link, meta').forEach((el) => el.remove());

      // Process the body to extract text content with basic formatting
      const processNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return '';
        }

        const el = node as Element;
        const tagName = el.tagName.toLowerCase();
        const children = Array.from(node.childNodes).map(processNode).join('');

        // Preserve supported tags
        switch (tagName) {
          case 'p':
            return `<p>${children}</p>`;
          case 'br':
            return '<br/>';
          case 'blockquote':
            return `<blockquote>${children}</blockquote>`;
          case 'ul':
            return `<ul>${children}</ul>`;
          case 'ol':
            return `<ol>${children}</ol>`;
          case 'li':
            return `<li>${children}</li>`;
          case 'strong':
          case 'b':
            return `<strong>${children}</strong>`;
          case 'em':
          case 'i':
            return `<em>${children}</em>`;
          case 'a':
            const href = el.getAttribute('href') || '';
            return `<a href="${href}">${children}</a>`;
          case 'h1':
          case 'h2':
          case 'h3':
            return `<${tagName}>${children}</${tagName}>`;
          // Convert block elements - only wrap if children don't contain block elements
          case 'div':
          case 'section':
          case 'article':
          case 'header':
          case 'footer':
          case 'main':
            // Don't wrap if children already contain block-level elements
            if (!children.trim()) return '';
            if (/<(p|h[1-6]|ul|ol|blockquote|div|table|section|article)[\s>]/i.test(children)) {
              return children;
            }
            return `<p>${children}</p>`;
          // Convert table cells to line breaks
          case 'table':
          case 'tbody':
          case 'thead':
          case 'tfoot':
            return children;
          case 'tr':
            if (!children.trim()) return '';
            if (/<p[\s>]/i.test(children)) {
              return children;
            }
            return `<p>${children}</p>`;
          case 'td':
          case 'th':
            return children ? `${children} ` : '';
          // Strip inline elements but keep content
          case 'span':
          case 'font':
          case 'center':
            return children;
          default:
            return children;
        }
      };

      const sanitized = processNode(doc.body);

      // Aggressive cleanup for TipTap compatibility
      return sanitized
        // Remove empty paragraphs
        .replace(/<p>\s*<\/p>/gi, '')
        // Fix nested paragraphs by replacing </p><p> sequences with <br/>
        .replace(/<p>\s*<p>/gi, '<p>')
        .replace(/<\/p>\s*<\/p>/gi, '</p>')
        // Remove excessive line breaks
        .replace(/(<br\s*\/?>\s*){3,}/gi, '<br/><br/>')
        // Remove leading/trailing whitespace in paragraphs
        .replace(/<p>\s+/gi, '<p>')
        .replace(/\s+<\/p>/gi, '</p>')
        .trim();
    } catch {
      // Fall through to regex fallback
    }
  }

  // Regex fallback for server-side rendering
  return html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<table[\s\S]*?>[\s\S]*?<\/table>/gi, (match) => {
      // Extract text from table
      const text = match.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return text ? `<p>${text}</p>` : '';
    })
    .replace(/<div[^>]*>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    // Clean nested paragraphs
    .replace(/<p>\s*<p>/gi, '<p>')
    .replace(/<\/p>\s*<\/p>/gi, '</p>')
    .trim();
}

