/**
 * Parse and sanitize a comma/semicolon separated list of email addresses.
 * - trims whitespace
 * - ignores empty entries
 * - strips leading `mailto:`
 */
export function cleanEmailAddresses(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((addr) => (addr.toLowerCase().startsWith('mailto:') ? addr.slice(7) : addr));
}

/**
 * Build initial form values from query params.
 */
export function getInitialComposeFromQuery(query: Record<string, string | string[] | undefined>): {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
} {
  return {
    to: typeof query.to === 'string' ? query.to : '',
    cc: typeof query.cc === 'string' ? query.cc : '',
    bcc: typeof query.bcc === 'string' ? query.bcc : '',
    subject: typeof query.subject === 'string' ? query.subject : '',
    bodyHtml: typeof query.body === 'string' ? query.body : '',
  };
}
