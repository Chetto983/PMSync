'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { Command } from 'cmdk';
import { useDebounce } from 'use-debounce';
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
  Loader2,
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
  icon: React.ComponentType<{ size?: number; className?: string }>;
  action: () => void;
  group: 'navigation' | 'actions' | 'ai' | 'productivity' | 'system';
  keywords?: string[];
}

interface SearchResult {
  id: string;
  type: 'email' | 'contact' | 'event';
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const handleLogout = () => authClient.signOut();
  const t = useTranslations();

  // Toggle command palette with Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

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

        // Search emails
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

        // Search contacts
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

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    setSearch('');
    command();
  }, []);

  const commands: CommandItem[] = useMemo(() => [
    // Navigation
    {
      id: 'home',
      name: t.commandPalette.commands.goToDashboard,
      shortcut: '⌘1',
      icon: Home,
      action: () => router.push('/dashboard'),
      group: 'navigation',
      keywords: ['home', 'dashboard', 'main'],
    },
    {
      id: 'inbox',
      name: t.commandPalette.commands.goToInbox,
      shortcut: '⌘2',
      icon: Mail,
      action: () => router.push('/dashboard/email'),
      group: 'navigation',
      keywords: ['email', 'inbox', 'mail'],
    },
    {
      id: 'calendar',
      name: t.commandPalette.commands.goToCalendar,
      shortcut: '⌘3',
      icon: Calendar,
      action: () => router.push('/dashboard/calendar'),
      group: 'navigation',
      keywords: ['calendar', 'events', 'schedule'],
    },
    {
      id: 'contacts',
      name: t.commandPalette.commands.goToContacts,
      shortcut: '⌘4',
      icon: Users,
      action: () => router.push('/dashboard/contacts'),
      group: 'navigation',
      keywords: ['contacts', 'people', 'address'],
    },
    {
      id: 'ai',
      name: t.commandPalette.commands.goToAiAssistant,
      shortcut: '⌘5',
      icon: Sparkles,
      action: () => router.push('/dashboard/ai'),
      group: 'navigation',
      keywords: ['ai', 'assistant', 'smart'],
    },
    {
      id: 'settings',
      name: t.commandPalette.commands.goToSettings,
      shortcut: '⌘,',
      icon: Settings,
      action: () => router.push('/dashboard/settings'),
      group: 'navigation',
      keywords: ['settings', 'preferences', 'config'],
    },
    {
      id: 'analytics',
      name: t.commandPalette.commands.goToAnalytics,
      icon: BarChart3,
      action: () => router.push('/dashboard/analytics'),
      group: 'navigation',
      keywords: ['analytics', 'stats', 'metrics'],
    },

    // Actions
    {
      id: 'compose',
      name: t.commandPalette.commands.composeEmail,
      shortcut: '⌘N',
      icon: PenSquare,
      action: () => router.push('/dashboard/email?compose=true'),
      group: 'actions',
      keywords: ['compose', 'new', 'write', 'email'],
    },
    {
      id: 'search',
      name: t.commandPalette.commands.searchEmails,
      shortcut: '/',
      icon: Search,
      action: () => router.push('/dashboard/email?focus=search'),
      group: 'actions',
      keywords: ['search', 'find', 'look'],
    },

    // AI Features
    {
      id: 'ai-summarize',
      name: t.commandPalette.commands.aiSummarize,
      shortcut: '⇧S',
      icon: Sparkles,
      action: () => {
        window.dispatchEvent(new CustomEvent('command:ai-summarize'));
      },
      group: 'ai',
      keywords: ['summarize', 'summary', 'ai', 'tldr'],
    },
    {
      id: 'ai-reply',
      name: t.commandPalette.commands.aiQuickReply,
      shortcut: '⇧R',
      icon: Reply,
      action: () => {
        window.dispatchEvent(new CustomEvent('command:ai-reply'));
      },
      group: 'ai',
      keywords: ['reply', 'respond', 'ai', 'quick'],
    },
    {
      id: 'ai-compose',
      name: t.commandPalette.commands.aiComposeContext,
      shortcut: '⌘J',
      icon: Wand2,
      action: () => {
        window.dispatchEvent(new CustomEvent('command:ai-compose'));
      },
      group: 'ai',
      keywords: ['compose', 'write', 'ai', 'context'],
    },

    // Productivity
    {
      id: 'followups',
      name: t.commandPalette.commands.viewFollowups,
      icon: Bell,
      action: () => router.push('/dashboard?view=followups'),
      group: 'productivity',
      keywords: ['followup', 'pending', 'waiting'],
    },
    {
      id: 'deadlines',
      name: t.commandPalette.commands.viewDeadlines,
      icon: Clock,
      action: () => router.push('/dashboard?view=deadlines'),
      group: 'productivity',
      keywords: ['deadline', 'due', 'urgent'],
    },
    {
      id: 'stale-contacts',
      name: t.commandPalette.commands.viewStaleContacts,
      icon: AlertTriangle,
      action: () => router.push('/dashboard/contacts?filter=stale'),
      group: 'productivity',
      keywords: ['stale', 'inactive', 'reconnect'],
    },

    // AI Knowledge commands removed — no backend for memories/documents pages

    // System
    {
      id: 'logout',
      name: t.commandPalette.commands.logout,
      icon: LogOut,
      action: () => {
        handleLogout();
        router.push('/auth/login');
      },
      group: 'system',
      keywords: ['logout', 'signout', 'exit'],
    },
  ], [t, router, handleLogout]);

  const groupLabels: Record<string, string> = useMemo(() => ({
    navigation: t.commandPalette.navigation,
    actions: t.commandPalette.actions,
    ai: t.commandPalette.ai,
    productivity: t.commandPalette.productivity,
    system: t.commandPalette.system,
  }), [t]);

  const groupedCommands = commands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.group]) {
        acc[cmd.group] = [];
      }
      acc[cmd.group].push(cmd);
      return acc;
    },
    {} as Record<string, CommandItem[]>,
  );

  // Show search results when searching, commands otherwise
  const hasSearchResults = searchResults.length > 0;
  const showCommands = !search || search.length < 2;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Command Dialog */}
      <div className="absolute left-1/2 top-1/4 w-full max-w-xl -translate-x-1/2">
        <Command
          className="rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          loop
          shouldFilter={showCommands}
        >
          <Command.Input
            placeholder={t.commandPalette.searchPlaceholder}
            className="w-full border-b border-gray-200 bg-transparent px-4 py-4 text-lg outline-none placeholder:text-gray-400 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
            value={search}
            onValueChange={setSearch}
            autoFocus
          />

          <Command.List className="max-h-80 overflow-y-auto p-2">
            {isSearching && (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 size={20} className="animate-spin mr-2" />
                Searching...
              </div>
            )}

            {!isSearching && search.length >= 2 && searchResults.length === 0 && (
              <Command.Empty className="px-4 py-8 text-center text-sm text-gray-500">
                {t.commandPalette.noResults}
              </Command.Empty>
            )}

            {/* Search Results */}
            {hasSearchResults && !isSearching && (
              <Command.Group heading="Search Results" className="mb-2">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Search Results
                </div>
                {searchResults.map((result) => (
                  <Command.Item
                    key={result.id}
                    value={result.id}
                    onSelect={() => runCommand(result.action)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 aria-selected:bg-blue-50 aria-selected:text-blue-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-blue-900/30 dark:aria-selected:text-blue-400"
                  >
                    <result.icon size={18} className="shrink-0 opacity-60" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{result.title}</div>
                      <div className="truncate text-xs text-gray-400">{result.subtitle}</div>
                    </div>
                    <span className="text-xs text-gray-400 capitalize">{result.type}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Commands - shown when not searching or no search results */}
            {showCommands && Object.entries(groupedCommands).map(([group, items]) => (
              <Command.Group
                key={group}
                heading={groupLabels[group]}
                className="mb-2"
              >
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {groupLabels[group]}
                </div>
                {items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.name} ${item.keywords?.join(' ') || ''}`}
                    onSelect={() => runCommand(item.action)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 aria-selected:bg-blue-50 aria-selected:text-blue-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-blue-900/30 dark:aria-selected:text-blue-400"
                  >
                    <item.icon size={18} className="shrink-0 opacity-60" />
                    <span className="flex-1">{item.name}</span>
                    {item.shortcut && (
                      <kbd className="ml-auto rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {item.shortcut}
                      </kbd>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-xs text-gray-400 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">↑↓</kbd>
              <span>{t.commandPalette.navigate}</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">↵</kbd>
              <span>{t.commandPalette.select}</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">esc</kbd>
              <span>{t.commandPalette.close}</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}

export default CommandPalette;
