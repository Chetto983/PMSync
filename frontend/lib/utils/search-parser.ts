/**
 * Search Query Parser
 *
 * Parses Gmail-style filter syntax:
 * - from:john@example.com
 * - to:jane@example.com
 * - subject:meeting
 * - has:attachment
 * - after:2024-01-01
 * - before:2024-12-31
 * - "quoted phrase" for exact match
 *
 * @module lib/utils/search-parser
 */

export interface ParsedFilters {
  query: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  startDate?: string; // ISO date string (YYYY-MM-DD)
  endDate?: string; // ISO date string (YYYY-MM-DD)
}

/**
 * Parse search input into structured filters
 * Handles quoted strings and multiple filters
 *
 * @example
 * parseSearchQuery('from:john has:attachment meeting')
 * // => { query: 'meeting', from: 'john', hasAttachment: true }
 *
 * parseSearchQuery('subject:"team meeting" after:2024-01-01')
 * // => { query: '', subject: 'team meeting', startDate: '2024-01-01' }
 */
export function parseSearchQuery(input: string): ParsedFilters {
  const filters: ParsedFilters = { query: '' };

  if (!input?.trim()) {
    return filters;
  }

  // Match quoted strings or non-space tokens
  // Handles: from:"John Doe" subject:meeting "exact phrase"
  const parts = input.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const remainingParts: string[] = [];

  for (const part of parts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) {
      remainingParts.push(part);
      continue;
    }

    const prefix = part.slice(0, colonIndex).toLowerCase();
    const value = part.slice(colonIndex + 1).replace(/^"|"$/g, '');

    // Skip empty values (e.g., "from:" without value)
    if (!value) {
      remainingParts.push(part);
      continue;
    }

    switch (prefix) {
      case 'from':
        filters.from = value;
        break;
      case 'to':
        filters.to = value;
        break;
      case 'subject':
        filters.subject = value;
        break;
      case 'has':
        if (value === 'attachment' || value === 'attachments') {
          filters.hasAttachment = true;
        } else {
          // Unknown has: value, keep as plain text
          remainingParts.push(part);
        }
        break;
      case 'after':
        filters.startDate = parseDate(value);
        if (!filters.startDate) {
          // Invalid date, keep as plain text
          remainingParts.push(part);
        }
        break;
      case 'before':
        filters.endDate = parseDate(value);
        if (!filters.endDate) {
          // Invalid date, keep as plain text
          remainingParts.push(part);
        }
        break;
      default:
        // Unknown prefix, keep as plain text
        remainingParts.push(part);
    }
  }

  filters.query = remainingParts.join(' ');
  return filters;
}

/**
 * Parse date string (YYYY-MM-DD format)
 * Returns undefined for invalid dates
 */
function parseDate(value: string): string | undefined {
  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Validate it's a real date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return value;
    }
  }
  // Could add natural language parsing here (today, yesterday, last week)
  return undefined;
}

/**
 * Reconstruct search string from parsed filters
 * Used when removing a filter chip to regenerate the search input
 *
 * @example
 * filtersToSearchString({ query: 'meeting', from: 'john', hasAttachment: true })
 * // => 'from:john has:attachment meeting'
 */
export function filtersToSearchString(filters: ParsedFilters): string {
  const parts: string[] = [];

  if (filters.from) {
    // Quote if contains spaces
    const value = filters.from.includes(' ') ? `"${filters.from}"` : filters.from;
    parts.push(`from:${value}`);
  }
  if (filters.to) {
    const value = filters.to.includes(' ') ? `"${filters.to}"` : filters.to;
    parts.push(`to:${value}`);
  }
  if (filters.subject) {
    // Always quote subject as it commonly has spaces
    parts.push(`subject:"${filters.subject}"`);
  }
  if (filters.hasAttachment) {
    parts.push('has:attachment');
  }
  if (filters.startDate) {
    parts.push(`after:${filters.startDate}`);
  }
  if (filters.endDate) {
    parts.push(`before:${filters.endDate}`);
  }
  if (filters.query) {
    parts.push(filters.query);
  }

  return parts.join(' ');
}

/**
 * Check if parsed filters have any active filters (excluding plain query)
 */
export function hasActiveFilters(filters: ParsedFilters): boolean {
  return !!(
    filters.from ||
    filters.to ||
    filters.subject ||
    filters.hasAttachment ||
    filters.startDate ||
    filters.endDate
  );
}
