'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { useDebounce } from 'use-debounce';
import {
  Dialog,
  TextField,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Typography,
  Box,
  CircularProgress,
  Chip,
  InputAdornment,
  Divider,
  alpha,
} from '@mui/material';
import {
  Mail,
  Calendar,
  Users,
  Sparkles,
  PenSquare,
  Search,
  Reply,
  Bell,
  Clock,
  AlertTriangle,
  Settings,
  Home,
  BarChart3,
  LogOut,
  Wand2,
  User,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import { createLogger } from '@/lib/logger';
import { emailsApi } from '@/lib/api/emails';
import { contactsApi } from '@/lib/api/contacts';

const logger = createLogger('CommandPalette');

interface CommandItem {
  id: string;
  name: string;
  shortcut?: string;
  icon: React.ComponentType<{ size?: number }>;
  action: () => void;
  group: 'navigation' | 'actions' | 'ai' | 'productivity' | 'system';
  keywords?: string[];
}

interface SearchResult {
  id: string;
  type: 'email' | 'contact' | 'event';
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number }>;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();
  const t = useTranslations();

  const handleLogout = useCallback(async () => {
    const result = await authClient.signOut();
    if (result.error) {
      logger.warn('Sign out returned an error', { message: result.error.message });
    }
    await router.replace('/auth/login');
  }, [router]);

  // Toggle command palette with Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSearchResults([]);
      setFocusedIndex(0);
    }
  }, [open]);

  // Real-time search when user types
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        const results: SearchResult[] = [];

        const emails = await emailsApi.searchEmails(debouncedSearch, 5);
        if (emails.length > 0) {
          results.push(
            ...emails.map((email) => ({
              id: `email-${email.id}`,
              type: 'email' as const,
              title: email.subject || '(No subject)',
              subtitle: `${email.from} • ${new Date(email.receivedAt).toLocaleDateString()}`,
              icon: Mail,
              action: () => router.push(`/dashboard/email?id=${email.id}`),
            })),
          );
        }

        const contactResponse = await contactsApi.listContacts({ search: debouncedSearch, limit: 5 });
        if (contactResponse.contacts.length > 0) {
          results.push(
            ...contactResponse.contacts.map((contact) => ({
              id: `contact-${contact.id}`,
              type: 'contact' as const,
              title: contact.displayName || contact.emails?.[0]?.value || 'Unknown',
              subtitle: contact.company || contact.emails?.[0]?.value || '',
              icon: User,
              action: () => router.push(`/dashboard/contacts?id=${contact.id}`),
            })),
          );
        }

        setSearchResults(results);
      } catch (error) {
        logger.error('Search failed', error instanceof Error ? error : { error });
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearch, router]);

  const commands: CommandItem[] = useMemo(() => [
    { id: 'home', name: t.commandPalette.commands.goToDashboard, shortcut: '⌘1', icon: Home, action: () => router.push('/dashboard'), group: 'navigation', keywords: ['home', 'dashboard', 'main'] },
    { id: 'inbox', name: t.commandPalette.commands.goToInbox, shortcut: '⌘2', icon: Mail, action: () => router.push('/dashboard/email'), group: 'navigation', keywords: ['email', 'inbox', 'mail'] },
    { id: 'calendar', name: t.commandPalette.commands.goToCalendar, shortcut: '⌘3', icon: Calendar, action: () => router.push('/dashboard/calendar'), group: 'navigation', keywords: ['calendar', 'events', 'schedule'] },
    { id: 'contacts', name: t.commandPalette.commands.goToContacts, shortcut: '⌘4', icon: Users, action: () => router.push('/dashboard/contacts'), group: 'navigation', keywords: ['contacts', 'people', 'address'] },
    { id: 'ai', name: t.commandPalette.commands.goToAiAssistant, shortcut: '⌘5', icon: Sparkles, action: () => router.push('/dashboard/ai'), group: 'navigation', keywords: ['ai', 'assistant', 'smart'] },
    { id: 'settings', name: t.commandPalette.commands.goToSettings, shortcut: '⌘,', icon: Settings, action: () => router.push('/dashboard/settings'), group: 'navigation', keywords: ['settings', 'preferences', 'config'] },
    { id: 'analytics', name: t.commandPalette.commands.goToAnalytics, icon: BarChart3, action: () => router.push('/dashboard/analytics'), group: 'navigation', keywords: ['analytics', 'stats', 'metrics'] },
    { id: 'compose', name: t.commandPalette.commands.composeEmail, shortcut: '⌘N', icon: PenSquare, action: () => router.push('/dashboard/email?compose=true'), group: 'actions', keywords: ['compose', 'new', 'write', 'email'] },
    { id: 'search', name: t.commandPalette.commands.searchEmails, shortcut: '/', icon: Search, action: () => router.push('/dashboard/email?focus=search'), group: 'actions', keywords: ['search', 'find', 'look'] },
    { id: 'ai-summarize', name: t.commandPalette.commands.aiSummarize, shortcut: '⇧S', icon: Sparkles, action: () => { window.dispatchEvent(new CustomEvent('command:ai-summarize')); }, group: 'ai', keywords: ['summarize', 'summary', 'ai', 'tldr'] },
    { id: 'ai-reply', name: t.commandPalette.commands.aiQuickReply, shortcut: '⇧R', icon: Reply, action: () => { window.dispatchEvent(new CustomEvent('command:ai-reply')); }, group: 'ai', keywords: ['reply', 'respond', 'ai', 'quick'] },
    { id: 'ai-compose', name: t.commandPalette.commands.aiComposeContext, shortcut: '⌘J', icon: Wand2, action: () => { window.dispatchEvent(new CustomEvent('command:ai-compose')); }, group: 'ai', keywords: ['compose', 'write', 'ai', 'context'] },
    { id: 'followups', name: t.commandPalette.commands.viewFollowups, icon: Bell, action: () => router.push('/dashboard?view=followups'), group: 'productivity', keywords: ['followup', 'pending', 'waiting'] },
    { id: 'deadlines', name: t.commandPalette.commands.viewDeadlines, icon: Clock, action: () => router.push('/dashboard?view=deadlines'), group: 'productivity', keywords: ['deadline', 'due', 'urgent'] },
    { id: 'stale-contacts', name: t.commandPalette.commands.viewStaleContacts, icon: AlertTriangle, action: () => router.push('/dashboard/contacts?filter=stale'), group: 'productivity', keywords: ['stale', 'inactive', 'reconnect'] },
    { id: 'logout', name: t.commandPalette.commands.logout, icon: LogOut, action: () => { void handleLogout(); }, group: 'system', keywords: ['logout', 'signout', 'exit'] },
  ], [t, router, handleLogout]);

  const groupLabels: Record<string, string> = useMemo(() => ({
    navigation: t.commandPalette.navigation,
    actions: t.commandPalette.actions,
    ai: t.commandPalette.ai,
    productivity: t.commandPalette.productivity,
    system: t.commandPalette.system,
  }), [t]);

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

  const groupedCommands = useMemo(() => {
    return filteredCommands.reduce(
      (acc, cmd) => {
        if (!acc[cmd.group]) acc[cmd.group] = [];
        acc[cmd.group].push(cmd);
        return acc;
      },
      {} as Record<string, CommandItem[]>,
    );
  }, [filteredCommands]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => {
    const hasSearchResults = searchResults.length > 0;
    const showCommands = !search || search.length < 2;

    if (hasSearchResults && !isSearching) {
      return searchResults.map((r) => ({ id: r.id, action: r.action }));
    }
    if (showCommands) {
      return filteredCommands.map((c) => ({ id: c.id, action: c.action }));
    }
    return [];
  }, [searchResults, isSearching, search, filteredCommands]);

  const runCommand = useCallback((action: () => void) => {
    setOpen(false);
    action();
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && flatItems[focusedIndex]) {
        e.preventDefault();
        runCommand(flatItems[focusedIndex].action);
      }
    },
    [flatItems, focusedIndex, runCommand],
  );

  // Reset focus index when items change
  useEffect(() => {
    setFocusedIndex(0);
  }, [flatItems.length]);

  // Scroll focused item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-command-item]');
    items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const hasSearchResults = searchResults.length > 0;
  const showCommands = !search || search.length < 2;

  // Track which flat index each rendered item corresponds to
  let itemCounter = 0;

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            position: 'fixed',
            top: '20%',
            m: 0,
            borderRadius: 3,
            overflow: 'hidden',
            maxHeight: '60vh',
          },
        },
        backdrop: {
          sx: { backdropFilter: 'blur(4px)' },
        },
      }}
      onKeyDown={handleKeyDown}
    >
      <TextField
        autoFocus
        fullWidth
        placeholder={t.commandPalette.searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        variant="outlined"
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={20} />
              </InputAdornment>
            ),
            sx: {
              fontSize: '1.1rem',
              '& fieldset': { border: 'none' },
            },
          },
        }}
        sx={{ px: 1, pt: 1 }}
      />

      <Divider />

      <List
        ref={listRef}
        dense
        sx={{ maxHeight: 320, overflow: 'auto', py: 1, px: 1 }}
      >
        {isSearching && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={20} sx={{ mr: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Searching...
            </Typography>
          </Box>
        )}

        {!isSearching && search.length >= 2 && !hasSearchResults && filteredCommands.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: 'center', py: 4 }}
          >
            {t.commandPalette.noResults}
          </Typography>
        )}

        {/* Search Results */}
        {hasSearchResults && !isSearching && (
          <>
            <ListSubheader
              sx={{
                lineHeight: '28px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'text.secondary',
                bgcolor: 'transparent',
              }}
            >
              Search Results
            </ListSubheader>
            {searchResults.map((result) => {
              const idx = itemCounter++;
              return (
                <ListItemButton
                  key={result.id}
                  data-command-item
                  selected={focusedIndex === idx}
                  onClick={() => runCommand(result.action)}
                  sx={{ borderRadius: 2, mb: 0.25 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <result.icon size={18} />
                  </ListItemIcon>
                  <ListItemText
                    primary={result.title}
                    secondary={result.subtitle}
                    primaryTypographyProps={{ noWrap: true, fontSize: '0.875rem' }}
                    secondaryTypographyProps={{ noWrap: true, fontSize: '0.75rem' }}
                  />
                  <Chip
                    label={result.type}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 20, textTransform: 'capitalize' }}
                  />
                </ListItemButton>
              );
            })}
          </>
        )}

        {/* Commands */}
        {showCommands &&
          Object.entries(groupedCommands).map(([group, items]) => (
            <Box key={group}>
              <ListSubheader
                sx={{
                  lineHeight: '28px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'text.secondary',
                  bgcolor: 'transparent',
                }}
              >
                {groupLabels[group]}
              </ListSubheader>
              {items.map((item) => {
                const idx = itemCounter++;
                return (
                  <ListItemButton
                    key={item.id}
                    data-command-item
                    selected={focusedIndex === idx}
                    onClick={() => runCommand(item.action)}
                    sx={{ borderRadius: 2, mb: 0.25 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <item.icon size={18} />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.name}
                      primaryTypographyProps={{ fontSize: '0.875rem' }}
                    />
                    {item.shortcut && (
                      <Typography
                        component="kbd"
                        variant="caption"
                        sx={{
                          ml: 'auto',
                          px: 1,
                          py: 0.25,
                          borderRadius: 1,
                          bgcolor: (t) => alpha(t.palette.text.primary, 0.06),
                          color: 'text.secondary',
                          fontFamily: 'inherit',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                        }}
                      >
                        {item.shortcut}
                      </Typography>
                    )}
                  </ListItemButton>
                );
              })}
            </Box>
          ))}
      </List>

      {/* Footer hints */}
      <Divider />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
        }}
      >
        {[
          { key: '↑↓', label: t.commandPalette.navigate },
          { key: '↵', label: t.commandPalette.select },
          { key: 'esc', label: t.commandPalette.close },
        ].map(({ key, label }) => (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography
              component="kbd"
              variant="caption"
              sx={{
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                bgcolor: (t) => alpha(t.palette.text.primary, 0.06),
                fontSize: '0.65rem',
                fontFamily: 'inherit',
              }}
            >
              {key}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Dialog>
  );
}

export default CommandPalette;
