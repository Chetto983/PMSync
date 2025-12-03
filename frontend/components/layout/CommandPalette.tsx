import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  TextField,
  InputAdornment,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  alpha,
  CircularProgress,
} from '@mui/material';
import {
  Search,
  Mail,
  Calendar,
  Users,
  Settings,
  Sparkles,
  FileText,
  Star,
  Inbox,
  Send,
  Archive,
  Trash2,
  Tag,
  Clock,
  ArrowRight,
  Command,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { emailApi, type Email } from '@/lib/api/email';

/**
 * Command item in the palette
 */
interface CommandItem {
  id: string;
  type: 'navigation' | 'action' | 'search' | 'recent';
  icon: React.ReactNode;
  label: string;
  description?: string;
  shortcut?: string;
  path?: string;
  action?: () => void;
  category: string;
}

/**
 * Search result item
 */
interface SearchResult {
  id: string;
  type: 'email';
  icon: React.ReactNode;
  label: string;
  description: string;
  path: string;
}

/**
 * Props for CommandPalette
 */
interface CommandPaletteProps {
  /**
   * Whether the palette is open
   */
  open: boolean;

  /**
   * Callback when palette closes
   */
  onClose: () => void;

  /**
   * Callback to open compose dialog
   */
  onCompose?: () => void;

  /**
   * Callback to open advanced search
   */
  onAdvancedSearch?: () => void;
}

// Local storage key for recent searches
const RECENT_SEARCHES_KEY = 'command-palette-recent-searches';
const MAX_RECENT_SEARCHES = 5;

/**
 * CommandPalette - Global search and command interface
 *
 * Features:
 * - Cmd/Ctrl+K to open
 * - Quick navigation to all app sections
 * - Email search with results
 * - Recent searches history
 * - Keyboard navigation
 *
 * @example
 * ```tsx
 * <CommandPalette
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onCompose={() => setComposeOpen(true)}
 * />
 * ```
 */
export function CommandPalette({
  open,
  onClose,
  onCompose,
  onAdvancedSearch,
}: CommandPaletteProps) {
  const router = useRouter();
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
        if (stored) {
          setRecentSearches(JSON.parse(stored));
        }
      } catch {
        // Ignore parsing errors
      }
    }
  }, []);

  // Save recent search
  const saveRecentSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== searchQuery);
      const updated = [searchQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      if (typeof window !== 'undefined') {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      }
      return updated;
    });
  }, []);

  // Define navigation commands
  const navigationCommands: CommandItem[] = useMemo(() => [
    {
      id: 'nav-inbox',
      type: 'navigation',
      icon: <Inbox size={18} />,
      label: t.dashboard?.folders?.inbox || 'Inbox',
      path: '/dashboard/email',
      category: t.commandPalette?.navigation || 'Navigation',
    },
    {
      id: 'nav-sent',
      type: 'navigation',
      icon: <Send size={18} />,
      label: t.dashboard?.folders?.sent || 'Sent',
      path: '/dashboard/email?folder=sent',
      category: t.commandPalette?.navigation || 'Navigation',
    },
    {
      id: 'nav-drafts',
      type: 'navigation',
      icon: <FileText size={18} />,
      label: t.dashboard?.folders?.drafts || 'Drafts',
      path: '/dashboard/email?folder=drafts',
      category: t.commandPalette?.navigation || 'Navigation',
    },
    {
      id: 'nav-archive',
      type: 'navigation',
      icon: <Archive size={18} />,
      label: t.dashboard?.folders?.archive || 'Archive',
      path: '/dashboard/email?folder=archive',
      category: t.commandPalette?.navigation || 'Navigation',
    },
    {
      id: 'nav-trash',
      type: 'navigation',
      icon: <Trash2 size={18} />,
      label: t.dashboard?.folders?.trash || 'Trash',
      path: '/dashboard/email?folder=trash',
      category: t.commandPalette?.navigation || 'Navigation',
    },
    {
      id: 'nav-starred',
      type: 'navigation',
      icon: <Star size={18} />,
      label: t.dashboard?.folders?.starred || 'Starred',
      path: '/dashboard/email?folder=starred',
      category: t.commandPalette?.navigation || 'Navigation',
    },
    {
      id: 'nav-calendar',
      type: 'navigation',
      icon: <Calendar size={18} />,
      label: t.nav?.calendar || 'Calendar',
      path: '/dashboard/calendar',
      category: t.commandPalette?.navigation || 'Navigation',
    },
    {
      id: 'nav-contacts',
      type: 'navigation',
      icon: <Users size={18} />,
      label: t.nav?.contacts || 'Contacts',
      path: '/dashboard/contacts',
      category: t.commandPalette?.navigation || 'Navigation',
    },
    {
      id: 'nav-ai',
      type: 'navigation',
      icon: <Sparkles size={18} />,
      label: t.ai?.title || 'AI Assistant',
      path: '/dashboard/ai',
      category: t.commandPalette?.navigation || 'Navigation',
    },
    {
      id: 'nav-settings',
      type: 'navigation',
      icon: <Settings size={18} />,
      label: t.nav?.settings || 'Settings',
      path: '/dashboard/settings',
      category: t.commandPalette?.navigation || 'Navigation',
    },
  ], [t]);

  // Define action commands
  const actionCommands: CommandItem[] = useMemo(() => [
    {
      id: 'action-compose',
      type: 'action',
      icon: <Mail size={18} />,
      label: t.common?.compose || 'Compose new email',
      shortcut: 'C',
      action: () => {
        onClose();
        onCompose?.();
      },
      category: t.commandPalette?.actions || 'Actions',
    },
    {
      id: 'action-search',
      type: 'action',
      icon: <Search size={18} />,
      label: t.dashboard?.email?.advancedSearch?.title || 'Advanced search',
      shortcut: '/',
      action: () => {
        onClose();
        onAdvancedSearch?.();
      },
      category: t.commandPalette?.actions || 'Actions',
    },
    {
      id: 'action-labels',
      type: 'action',
      icon: <Tag size={18} />,
      label: t.dashboard?.labels?.manageLabels || 'Manage labels',
      path: '/dashboard/settings?tab=labels',
      category: t.commandPalette?.actions || 'Actions',
    },
  ], [t, onClose, onCompose, onAdvancedSearch]);

  // Search emails (defined before recentCommands which uses it)
  const handleSearchEmails = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await emailApi.listEmails({
        search: searchQuery,
        limit: 5,
      });

      const results: SearchResult[] = (response.data.emails || []).map((email: Email) => ({
        id: email.id,
        type: 'email' as const,
        icon: <Mail size={18} />,
        label: email.subject || '(No subject)',
        description: `From: ${email.from}`,
        path: `/dashboard/email?emailId=${email.id}`,
      }));

      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Recent search commands
  const recentCommands: CommandItem[] = useMemo(() =>
    recentSearches.map((search, index) => ({
      id: `recent-${index}`,
      type: 'recent' as const,
      icon: <Clock size={18} />,
      label: search,
      action: () => {
        setQuery(search);
        handleSearchEmails(search);
      },
      category: t.commandPalette?.recentSearches || 'Recent Searches',
    })),
  [recentSearches, t, handleSearchEmails]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show actions, navigation, and recent searches when no query
      const sections: CommandItem[] = [];

      if (actionCommands.length > 0) {
        sections.push(...actionCommands);
      }
      if (recentCommands.length > 0) {
        sections.push(...recentCommands);
      }
      sections.push(...navigationCommands.slice(0, 5)); // Show first 5 nav items

      return sections;
    }

    const lowerQuery = query.toLowerCase();

    // Filter navigation and action commands
    const matchingCommands = [...navigationCommands, ...actionCommands].filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.description?.toLowerCase().includes(lowerQuery)
    );

    return matchingCommands;
  }, [query, navigationCommands, actionCommands, recentCommands]);

  // Combined items (commands + search results)
  const allItems = useMemo(() => {
    const items: (CommandItem | SearchResult)[] = [...filteredCommands];

    if (searchResults.length > 0) {
      items.push(...searchResults);
    }

    return items;
  }, [filteredCommands, searchResults]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        handleSearchEmails(query);
      }, 300);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, handleSearchEmails]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setSearchResults([]);
      // Focus input after dialog opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // Handle item selection (defined before handleKeyDown which uses it)
  const handleSelectItem = useCallback(
    (item: CommandItem | SearchResult) => {
      if ('action' in item && item.action) {
        item.action();
      } else if (item.path) {
        if (item.type === 'email' || item.type === 'search') {
          saveRecentSearch(query);
        }
        router.push(item.path);
        onClose();
      }
    },
    [router, onClose, query, saveRecentSearch]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, allItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (allItems[selectedIndex]) {
            handleSelectItem(allItems[selectedIndex]);
          } else if (query.trim()) {
            // If no selection but has query, go to email search
            saveRecentSearch(query);
            router.push(`/dashboard/email?search=${encodeURIComponent(query)}`);
            onClose();
          }
          break;
        case 'Escape':
          onClose();
          break;
      }
    },
    [allItems, selectedIndex, query, router, onClose, saveRecentSearch, handleSelectItem]
  );

  // Group items by category for display
  const groupedItems = useMemo(() => {
    const groups: Record<string, (CommandItem | SearchResult)[]> = {};

    allItems.forEach((item) => {
      const category =
        'category' in item ? item.category : t.commandPalette?.emailResults || 'Email Results';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
    });

    return groups;
  }, [allItems, t]);

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allItems.length]);

  // Get flat index for an item
  const getItemIndex = useCallback(
    (item: CommandItem | SearchResult) => {
      return allItems.findIndex((i) => i.id === item.id);
    },
    [allItems]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          position: 'fixed',
          top: '15%',
          m: 0,
          borderRadius: 3,
          maxHeight: '70vh',
          overflow: 'hidden',
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            bgcolor: (theme) => alpha(theme.palette.background.default, 0.8),
            backdropFilter: 'blur(4px)',
          },
        },
      }}
    >
      <Box sx={{ p: 0 }}>
        {/* Search Input */}
        <TextField
          fullWidth
          autoFocus
          inputRef={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.commandPalette?.searchPlaceholder || 'Search emails, navigate, or run commands...'}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={20} style={{ opacity: 0.5 }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {searching && <CircularProgress size={18} />}
                {!searching && (
                  <Chip
                    size="small"
                    label="ESC"
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      bgcolor: 'action.hover',
                    }}
                  />
                )}
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 0,
              py: 1,
              px: 2,
              fontSize: '1rem',
              '& fieldset': {
                border: 'none',
                borderBottom: 1,
                borderColor: 'divider',
                borderRadius: 0,
              },
            },
          }}
        />

        {/* Results */}
        <DialogContent sx={{ p: 0, maxHeight: 400, overflow: 'auto' }}>
          {allItems.length === 0 && query.trim() && !searching && (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t.commandPalette?.noResults || 'No results found'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {t.commandPalette?.pressEnterToSearch || 'Press Enter to search emails'}
              </Typography>
            </Box>
          )}

          {Object.entries(groupedItems).map(([category, items], groupIndex) => (
            <Box key={category}>
              {groupIndex > 0 && <Divider />}
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  px: 2,
                  py: 1,
                  display: 'block',
                  fontWeight: 600,
                  bgcolor: 'action.hover',
                }}
              >
                {category}
              </Typography>
              <List dense disablePadding>
                {items.map((item) => {
                  const itemIndex = getItemIndex(item);
                  const isSelected = itemIndex === selectedIndex;

                  return (
                    <ListItemButton
                      key={item.id}
                      selected={isSelected}
                      onClick={() => handleSelectItem(item)}
                      sx={{
                        py: 1.25,
                        px: 2,
                        '&.Mui-selected': {
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        secondary={'description' in item ? item.description : undefined}
                        primaryTypographyProps={{
                          variant: 'body2',
                          fontWeight: isSelected ? 600 : 400,
                          noWrap: true,
                        }}
                        secondaryTypographyProps={{
                          variant: 'caption',
                          noWrap: true,
                        }}
                      />
                      {'shortcut' in item && item.shortcut && (
                        <Chip
                          size="small"
                          label={item.shortcut}
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            bgcolor: 'action.hover',
                            ml: 1,
                          }}
                        />
                      )}
                      {isSelected && (
                        <ArrowRight size={16} style={{ opacity: 0.5, marginLeft: 8 }} />
                      )}
                    </ListItemButton>
                  );
                })}
              </List>
            </Box>
          ))}
        </DialogContent>

        {/* Footer with keyboard hints */}
        <Box
          sx={{
            px: 2,
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: 'action.hover',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip size="small" label="↑↓" sx={{ height: 20, fontSize: '0.65rem' }} />
            <Typography variant="caption" color="text.secondary">
              {t.commandPalette?.navigate || 'Navigate'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip size="small" label="↵" sx={{ height: 20, fontSize: '0.65rem' }} />
            <Typography variant="caption" color="text.secondary">
              {t.commandPalette?.select || 'Select'}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Command size={12} style={{ opacity: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              K
            </Typography>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}

/**
 * Hook to manage command palette state with global keyboard shortcut
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isOpen, open, close } = useCommandPalette();
 *
 *   return (
 *     <>
 *       <CommandPalette open={isOpen} onClose={close} />
 *       <button onClick={open}>Open Command Palette</button>
 *     </>
 *   );
 * }
 * ```
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Global keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return { isOpen, open, close, toggle };
}
