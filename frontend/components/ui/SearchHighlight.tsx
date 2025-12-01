import React, { useMemo } from 'react';
import { Box, alpha, useTheme } from '@mui/material';

/**
 * Props for SearchHighlight component
 */
export interface SearchHighlightProps {
  /**
   * The text content to display
   */
  text: string;

  /**
   * The search query to highlight (can be multiple words)
   */
  query?: string;

  /**
   * Whether highlighting is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Custom highlight background color
   */
  highlightColor?: string;

  /**
   * Custom highlight text color
   */
  highlightTextColor?: string;

  /**
   * Maximum length of text to display (truncates with ellipsis)
   */
  maxLength?: number;

  /**
   * Whether to show the text around the first match (useful for snippets)
   */
  showContext?: boolean;

  /**
   * Number of characters to show before/after match when showContext is true
   * @default 50
   */
  contextLength?: number;

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Component to render as (span, div, etc.)
   * @default 'span'
   */
  component?: React.ElementType;
}

/**
 * Parse a search query into individual search terms
 * Handles quoted phrases and individual words
 */
function parseSearchTerms(query: string): string[] {
  const terms: string[] = [];
  const trimmed = query.trim();

  if (!trimmed) return terms;

  // Match quoted phrases or individual words
  const regex = /"([^"]+)"|(\S+)/g;
  let match;

  while ((match = regex.exec(trimmed)) !== null) {
    // Prefer the quoted group, fallback to unquoted word
    const term = match[1] || match[2];
    if (term && term.length > 0) {
      terms.push(term.toLowerCase());
    }
  }

  return terms;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find all match positions in text
 */
interface MatchPosition {
  start: number;
  end: number;
  term: string;
}

function findMatches(text: string, terms: string[]): MatchPosition[] {
  const matches: MatchPosition[] = [];
  const lowerText = text.toLowerCase();

  for (const term of terms) {
    const escapedTerm = escapeRegExp(term);
    // Match whole words only for better precision
    const regex = new RegExp(`\\b${escapedTerm}|${escapedTerm}\\b|${escapedTerm}`, 'gi');
    let match;

    while ((match = regex.exec(lowerText)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        term,
      });
    }
  }

  // Sort by start position and merge overlapping matches
  matches.sort((a, b) => a.start - b.start);

  const merged: MatchPosition[] = [];
  for (const match of matches) {
    const last = merged[merged.length - 1];
    if (last && match.start <= last.end) {
      // Extend the previous match if overlapping
      last.end = Math.max(last.end, match.end);
    } else {
      merged.push({ ...match });
    }
  }

  return merged;
}

/**
 * SearchHighlight - Highlights search terms in text
 *
 * Features:
 * - Highlights multiple search terms
 * - Supports quoted phrases ("exact phrase")
 * - Merges overlapping highlights
 * - Case-insensitive matching
 * - Optional context extraction for snippets
 * - Customizable highlight colors
 *
 * @example
 * ```tsx
 * // Basic usage
 * <SearchHighlight text="Hello world, welcome!" query="world" />
 *
 * // With multiple terms
 * <SearchHighlight text="Email about project deadline" query="project deadline" />
 *
 * // With exact phrase
 * <SearchHighlight text="The quick brown fox" query='"quick brown"' />
 *
 * // Snippet mode (shows context around match)
 * <SearchHighlight
 *   text={longEmailBody}
 *   query="important"
 *   showContext
 *   contextLength={60}
 * />
 * ```
 */
export function SearchHighlight({
  text,
  query,
  enabled = true,
  highlightColor,
  highlightTextColor,
  maxLength,
  showContext = false,
  contextLength = 50,
  className,
  component: Component = 'span',
}: SearchHighlightProps) {
  const theme = useTheme();

  const defaultHighlightBg = alpha(theme.palette.warning.main, 0.3);
  const defaultHighlightText = theme.palette.text.primary;

  const bgColor = highlightColor || defaultHighlightBg;
  const textColor = highlightTextColor || defaultHighlightText;

  // Parse search terms and find matches
  const { segments, hasMatches, firstMatchIndex } = useMemo(() => {
    if (!enabled || !query?.trim() || !text) {
      return { segments: [{ text, highlight: false }], hasMatches: false, firstMatchIndex: -1 };
    }

    const terms = parseSearchTerms(query);
    if (terms.length === 0) {
      return { segments: [{ text, highlight: false }], hasMatches: false, firstMatchIndex: -1 };
    }

    const matches = findMatches(text, terms);
    if (matches.length === 0) {
      return { segments: [{ text, highlight: false }], hasMatches: false, firstMatchIndex: -1 };
    }

    // Build segments with alternating highlighted/non-highlighted parts
    const result: { text: string; highlight: boolean }[] = [];
    let lastIndex = 0;

    for (const match of matches) {
      // Add non-highlighted text before this match
      if (match.start > lastIndex) {
        result.push({
          text: text.slice(lastIndex, match.start),
          highlight: false,
        });
      }

      // Add highlighted match
      result.push({
        text: text.slice(match.start, match.end),
        highlight: true,
      });

      lastIndex = match.end;
    }

    // Add remaining text after last match
    if (lastIndex < text.length) {
      result.push({
        text: text.slice(lastIndex),
        highlight: false,
      });
    }

    return {
      segments: result,
      hasMatches: true,
      firstMatchIndex: matches[0]?.start ?? -1,
    };
  }, [text, query, enabled]);

  // Handle context extraction (for snippets)
  const displaySegments = useMemo(() => {
    // Only extract context when showContext is true and we have matches
    // Truncation for non-context mode is handled in finalSegments
    if (!showContext || !hasMatches || firstMatchIndex === -1) {
      return segments;
    }

    // Extract context around the first match
    const contextStart = Math.max(0, firstMatchIndex - contextLength);
    const contextEnd = Math.min(text.length, firstMatchIndex + contextLength * 2);

    const contextText = text.slice(contextStart, contextEnd);
    const prefix = contextStart > 0 ? '...' : '';
    const suffix = contextEnd < text.length ? '...' : '';

    // Re-calculate segments for context text
    const terms = parseSearchTerms(query || '');
    const contextMatches = findMatches(contextText, terms);

    const result: { text: string; highlight: boolean }[] = [];

    if (prefix) {
      result.push({ text: prefix, highlight: false });
    }

    let lastIndex = 0;
    for (const match of contextMatches) {
      if (match.start > lastIndex) {
        result.push({
          text: contextText.slice(lastIndex, match.start),
          highlight: false,
        });
      }
      result.push({
        text: contextText.slice(match.start, match.end),
        highlight: true,
      });
      lastIndex = match.end;
    }

    if (lastIndex < contextText.length) {
      result.push({
        text: contextText.slice(lastIndex),
        highlight: false,
      });
    }

    if (suffix) {
      result.push({ text: suffix, highlight: false });
    }

    return result;
  }, [segments, showContext, hasMatches, firstMatchIndex, contextLength, text, query]);

  // Apply maxLength truncation to non-context mode
  const finalSegments = useMemo(() => {
    if (showContext || !maxLength) {
      return displaySegments;
    }

    let totalLength = 0;
    const truncated: { text: string; highlight: boolean }[] = [];

    for (const segment of displaySegments) {
      if (totalLength >= maxLength) break;

      const remaining = maxLength - totalLength;
      if (segment.text.length <= remaining) {
        truncated.push(segment);
        totalLength += segment.text.length;
      } else {
        truncated.push({
          text: segment.text.slice(0, remaining) + '...',
          highlight: segment.highlight,
        });
        totalLength = maxLength;
        break;
      }
    }

    return truncated;
  }, [displaySegments, showContext, maxLength]);

  return (
    <Component className={className}>
      {finalSegments.map((segment, index) =>
        segment.highlight ? (
          <Box
            key={index}
            component="mark"
            sx={{
              backgroundColor: bgColor,
              color: textColor,
              borderRadius: '2px',
              padding: '0 2px',
              // Remove default mark styling
              backgroundImage: 'none',
            }}
          >
            {segment.text}
          </Box>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        )
      )}
    </Component>
  );
}

/**
 * Hook to check if text contains any of the search terms
 */
export function useSearchMatch(text: string, query?: string): boolean {
  return useMemo(() => {
    if (!query?.trim() || !text) return false;

    const terms = parseSearchTerms(query);
    if (terms.length === 0) return false;

    const lowerText = text.toLowerCase();
    return terms.some((term) => lowerText.includes(term));
  }, [text, query]);
}

export default SearchHighlight;
