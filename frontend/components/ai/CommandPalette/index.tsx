'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { useDebounce } from 'use-debounce';
import {
  Dialog,
  TextField,
  Box,
  Typography,
  Divider,
  InputAdornment,
  alpha,
} from '@mui/material';
import { Search } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { clearOfflineData } from '@/lib/logout-cleanup';
import { useTranslations } from '@/lib/hooks/use-translations';
import { createLogger } from '@/lib/logger';
import type { CommandGroup, CommandItem, SearchResult } from './types';
import { buildCommands, GROUP_LABELS } from './commands';
import { CommandList } from './CommandList';
import { SearchResults } from './SearchResults';
import { useCommandSearch } from './use-command-search';

const logger = createLogger('CommandPalette');

function HintBadge({ keys, label }: { keys: string; label: string }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        component="kbd"
        sx={{
          bgcolor: (theme) => alpha(theme.palette.text.primary, 0.06),
          borderRadius: 1,
          px: 0.75,
          py: 0.25,
          fontSize: '0.7rem',
          fontWeight: 400,
          fontFamily: 'inherit',
        }}
      >
        {keys}
      </Box>
      <Typography variant="caption" sx={{ fontSize: '0.75rem' }} color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useTranslations();

  const handleLogout = useCallback(async () => {
    await clearOfflineData();
    const result = await authClient.signOut();
    if (result.error) {
      logger.warn('Sign out returned an error', { message: result.error.message });
    }
    await router.replace('/auth/login');
  }, [router]);

  const commands = useMemo(
    () => buildCommands(router, t, handleLogout),
    [router, t, handleLogout],
  );

  const { results: searchResults, isSearching, hasError } = useCommandSearch(debouncedSearch);

  const groupLabels = useMemo(
    () => Object.fromEntries(Object.entries(GROUP_LABELS).map(([k, fn]) => [k, fn(t)])) as Record<CommandGroup, string>,
    [t],
  );

  // Filter commands by search query
  const filteredCommands = useMemo(() => {
    if (!search || search.length < 2) return commands;
    const lower = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lower) ||
        cmd.keywords?.some((kw) => kw.includes(lower)),
    );
  }, [commands, search]);

  const showSearchResults = search.length >= 2;

  const totalSearchResults = searchResults.reduce((sum, g) => sum + g.results.length, 0);
  const totalItems = filteredCommands.length + totalSearchResults;

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch('');
      setFocusedIndex(0);
    }
  }, [open]);

  // Reset focus when items change
  useEffect(() => {
    setFocusedIndex(0);
  }, [totalItems]);

  // Scroll focused item into view
  useEffect(() => {
    if (!scrollAreaRef.current) return;
    const items = scrollAreaRef.current.querySelectorAll<HTMLElement>('[data-command-item]');
    items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const handleCommandSelect = useCallback((cmd: CommandItem) => {
    onClose();
    cmd.action();
  }, [onClose]);

  const handleSearchResultSelect = useCallback((result: SearchResult) => {
    onClose();
    result.action();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (totalItems === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % totalItems);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + totalItems) % totalItems);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex < filteredCommands.length) {
          handleCommandSelect(filteredCommands[focusedIndex]);
        } else {
          // Find search result at offset
          let offset = focusedIndex - filteredCommands.length;
          for (const group of searchResults) {
            if (offset < group.results.length) {
              handleSearchResultSelect(group.results[offset]);
              return;
            }
            offset -= group.results.length;
          }
        }
      }
    },
    [totalItems, focusedIndex, filteredCommands, searchResults, handleCommandSelect, handleSearchResultSelect, onClose],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-label={t.commandPalette.title}
      slotProps={{
        paper: {
          sx: {
            position: 'fixed',
            top: '20%',
            m: 0,
            borderRadius: 3,
            overflow: 'hidden',
            maxHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
          },
        },
        backdrop: {
          sx: { backdropFilter: 'blur(4px)' },
        },
      }}
    >
      {/* Search input */}
      <Box sx={{ px: 2, pt: 2 }}>
        <TextField
          autoFocus
          fullWidth
          variant="outlined"
          placeholder={t.commandPalette.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={20} aria-hidden="true" />
                </InputAdornment>
              ),
              sx: {
                fontSize: '1.1rem',
                '& fieldset': { border: 'none' },
              },
            },
          }}
        />
      </Box>

      <Box
        ref={scrollAreaRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Command list (always visible, filtered when typing) */}
        <CommandList
          commands={filteredCommands}
          focusedIndex={focusedIndex}
          onSelect={handleCommandSelect}
          groupLabels={groupLabels}
        />

        {/* Search results (visible when query >= 2 chars) */}
        {showSearchResults && (
          <>
            <Divider />
            <SearchResults
              groups={searchResults}
              isSearching={isSearching}
              hasError={hasError}
              focusedIndex={focusedIndex}
              onSelect={handleSearchResultSelect}
              commandCount={filteredCommands.length}
            />
          </>
        )}
      </Box>

      {/* Footer hints bar */}
      <Divider />
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', px: 2, py: 1 }}>
        <HintBadge keys={'\u2191\u2193'} label={t.commandPalette.navigate} />
        <HintBadge keys={'\u21B5'} label={t.commandPalette.select} />
        <HintBadge keys="esc" label={t.commandPalette.close} />
      </Box>
    </Dialog>
  );
}

export default CommandPalette;
