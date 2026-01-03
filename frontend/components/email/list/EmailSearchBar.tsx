/**
 * Email Search Bar Component
 *
 * Phase 6.1: Inline search input with debounce
 * Integrates with email-ui-store for filter state
 *
 * Features:
 * - Debounced input (300ms)
 * - Clear button
 * - Keyboard shortcuts (Escape to clear, Ctrl+K to focus)
 * - Compact inline design
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Box, TextField, InputAdornment, IconButton, Tooltip } from '@mui/material';
import { Search, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailUIStore } from '@/stores/email-ui-store';
import { useDebouncedCallback } from 'use-debounce';

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

  // Local state for immediate feedback
  const [inputValue, setInputValue] = useState(currentSearch || '');

  // Debounced store update (300ms)
  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setSearch(value);
  }, 300);

  // Sync local state with store when it changes externally
  useEffect(() => {
    setInputValue(currentSearch || '');
  }, [currentSearch]);

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      debouncedSetSearch(value);
    },
    [debouncedSetSearch]
  );

  // Clear search
  const handleClear = useCallback(() => {
    setInputValue('');
    setSearch('');
    inputRef.current?.focus();
  }, [setSearch]);

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

  const placeholderText = placeholder || t.email?.searchPlaceholder || 'Search emails...';

  return (
    <Box sx={{ flex: compact ? '0 1 280px' : '1 1 auto', minWidth: compact ? 180 : 200 }}>
      <TextField
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
    </Box>
  );
}

export default EmailSearchBar;
