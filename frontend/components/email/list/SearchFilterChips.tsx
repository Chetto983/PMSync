/**
 * Search Filter Chips Component
 *
 * Displays active search filters as removable chips below the search input.
 * Each chip shows the filter type and value with an icon.
 *
 * @module components/email/list/SearchFilterChips
 */

import { Box, Chip } from '@mui/material';
import { Mail, AtSign, FileText, Paperclip, Calendar } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { ParsedFilters } from '@/lib/utils/search-parser';

interface SearchFilterChipsProps {
  /** Parsed filters from search input */
  filters: ParsedFilters;
  /** Callback when a filter chip is removed */
  onRemoveFilter: (key: keyof ParsedFilters) => void;
}

/**
 * SearchFilterChips displays active filters as removable chips
 *
 * @example
 * <SearchFilterChips
 *   filters={{ from: 'john', hasAttachment: true, query: '' }}
 *   onRemoveFilter={(key) => handleRemove(key)}
 * />
 */
export function SearchFilterChips({
  filters,
  onRemoveFilter,
}: SearchFilterChipsProps) {
  const t = useTranslations();

  // Build chips array from active filters
  const chips: {
    key: keyof ParsedFilters;
    label: string;
    icon: React.ReactNode;
  }[] = [];

  if (filters.from) {
    chips.push({
      key: 'from',
      label: `${t.email?.search?.filters?.from || 'From'}: ${filters.from}`,
      icon: <Mail size={14} />,
    });
  }

  if (filters.to) {
    chips.push({
      key: 'to',
      label: `${t.email?.search?.filters?.to || 'To'}: ${filters.to}`,
      icon: <AtSign size={14} />,
    });
  }

  if (filters.subject) {
    chips.push({
      key: 'subject',
      label: `${t.email?.search?.filters?.subject || 'Subject'}: ${filters.subject}`,
      icon: <FileText size={14} />,
    });
  }

  if (filters.hasAttachment) {
    chips.push({
      key: 'hasAttachment',
      label: t.email?.search?.filters?.hasAttachment || 'Has attachment',
      icon: <Paperclip size={14} />,
    });
  }

  if (filters.startDate) {
    chips.push({
      key: 'startDate',
      label: `${t.email?.search?.filters?.after || 'After'}: ${filters.startDate}`,
      icon: <Calendar size={14} />,
    });
  }

  if (filters.endDate) {
    chips.push({
      key: 'endDate',
      label: `${t.email?.search?.filters?.before || 'Before'}: ${filters.endDate}`,
      icon: <Calendar size={14} />,
    });
  }

  // Return null if no active filters
  if (chips.length === 0) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.5,
        mt: 0.5,
        flexWrap: 'wrap',
      }}
    >
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          size="small"
          icon={chip.icon as React.ReactElement}
          label={chip.label}
          onDelete={() => onRemoveFilter(chip.key)}
          aria-label={`${t.email?.search?.clearFilter || 'Remove filter'}: ${chip.label}`}
          sx={{
            height: 24,
            '& .MuiChip-label': {
              fontSize: '0.75rem',
              px: 0.75,
            },
            '& .MuiChip-icon': {
              ml: 0.5,
              mr: -0.25,
            },
            '& .MuiChip-deleteIcon': {
              fontSize: '1rem',
            },
          }}
        />
      ))}
    </Box>
  );
}

export default SearchFilterChips;
