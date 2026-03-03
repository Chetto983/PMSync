/**
 * Email Search Bar Component
 *
 * Phase 6.1: Inline search input with debounce
 * Phase 6.3: Gmail-style filter parsing (from:, to:, subject:, has:attachment, after:, before:)
 * Integrates with email-ui-store for filter state
 *
 * Features:
 * - Debounced input (300ms)
 * - Clear button
 * - Keyboard shortcuts (Escape to clear, Ctrl+K to focus)
 * - Compact inline design
 * - Filter parsing with visual chips
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Box, TextField, InputAdornment, IconButton, Tooltip } from '@mui/material';
import { Search, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailUIStore } from '@/stores/email-ui-store';
import { useDebouncedCallback } from 'use-debounce';
import {
  parseSearchQuery,
  filtersToSearchString,
  type ParsedFilters,
} from '@/lib/utils/search-parser';
import { SearchFilterChips } from './SearchFilterChips';

interface EmailSearchBarProps {
  /** Compact mode for inline toolbar use */
  compact?: boolean;
  /** Placeholder text override */
  placeholder?: string;
}

export function EmailSearchBar({ compact = true, placeholder }: EmailSearchBarProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);

  // Get current search from store
  const currentSearch = useEmailUIStore((state) => state.filters.search);
  const setSearch = useEmailUIStore((state) => state.setSearch);
  const setFilters = useEmailUIStore((state) => state.setFilters);

  // Local state for immediate feedback
  const [inputValue, setInputValue] = useState(currentSearch || '');

  // Parse filters from current input value
  const parsedFilters = useMemo(() => parseSearchQuery(inputValue), [inputValue]);

  // Debounced store update (300ms)
  const debouncedUpdateStore = useDebouncedCallback((value: string) => {
    const parsed = parseSearchQuery(value);
    // Update search string in store
    setSearch(value);
    // Also update structured filters for backend API
    setFilters({
      hasAttachments: parsed.hasAttachment,
      from: parsed.from,
      to: parsed.to,
      subject: parsed.subject,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
    });
  }, 300);

  // Sync local state with store when it changes externally
  // Only update if values differ to avoid cascading renders
  useEffect(() => {
    const storeValue = currentSearch || '';
    if (storeValue !== inputValue) {
      setInputValue(storeValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSearch]);

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      debouncedUpdateStore(value);
    },
    [debouncedUpdateStore]
  );

  // Handle filter removal from chip — cancel pending debounce to avoid race
  const handleRemoveFilter = useCallback(
    (key: keyof ParsedFilters) => {
      debouncedUpdateStore.cancel();
      const newFilters = { ...parsedFilters, [key]: undefined };
      const newSearchString = filtersToSearchString(newFilters);
      setInputValue(newSearchString);
      // Immediately update store (no debounce for chip removal)
      setSearch(newSearchString);
      setFilters({
        hasAttachments: newFilters.hasAttachment,
        from: newFilters.from,
        to: newFilters.to,
        subject: newFilters.subject,
        startDate: newFilters.startDate,
        endDate: newFilters.endDate,
      });
      inputRef.current?.focus();
    },
    [debouncedUpdateStore, parsedFilters, setSearch, setFilters]
  );

  // Clear search — cancel pending debounce first to prevent race condition
  const handleClear = useCallback(() => {
    debouncedUpdateStore.cancel();
    setInputValue('');
    setSearch('');
    setFilters({
      hasAttachments: undefined,
      from: undefined,
      to: undefined,
      subject: undefined,
      startDate: undefined,
      endDate: undefined,
    });
    inputRef.current?.focus();
  }, [debouncedUpdateStore, setSearch, setFilters]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle escape to clear
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && inputValue) {
        e.preventDefault();
        handleClear();
      }
    },
    [inputValue, handleClear]
  );

  // Use enhanced placeholder with filter hint
  const placeholderText =
    placeholder || t.email?.search?.placeholder || 'Search... (try from:john has:attachment)';

  return (
    <Box sx={{ flex: compact ? '0 1 280px' : '1 1 auto', minWidth: compact ? 180 : 200 }}>
      <TextField
        data-testid="email-search"
        inputRef={inputRef}
        size="small"
        variant="outlined"
        placeholder={placeholderText}
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
            endAdornment: inputValue ? (
              <InputAdornment position="end">
                <Tooltip title={t.contacts?.clearFilters || 'Clear'}>
                  <IconButton
                    size="small"
                    onClick={handleClear}
                    edge="end"
                    sx={{ p: 0.25 }}
                  >
                    <X size={14} />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ) : null,
          },
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            height: compact ? 32 : 40,
            borderRadius: 2,
            backgroundColor: 'action.hover',
            '& fieldset': {
              borderColor: 'transparent',
            },
            '&:hover fieldset': {
              borderColor: 'divider',
            },
            '&.Mui-focused fieldset': {
              borderColor: 'primary.main',
              borderWidth: 1,
            },
          },
          '& .MuiInputBase-input': {
            py: 0.5,
            fontSize: '0.8125rem',
          },
        }}
      />
      {/* Display active filter chips below search input */}
      <SearchFilterChips filters={parsedFilters} onRemoveFilter={handleRemoveFilter} />
    </Box>
  );
}

export default EmailSearchBar;
