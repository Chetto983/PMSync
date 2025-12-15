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

