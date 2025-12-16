'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Command } from 'cmdk';
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
  Brain,
  FileSearch,
  Settings,
  Home,
  BarChart3,
  LogOut,
  Wand2,
  Archive,
  Star,
  Trash2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

interface CommandItem {
  id: string;
  name: string;
  shortcut?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  action: () => void;
  group: 'navigation' | 'actions' | 'ai' | 'productivity' | 'system';
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  // Toggle command palette with Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      // Also open with Escape to close
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const commands: CommandItem[] = [
    // Navigation
    {
      id: 'home',
      name: 'Go to Dashboard',
      shortcut: '⌘1',
      icon: Home,
      action: () => router.push('/dashboard'),
      group: 'navigation',
      keywords: ['home', 'dashboard', 'main'],
    },
    {
      id: 'inbox',
      name: 'Go to Inbox',
      shortcut: '⌘2',
      icon: Mail,
      action: () => router.push('/dashboard/email'),
      group: 'navigation',
      keywords: ['mail', 'email', 'inbox', 'messages'],
    },
    {
      id: 'calendar',
      name: 'Go to Calendar',
      shortcut: '⌘3',
      icon: Calendar,
      action: () => router.push('/dashboard/calendar'),
      group: 'navigation',
      keywords: ['calendar', 'events', 'schedule'],
    },
    {
      id: 'contacts',
      name: 'Go to Contacts',
      shortcut: '⌘4',
      icon: Users,
      action: () => router.push('/dashboard/contacts'),
      group: 'navigation',
      keywords: ['contacts', 'people', 'crm'],
    },
    {
      id: 'ai-assistant',
      name: 'Go to AI Assistant',
      shortcut: '⌘5',
      icon: Sparkles,
      action: () => router.push('/dashboard/ai'),
      group: 'navigation',
      keywords: ['ai', 'assistant', 'chat', 'help'],
    },
    {
      id: 'analytics',
      name: 'Go to Analytics',
      shortcut: '⌘6',
      icon: BarChart3,
      action: () => router.push('/dashboard/analytics'),
      group: 'navigation',
      keywords: ['analytics', 'stats', 'reports'],
    },
    {
      id: 'settings',
      name: 'Go to Settings',
      shortcut: '⌘,',
      icon: Settings,
      action: () => router.push('/dashboard/settings'),
      group: 'navigation',
      keywords: ['settings', 'preferences', 'config'],
    },

    // Actions
    {
      id: 'compose',
      name: 'Compose Email',
      shortcut: '⌘N',
      icon: PenSquare,
      action: () => {
        router.push('/dashboard/email?compose=true');
      },
      group: 'actions',
      keywords: ['compose', 'new', 'write', 'email'],
    },
    {
      id: 'search',
      name: 'Search Emails',
      shortcut: '⌘F',
      icon: Search,
      action: () => {
        router.push('/dashboard/email?search=true');
      },
      group: 'actions',
      keywords: ['search', 'find', 'query'],
    },
    {
      id: 'archive',
      name: 'Archive Selected',
      shortcut: 'E',
      icon: Archive,
      action: () => {
        // Emit custom event for email page to handle
        window.dispatchEvent(new CustomEvent('command:archive'));
      },
      group: 'actions',
      keywords: ['archive', 'move'],
    },
    {
      id: 'star',
      name: 'Toggle Star',
      shortcut: 'S',
      icon: Star,
      action: () => {
        window.dispatchEvent(new CustomEvent('command:star'));
      },
      group: 'actions',
      keywords: ['star', 'favorite', 'important'],
    },
    {
      id: 'delete',
      name: 'Delete Selected',
      shortcut: '#',
      icon: Trash2,
      action: () => {
        window.dispatchEvent(new CustomEvent('command:delete'));
      },
      group: 'actions',
      keywords: ['delete', 'trash', 'remove'],
    },

    // AI Actions
    {
      id: 'ai-summarize',
      name: 'AI: Summarize Email',
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
      name: 'AI: Quick Reply',
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
      name: 'AI: Compose with Context',
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
      name: 'View Follow-ups',
      icon: Bell,
      action: () => router.push('/dashboard?view=followups'),
      group: 'productivity',
      keywords: ['followup', 'pending', 'waiting'],
    },
    {
      id: 'deadlines',
      name: 'View Deadlines',
      icon: Clock,
      action: () => router.push('/dashboard?view=deadlines'),
      group: 'productivity',
      keywords: ['deadline', 'due', 'urgent'],
    },
    {
      id: 'stale-contacts',
      name: 'View Stale Contacts',
      icon: AlertTriangle,
      action: () => router.push('/dashboard/contacts?filter=stale'),
      group: 'productivity',
      keywords: ['stale', 'inactive', 'reconnect'],
    },

    // AI Knowledge
    {
      id: 'search-memories',
      name: 'Search AI Memories',
      icon: Brain,
      action: () => router.push('/dashboard/ai/memories'),
      group: 'ai',
      keywords: ['memory', 'remember', 'knowledge'],
    },
    {
      id: 'search-docs',
      name: 'Search Documents',
      icon: FileSearch,
      action: () => router.push('/dashboard/ai/documents'),
      group: 'ai',
      keywords: ['documents', 'files', 'rag'],
    },

    // System
    {
      id: 'logout',
      name: 'Logout',
      icon: LogOut,
      action: () => {
        logout();
        router.push('/auth/login');
      },
      group: 'system',
      keywords: ['logout', 'signout', 'exit'],
    },
  ];

  const groupLabels: Record<string, string> = {
    navigation: 'Navigation',
    actions: 'Actions',
    ai: 'AI Features',
    productivity: 'Productivity',
    system: 'System',
  };

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
        >
          <Command.Input
            placeholder="Type a command or search..."
            className="w-full border-b border-gray-200 bg-transparent px-4 py-4 text-lg outline-none placeholder:text-gray-400 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
            autoFocus
          />

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-4 py-8 text-center text-sm text-gray-500">
              No results found.
            </Command.Empty>

            {Object.entries(groupedCommands).map(([group, items]) => (
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
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">↵</kbd>
              <span>Select</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">esc</kbd>
              <span>Close</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}

export default CommandPalette;
