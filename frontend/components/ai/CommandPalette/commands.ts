import type { NextRouter } from 'next/router';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  Clock,
  Handshake,
  Home,
  LogOut,
  Mail,
  PenSquare,
  PlusCircle,
  Reply,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Ticket,
  UserMinus,
  Users,
  Wand2,
  Workflow,
} from 'lucide-react';
import type { AppTranslations } from '@/locales';
import type { CommandGroup, CommandItem } from './types';

export const GROUP_ORDER = ['navigation', 'crm', 'actions', 'ai', 'productivity', 'system'] as const;

export const GROUP_LABELS: Record<CommandGroup, (t: AppTranslations) => string> = {
  navigation: (t) => t.commandPalette.navigation,
  crm: (t) => t.commandPalette.crmNavigation,
  actions: (t) => t.commandPalette.actions,
  ai: (t) => t.commandPalette.ai,
  productivity: (t) => t.commandPalette.productivity,
  system: (t) => t.commandPalette.system,
};

export function buildCommands(
  router: NextRouter,
  t: AppTranslations,
  handleLogout: () => void,
): CommandItem[] {
  return [
    {
      id: 'home',
      name: t.commandPalette.commands.goToDashboard,
      shortcut: 'Cmd+1',
      icon: Home,
      action: () => {
        void router.push('/dashboard');
      },
      group: 'navigation',
      keywords: ['home', 'dashboard', 'main'],
    },
    {
      id: 'inbox',
      name: t.commandPalette.commands.goToInbox,
      shortcut: 'Cmd+2',
      icon: Mail,
      action: () => {
        void router.push('/dashboard/email');
      },
      group: 'navigation',
      keywords: ['email', 'inbox', 'mail'],
    },
    {
      id: 'calendar',
      name: t.commandPalette.commands.goToCalendar,
      shortcut: 'Cmd+3',
      icon: Calendar,
      action: () => {
        void router.push('/dashboard/calendar');
      },
      group: 'navigation',
      keywords: ['calendar', 'events', 'schedule'],
    },
    {
      id: 'contacts',
      name: t.commandPalette.commands.goToContacts,
      shortcut: 'Cmd+4',
      icon: Users,
      action: () => {
        void router.push('/dashboard/contacts');
      },
      group: 'navigation',
      keywords: ['contacts', 'people', 'address'],
    },
    {
      id: 'ai',
      name: t.commandPalette.commands.goToAiAssistant,
      shortcut: 'Cmd+5',
      icon: Sparkles,
      action: () => {
        void router.push('/dashboard/ai');
      },
      group: 'navigation',
      keywords: ['ai', 'assistant', 'smart'],
    },
    {
      id: 'analytics',
      name: t.commandPalette.commands.goToAnalytics,
      icon: BarChart3,
      action: () => {
        void router.push('/dashboard/analytics');
      },
      group: 'navigation',
      keywords: ['analytics', 'stats', 'metrics'],
    },
    {
      id: 'settings',
      name: t.commandPalette.commands.goToSettings,
      shortcut: 'Cmd+,',
      icon: Settings,
      action: () => {
        void router.push('/dashboard/settings');
      },
      group: 'navigation',
      keywords: ['settings', 'preferences', 'config'],
    },
    {
      id: 'crm-pipelines',
      name: t.commandPalette.commands.goToPipelines,
      icon: Workflow,
      action: () => {
        void router.push('/dashboard/crm/pipelines');
      },
      group: 'crm',
      keywords: ['pipelines', 'crm', 'sales', 'funnel'],
    },
    {
      id: 'crm-deals',
      name: t.commandPalette.commands.goToDeals,
      icon: Handshake,
      action: () => {
        void router.push('/dashboard/crm/deals');
      },
      group: 'crm',
      keywords: ['deals', 'crm', 'sales', 'opportunities'],
    },
    {
      id: 'crm-tickets',
      name: t.commandPalette.commands.goToTickets,
      icon: Ticket,
      action: () => {
        void router.push('/dashboard/crm/tickets');
      },
      group: 'crm',
      keywords: ['tickets', 'support', 'issues', 'help'],
    },
    {
      id: 'crm-accounts',
      name: t.commandPalette.commands.goToAccounts,
      icon: Building2,
      action: () => {
        void router.push('/dashboard/crm/accounts');
      },
      group: 'crm',
      keywords: ['accounts', 'companies', 'organizations'],
    },
    {
      id: 'crm-kb',
      name: t.commandPalette.commands.goToKB,
      icon: BookOpen,
      action: () => {
        void router.push('/dashboard/crm/kb');
      },
      group: 'crm',
      keywords: ['knowledge', 'kb', 'articles', 'docs', 'help'],
    },
    {
      id: 'crm-forecast',
      name: t.commandPalette.commands.goToForecast,
      icon: TrendingUp,
      action: () => {
        void router.push('/dashboard/crm/forecast');
      },
      group: 'crm',
      keywords: ['forecast', 'prediction', 'revenue'],
    },
    {
      id: 'crm-churn',
      name: t.commandPalette.commands.goToChurn,
      icon: UserMinus,
      action: () => {
        void router.push('/dashboard/crm/churn');
      },
      group: 'crm',
      keywords: ['churn', 'attrition', 'retention'],
    },
    {
      id: 'crm-service-analytics',
      name: t.commandPalette.commands.goToServiceAnalytics,
      icon: BarChart3,
      action: () => {
        void router.push('/dashboard/crm/service-analytics');
      },
      group: 'crm',
      keywords: ['service', 'analytics', 'metrics', 'support'],
    },
    {
      id: 'crm-ai-governance',
      name: t.commandPalette.commands.goToAiGovernance,
      icon: Shield,
      action: () => {
        void router.push('/dashboard/crm/ai-governance');
      },
      group: 'crm',
      keywords: ['governance', 'ai', 'rules', 'policies'],
    },
    {
      id: 'reminders',
      name: t.commandPalette.commands.goToReminders,
      icon: Bell,
      action: () => {
        void router.push('/dashboard/reminders');
      },
      group: 'crm',
      keywords: ['reminders', 'alerts', 'notifications'],
    },
    {
      id: 'admin',
      name: t.commandPalette.commands.goToAdmin,
      icon: ShieldCheck,
      action: () => {
        void router.push('/dashboard/admin/users');
      },
      group: 'crm',
      keywords: ['admin', 'administration', 'manage'],
    },
    {
      id: 'compose',
      name: t.commandPalette.commands.composeEmail,
      shortcut: 'Cmd+N',
      icon: PenSquare,
      action: () => {
        void router.push('/dashboard/email/compose');
      },
      group: 'actions',
      keywords: ['compose', 'new', 'write', 'email'],
    },
    {
      id: 'search',
      name: t.commandPalette.commands.searchEmails,
      shortcut: '/',
      icon: Search,
      action: () => {
        void router.push('/dashboard/email?focus=search');
      },
      group: 'actions',
      keywords: ['search', 'find', 'look'],
    },
    {
      id: 'create-deal',
      name: t.commandPalette.commands.createDeal,
      icon: PlusCircle,
      action: () => {
        void router.push('/dashboard/crm/deals?action=create');
      },
      group: 'actions',
      keywords: ['new deal', 'create deal', 'add deal'],
    },
    {
      id: 'create-task',
      name: t.commandPalette.commands.createTask,
      icon: PlusCircle,
      action: () => {
        void router.push('/dashboard/reminders?action=create');
      },
      group: 'actions',
      keywords: ['new task', 'create task', 'add task', 'todo'],
    },
    {
      id: 'create-ticket',
      name: t.commandPalette.commands.createTicket,
      icon: PlusCircle,
      action: () => {
        void router.push('/dashboard/crm/tickets?action=create');
      },
      group: 'actions',
      keywords: ['new ticket', 'create ticket', 'support'],
    },
    {
      id: 'create-contact',
      name: t.commandPalette.commands.createContact,
      icon: PlusCircle,
      action: () => {
        void router.push('/dashboard/contacts?action=create');
      },
      group: 'actions',
      keywords: ['new contact', 'create contact', 'add person'],
    },
    {
      id: 'ai-summarize',
      name: t.commandPalette.commands.aiSummarize,
      shortcut: 'Shift+S',
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
      shortcut: 'Shift+R',
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
      shortcut: 'Cmd+J',
      icon: Wand2,
      action: () => {
        window.dispatchEvent(new CustomEvent('command:ai-compose'));
      },
      group: 'ai',
      keywords: ['compose', 'write', 'ai', 'context'],
    },
    {
      id: 'followups',
      name: t.commandPalette.commands.viewFollowups,
      icon: Bell,
      action: () => {
        void router.push('/dashboard/ai/follow-ups');
      },
      group: 'productivity',
      keywords: ['followup', 'pending', 'waiting'],
    },
    {
      id: 'deadlines',
      name: t.commandPalette.commands.viewDeadlines,
      icon: Clock,
      action: () => {
        void router.push('/dashboard/reminders');
      },
      group: 'productivity',
      keywords: ['deadline', 'due', 'urgent'],
    },
    {
      id: 'stale-contacts',
      name: t.commandPalette.commands.viewStaleContacts,
      icon: AlertTriangle,
      action: () => {
        void router.push('/dashboard/contacts?filter=stale');
      },
      group: 'productivity',
      keywords: ['stale', 'inactive', 'reconnect'],
    },
    {
      id: 'logout',
      name: t.commandPalette.commands.logout,
      icon: LogOut,
      action: handleLogout,
      group: 'system',
      keywords: ['logout', 'signout', 'exit'],
    },
  ];
}
